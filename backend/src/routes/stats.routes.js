import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken } from '../middleware/auth.js'
import Decimal from 'decimal.js'
import { descifrarPersona, descifrarPersonas } from '../services/crypto.service.js'

const router = Router()

// Endpoint de notificaciones en tiempo real para solicitudes pendientes y créditos por aprobar
router.get('/notificaciones', verificarToken, async (req, res) => {
    try {
        // 1. Solicitudes públicas: Personas con monto_requerido > 0 que no tienen préstamos
        const publicas = await prisma.persona.findMany({
            where: {
                monto_requerido: { gt: 0 },
                prestamos: { none: {} }
            },
            include: { empresa: true },
            orderBy: { fecha_registro: 'desc' }
        })

        // 2. Préstamos pendientes de aprobación
        const prestamosPendientes = await prisma.prestamo.findMany({
            where: { estado: 'pendiente_aprobacion' },
            include: { persona: true, tipo: true },
            orderBy: { createdAt: 'desc' }
        })

        // Descifrar la información PII de los clientes en las solicitudes
        const publicasDescifradas = descifrarPersonas(publicas)
        const prestamosPendientesDescifrados = prestamosPendientes.map(p => ({
            ...p,
            persona: p.persona ? descifrarPersona(p.persona) : null
        }))

        const totalCount = publicasDescifradas.length + prestamosPendientesDescifrados.length

        res.json({
            publicas: publicasDescifradas,
            prestamosPendientes: prestamosPendientesDescifrados,
            totalCount
        })
    } catch (error) {
        console.error('Error al obtener notificaciones:', error)
        res.status(500).json({ error: 'Error al obtener notificaciones' })
    }
})

router.get('/', verificarToken, async (req, res) => {
    try {
        const hoy = new Date()

        // --- DETECCIÓN DE MORA EN TIEMPO REAL ---
        // Actualizamos cuotas pendientes de préstamos activos o ya en mora
        const cuotasVencidasNow = await prisma.cuotaProgramada.findMany({
            where: {
                estado: 'pendiente',
                fecha_programada: { lt: hoy },
                // Cuotas de préstamos activos o en mora (no cancelados)
                prestamo: { estado: { in: ['activo', 'en_mora'] } }
            },
            include: { prestamo: true }
        })

        if (cuotasVencidasNow.length > 0) {
            // Actualizamos cuotas a vencidas
            const updateCuotas = cuotasVencidasNow.map(c =>
                prisma.cuotaProgramada.update({ where: { id: c.id }, data: { estado: 'vencida' } })
            )
            // Actualizamos préstamos a en_mora (solo si su estado actual en la base de datos es 'activo')
            const prestamoIdsAfectados = [...new Set(
                cuotasVencidasNow
                    .filter(c => c.prestamo && c.prestamo.estado === 'activo')
                    .map(c => c.prestamo_id)
            )]
            const updatePrestamos = prestamoIdsAfectados.map(pid =>
                prisma.prestamo.update({
                    where: { id: pid },
                    data: { estado: 'en_mora' }
                })
            )
            await prisma.$transaction([...updateCuotas, ...updatePrestamos])
        }

        // --- CÁLCULO DE ESTADÍSTICAS ---
        const [personasCount, prestamos, cuotasEnMoraAgg, pagosAgg] = await Promise.all([
            prisma.persona.count({ where: { estado: 'activo' } }),
            prisma.prestamo.findMany({
                where: { estado: { in: ['activo', 'en_mora'] } },
                include: { cuotas: { where: { estado: { in: ['pendiente', 'vencida'] } } } }
            }),
            prisma.cuotaProgramada.aggregate({
                where: { estado: 'vencida' },
                _sum: { cuota_total: true },
                _count: true
            }),
            prisma.registroPago.aggregate({
                _sum: { monto_pagado: true }
            })
        ])

        // Cartera Activa = suma real de cuotas pendientes (saldo vivo)
        const totalCartera = prestamos.reduce((acc, p) => {
            const pendiente = p.cuotas.reduce((sum, c) =>
                new Decimal(sum).plus(c.cuota_total).toNumber(), 0)
            return new Decimal(acc).plus(pendiente).toNumber()
        }, 0)

        const totalRecuperado = parseFloat(pagosAgg._sum.monto_pagado || 0)

        // --- EVOLUCIÓN (Últimos 6 meses) ---
        const hace6Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1)
        const prestamosEvolucion = await prisma.prestamo.findMany({
            where: { createdAt: { gte: hace6Meses } },
            select: { createdAt: true, monto_otorgado: true }
        })

        const mesesLabel = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        const evolucionMap = {}
        for (let i = 5; i >= 0; i--) {
            const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
            const key = `${mesesLabel[d.getMonth()]} ${d.getFullYear()}`
            evolucionMap[key] = 0
        }

        prestamosEvolucion.forEach(p => {
            const d = new Date(p.createdAt)
            const key = `${mesesLabel[d.getMonth()]} ${d.getFullYear()}`
            if (evolucionMap[key] !== undefined) {
                evolucionMap[key] += parseFloat(p.monto_otorgado)
            }
        })

        const dataEvolucion = Object.entries(evolucionMap)
            .map(([name, capital]) => ({ name, capital }))

        // --- DISTRIBUCIÓN POR TIPOS ---
        const tipos = await prisma.tipoPrestamo.findMany({
            include: { _count: { select: { prestamos: true } } }
        })

        const maxCount = Math.max(...tipos.map(tx => tx._count.prestamos), 1)
        const dataRadar = tipos.map(t => ({
            subject: t.nombre,
            A: t._count.prestamos,
            fullMark: maxCount
        }))

        res.json({
            stats: {
                usuarios: personasCount,
                prestamosActivos: prestamos.length,
                totalCartera: Math.round(totalCartera),
                totalRecuperado: Math.round(totalRecuperado),
                cuotasEnMora: cuotasEnMoraAgg._count,
                valorEnMora: parseFloat(cuotasEnMoraAgg._sum.cuota_total || 0)
            },
            dataEvolucion,
            dataRadar
        })
    } catch (error) {
        console.error('Error al obtener estadísticas:', error)
        res.status(500).json({ error: 'Error al obtener estadísticas' })
    }
})

export default router

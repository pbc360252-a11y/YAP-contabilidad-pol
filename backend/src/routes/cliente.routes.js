import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { verificarTokenCliente } from '../middleware/clienteAuth.js'
import { jwtSecret } from '../middleware/auth.js'
import { descifrarPersona } from '../services/crypto.service.js'

const router = Router()

/**
 * POST /api/cliente/auth/login
 * Permite el ingreso del cliente con su Cédula y PIN de 4 dígitos.
 * Soporta ingreso por primera vez con su cédula como PIN temporal.
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { cedula, password } = req.body

        if (!cedula || !password) {
            return res.status(400).json({ error: 'La cédula y la contraseña/PIN son obligatorios.' })
        }

        // Buscar a la persona por su Cédula
        const persona = await prisma.persona.findUnique({
            where: { cedula }
        })

        if (!persona || persona.estado !== 'activo') {
            return res.status(401).json({ error: 'Cédula no registrada o cliente inactivo.' })
        }

        let ingresoExitoso = false
        let requiereRegistroPIN = persona.cambiar_password || !persona.password

        // Si no tiene password guardada, su password por defecto es su Cédula
        if (!persona.password) {
            if (password === cedula) {
                ingresoExitoso = true
                requiereRegistroPIN = true
            } else {
                return res.status(401).json({ 
                    error: 'Contraseña incorrecta. Como es tu primer ingreso, tu PIN temporal es tu número de Cédula.' 
                })
            }
        } else {
            // Comparar el hash guardado con el PIN ingresado
            const pinCorrecto = await bcrypt.compare(password, persona.password)
            if (pinCorrecto) {
                ingresoExitoso = true
            } else {
                return res.status(401).json({ error: 'PIN incorrecto. Por favor, intenta de nuevo.' })
            }
        }

        if (!ingresoExitoso) {
            return res.status(401).json({ error: 'Credenciales inválidas.' })
        }

        // Generar un JWT de larga duración para los clientes (7 días)
        const token = jwt.sign(
            { id: persona.id, role: 'cliente', cedula: persona.cedula },
            jwtSecret,
            { expiresIn: '7d' }
        )

        // Descifrar datos para enviar la información del perfil en claro
        const personaDescifrada = descifrarPersona(persona)
        const nombreCompleto = `${personaDescifrada.primer_nombre} ${personaDescifrada.primer_apellido}`.trim()

        res.json({
            mensaje: 'Ingreso exitoso al Portal de Clientes',
            token,
            requiereRegistroPIN,
            cliente: {
                id: persona.id,
                nombre: nombreCompleto,
                primer_nombre: personaDescifrada.primer_nombre,
                primer_apellido: personaDescifrada.primer_apellido,
                cedula: personaDescifrada.cedula,
                correo: personaDescifrada.correo,
                celular: personaDescifrada.celular,
                foto_url: personaDescifrada.foto_url
            }
        })

    } catch (error) {
        res.status(500).json({ error: 'Error interno en el servidor' })
    }
})

/**
 * POST /api/cliente/perfil/cambiar-pin
 * Permite cambiar el PIN (numérico de 4 dígitos) del cliente autenticado.
 */
router.post('/perfil/cambiar-pin', verificarTokenCliente, async (req, res) => {
    try {
        const { nuevoPin } = req.body

        if (!nuevoPin || !/^\d{4}$/.test(nuevoPin)) {
            return res.status(400).json({ error: 'El PIN debe ser un código numérico de exactamente 4 dígitos.' })
        }

        // Hashear el nuevo PIN
        const salt = await bcrypt.genSalt(10)
        const passwordHash = await bcrypt.hash(nuevoPin, salt)

        // Actualizar en base de datos
        await prisma.persona.update({
            where: { id: req.cliente.id },
            data: {
                password: passwordHash,
                cambiar_password: false
            }
        })

        res.json({ mensaje: 'Tu PIN de seguridad se ha configurado exitosamente.' })
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar PIN de seguridad' })
    }
})

/**
 * GET /api/cliente/dashboard
 * Retorna KPIs financieros consolidados y el estado de la próxima cuota.
 */
router.get('/dashboard', verificarTokenCliente, async (req, res) => {
    try {
        const clienteId = req.cliente.id

        // Obtener préstamos aprobados, activos o en mora
        const prestamos = await prisma.prestamo.findMany({
            where: {
                persona_id: clienteId,
                estado: { in: ['activo', 'en_mora', 'pendiente_aprobacion', 'finalizado'] }
            },
            include: { cuotas: true }
        })

        // Obtener historial de pagos
        const pagos = await prisma.registroPago.findMany({
            where: { persona_id: clienteId }
        })

        // Calcular métricas agregadas
        let totalOtorgado = 0
        let totalAPagar = 0
        let prestamosActivos = 0

        prestamos.forEach(p => {
            if (['activo', 'en_mora'].includes(p.estado)) {
                totalOtorgado += p.monto_otorgado || 0
                totalAPagar += p.total_a_pagar || 0
                prestamosActivos++
            }
        })

        const totalPagado = pagos.reduce((sum, pago) => sum + pago.monto_pagado, 0)
        const saldoPendiente = Math.max(0, totalAPagar - totalPagado)

        // Calcular porcentaje de progreso
        const porcentajeProgreso = totalAPagar > 0 
            ? Math.min(100, Math.round((totalPagado / totalAPagar) * 100)) 
            : 0

        // Buscar la próxima cuota a vencer (de los préstamos activos)
        const todasCuotasPendientes = prestamos
            .filter(p => ['activo', 'en_mora'].includes(p.estado))
            .flatMap(p => p.cuotas)
            .filter(c => c.estado === 'pendiente')

        // Ordenar cuotas por fecha programada (ascendente)
        todasCuotasPendientes.sort((a, b) => new Date(a.fecha_programada) - new Date(b.fecha_programada))
        
        const proximaCuota = todasCuotasPendientes[0] || null
        
        let proximoPago = null
        if (proximaCuota) {
            const fechaCuota = new Date(proximaCuota.fecha_programada)
            const hoy = new Date()
            hoy.setHours(0,0,0,0)
            const diffTime = fechaCuota - hoy
            const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            proximoPago = {
                numero_cuota: proximaCuota.numero_cuota,
                monto: proximaCuota.cuota_total,
                fecha: proximaCuota.fecha_programada,
                dias_restantes: diasRestantes
            }
        }

        res.json({
            resumen: {
                totalOtorgado,
                totalPagado,
                saldoPendiente,
                porcentajeProgreso,
                prestamosActivos,
                prestamosTotales: prestamos.length
            },
            proximoPago,
            prestamosRecientes: prestamos.map(p => ({
                id: p.id,
                codigo: p.codigo,
                monto: p.monto_otorgado,
                estado: p.estado,
                fecha_otorgado: p.fecha_otorgado
            })).slice(0, 3)
        })

    } catch (error) {
        res.status(500).json({ error: 'Error al compilar el Dashboard de cliente' })
    }
})

/**
 * GET /api/cliente/prestamos
 * Retorna todos los préstamos detallados con sus planes de amortización.
 */
router.get('/prestamos', verificarTokenCliente, async (req, res) => {
    try {
        const prestamos = await prisma.prestamo.findMany({
            where: { persona_id: req.cliente.id },
            include: {
                tipo: true,
                cuotas: {
                    orderBy: { numero_cuota: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        res.json({ prestamos })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los préstamos del cliente' })
    }
})

/**
 * GET /api/cliente/pagos
 * Retorna la bitácora completa de abonos y descuentos realizados.
 */
router.get('/pagos', verificarTokenCliente, async (req, res) => {
    try {
        const pagos = await prisma.registroPago.findMany({
            where: { persona_id: req.cliente.id },
            include: {
                prestamo: {
                    select: {
                        codigo: true,
                        tipo: { select: { nombre: true } }
                    }
                }
            },
            orderBy: { fecha_pago: 'desc' }
        })

        res.json({ pagos })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el historial de pagos' })
    }
})

export default router

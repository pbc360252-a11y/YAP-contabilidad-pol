import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import { limpiarTokensExpirados } from './token.service.js'

export const iniciarCronJobs = () => {
    // ── 7 AM diario — Detección de mora (sin N+1) ───────────────────────────
    cron.schedule('0 7 * * *', async () => {
        console.log('[CRON] Ejecutando detección de mora diaria...')
        try {
            const hoy = new Date()

            // 1. Obtener cuotas vencidas con el prestamo_id (solo campos necesarios)
            const pendientes = await prisma.cuotaProgramada.findMany({
                where: {
                    estado: 'pendiente',
                    fecha_programada: { lt: hoy },
                    prestamo: { estado: { in: ['activo', 'en_mora'] } }
                },
                select: { id: true, prestamo_id: true, prestamo: { select: { estado: true } } }
            })

            if (pendientes.length === 0) {
                console.log('[CRON] No se detectaron cuotas vencidas hoy.')
                return
            }

            console.log(`[CRON] ${pendientes.length} cuotas vencidas encontradas. Actualizando en lote...`)

            // 2. Marcar TODAS las cuotas pendientes+vencidas en una sola query
            await prisma.cuotaProgramada.updateMany({
                where: {
                    estado: 'pendiente',
                    fecha_programada: { lt: hoy },
                    prestamo: { estado: { in: ['activo', 'en_mora'] } }
                },
                data: { estado: 'vencida' }
            })

            // 3. IDs únicos de préstamos ACTIVOS que deben pasar a en_mora
            const prestamoIdsActivos = [
                ...new Set(
                    pendientes
                        .filter(c => c.prestamo.estado === 'activo')
                        .map(c => c.prestamo_id)
                )
            ]

            // 4. Actualizar todos esos préstamos de una sola vez
            if (prestamoIdsActivos.length > 0) {
                await prisma.prestamo.updateMany({
                    where: { id: { in: prestamoIdsActivos }, estado: 'activo' },
                    data: { estado: 'en_mora' }
                })
            }

            console.log(`[CRON] Mora actualizada — ${pendientes.length} cuotas, ${prestamoIdsActivos.length} préstamos pasados a en_mora.`)

        } catch (error) {
            console.error('[CRON] Error detectando mora:', error)
        }
    })

    // ── Días 14 y 28 a las 8 AM — Recordatorios quincenales ────────────────
    cron.schedule('0 8 14,28 * *', async () => {
        console.log('[CRON] Ejecutando revisión de cuotas próximas a vencer...')
        try {
            const hoy = new Date()
            const en7Dias = new Date(hoy)
            en7Dias.setDate(hoy.getDate() + 7)

            const proximasAVencer = await prisma.cuotaProgramada.findMany({
                where: {
                    estado: 'pendiente',
                    fecha_programada: { gte: hoy, lte: en7Dias }
                },
                include: { persona: true, prestamo: { include: { tipo: true } } }
            })

            console.log(`[CRON] ${proximasAVencer.length} cuotas vencen en los próximos 7 días.`)
            // TODO: Invocar email.service.js para enviar recordatorios cuando RESEND_API_KEY esté configurada
        } catch (err) {
            console.error('[CRON] Error en recordatorios:', err)
        }
    })

    // ── Medianoche diaria — Corregir préstamos en_mora sin cuotas vencidas ──
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] Verificando consistencia de estados de préstamos...')
        try {
            // Obtener IDs de préstamos en_mora que SÍ tienen cuotas vencidas reales
            const conCuotasVencidas = await prisma.cuotaProgramada.findMany({
                where: { estado: 'vencida', prestamo: { estado: 'en_mora' } },
                select: { prestamo_id: true },
                distinct: ['prestamo_id']
            })
            const idsConMoraReal = conCuotasVencidas.map(c => c.prestamo_id)

            // Pasar a activo todos los en_mora que NO tienen cuotas vencidas
            const resultado = await prisma.prestamo.updateMany({
                where: {
                    estado: 'en_mora',
                    id: { notIn: idsConMoraReal }
                },
                data: { estado: 'activo' }
            })

            if (resultado.count > 0) {
                console.log(`[CRON] ${resultado.count} préstamos corregidos de en_mora a activo.`)
            }
        } catch (err) {
            console.error('[CRON] Error en verificación de consistencia:', err)
        }
    })

    // ── 3 AM diaria — Limpieza de Refresh Tokens expirados ─────────────────
    cron.schedule('0 3 * * *', async () => {
        try {
            const eliminados = await limpiarTokensExpirados()
            if (eliminados > 0) {
                console.log(`[CRON] 🧹 ${eliminados} refresh tokens expirados eliminados de la BD.`)
            }
        } catch (err) {
            console.error('[CRON] Error limpiando tokens expirados:', err)
        }
    })

    console.log('⏳ Cron jobs inicializados correctamente (node-cron)')
}

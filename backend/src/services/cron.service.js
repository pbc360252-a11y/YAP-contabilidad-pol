import cron from 'node-cron'
import { prisma } from '../lib/prisma.js'
import { limpiarTokensExpirados } from './token.service.js'
import { enviarRecordatorioPago } from './email.service.js'

// Zona horaria de Colombia (UTC-5) — Render corre en UTC.
// Sin esto, '0 7 * * *' se ejecutaría a las 2 AM Colombia, no a las 7 AM.
const TZ = { timezone: 'America/Bogota' }

export const iniciarCronJobs = () => {
    // ── 7 AM Colombia — Detección de mora (sin N+1) ─────────────────────────
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
    }, TZ)

    // ── Días 14 y 28 a las 8 AM Colombia — Recordatorios quincenales ────────
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

            // Enviar recordatorio por email a cada deudor en lotes paralelos de 10
            // (evita 200 llamadas HTTP secuenciales a Resend)
            const CHUNK_SIZE = 10
            let enviados = 0
            for (let i = 0; i < proximasAVencer.length; i += CHUNK_SIZE) {
                const chunk = proximasAVencer.slice(i, i + CHUNK_SIZE)
                const resultados = await Promise.allSettled(
                    chunk
                        .filter(cuota => cuota.persona?.correo)
                        .map(cuota => enviarRecordatorioPago({
                            email: cuota.persona.correo,
                            nombreCompleto: `${cuota.persona.primer_nombre} ${cuota.persona.primer_apellido}`,
                            numeroCuota: cuota.numero_cuota,
                            montoCuota: cuota.cuota_total,
                            fechaVencimiento: cuota.fecha_programada,
                            tipoPrestamo: cuota.prestamo?.tipo?.nombre ?? 'Libranza'
                        }))
                )
                resultados.forEach((r, idx) => {
                    if (r.status === 'fulfilled') {
                        enviados++
                    } else {
                        console.warn(`[CRON] Recordatorio fallido (chunk ${i}, idx ${idx}):`, r.reason?.message)
                    }
                })
            }
            console.log(`[CRON] Recordatorios enviados: ${enviados}/${proximasAVencer.length}`)
        } catch (err) {
            console.error('[CRON] Error en recordatorios:', err)
        }
    }, TZ)

    // ── Medianoche Colombia — Corregir préstamos en_mora sin cuotas vencidas ─
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

            // Guard: si no hay cuotas vencidas reales, resetear todos los en_mora
            if (idsConMoraReal.length === 0) {
                const reseteo = await prisma.prestamo.updateMany({
                    where: { estado: 'en_mora' },
                    data: { estado: 'activo' }
                })
                if (reseteo.count > 0) {
                    console.log(`[CRON] ${reseteo.count} préstamos en_mora sin cuotas vencidas → activo.`)
                }
                return
            }

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
    }, TZ)

    // ── 3 AM Colombia — Limpieza de Refresh Tokens expirados ────────────────
    cron.schedule('0 3 * * *', async () => {
        try {
            const eliminados = await limpiarTokensExpirados()
            if (eliminados > 0) {
                console.log(`[CRON] 🧹 ${eliminados} refresh tokens expirados eliminados de la BD.`)
            }
        } catch (err) {
            console.error('[CRON] Error limpiando tokens expirados:', err)
        }
    }, TZ)

    console.log('⏳ Cron jobs inicializados correctamente (node-cron) — Zona horaria: America/Bogota')
}

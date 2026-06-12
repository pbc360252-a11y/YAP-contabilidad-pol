import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { calcularPrestamo, validarTasaUsura } from '../services/financiero.service.js'
import { validate, prestamoCrearSchema } from '../middleware/validate.js'
import { registrarAccion } from '../services/audit.service.js'
import { enviarConfirmacionDesembolso, enviarConfirmacionRegistro } from '../services/email.service.js'
import { descifrarPersona } from '../services/crypto.service.js'

const router = Router()

const addCodigo = (p) => {
    if (!p) return p
    const num = p.numero_prestamo || 0
    return {
        ...p,
        codigo: p.codigo || `LYAP${String(num).padStart(5, '0')}`
    }
}

// Obtener todos (con paginación opcional)
router.get('/', verificarToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 100
        const skip = (page - 1) * limit
        const estado = req.query.estado // filtro opcional por estado

        const where = estado ? { estado } : {}
        const [prestamos, total] = await Promise.all([
            prisma.prestamo.findMany({
                where,
                include: { persona: true, tipo: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.prestamo.count({ where })
        ])
        const descifrados = prestamos.map(p => addCodigo({ ...p, persona: descifrarPersona(p.persona) }))
        res.json({ prestamos: descifrados, total, page, totalPages: Math.ceil(total / limit) })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener préstamos' })
    }
})

// Obtener todos con TODO el detalle (para reportes masivos) — CON PAGINACIÓN
router.get('/todos/detallados', verificarToken, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1)
        const limit = Math.min(500, parseInt(req.query.limit) || 200) // máximo 500 por request
        const skip  = (page - 1) * limit
        const estado = req.query.estado // filtro opcional

        const where = estado ? { estado } : {}

        const [prestamos, total] = await Promise.all([
            prisma.prestamo.findMany({
                where,
                include: {
                    persona: true,
                    tipo: true,
                    tasas_aplicadas: { orderBy: { orden: 'asc' } },
                    cuotas: { orderBy: { numero_cuota: 'asc' } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.prestamo.count({ where })
        ])

        const descifrados = prestamos.map(p => addCodigo({ ...p, persona: descifrarPersona(p.persona) }))
        res.json({
            prestamos: descifrados,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        console.error('[prestamos/todos/detallados]', error)
        res.status(500).json({ error: 'Error al obtener préstamos detallados' })
    }
})

// Obtener detalle de uno (incluye snapshot de tasas)
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const prestamo = await prisma.prestamo.findUnique({
            where: { id: req.params.id },
            include: {
                persona: {
                    include: {
                        empresa: true
                    }
                },
                tipo: true,
                tasas_aplicadas: { orderBy: { orden: 'asc' } },
                cuotas: { orderBy: { numero_cuota: 'asc' } },
                pagos: { orderBy: { fecha_pago: 'desc' } }
            }
        })
        if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' })
        res.json({ prestamo: addCodigo({ ...prestamo, persona: descifrarPersona(prestamo.persona) }) })
    } catch (error) {
        res.status(500).json({ error: 'Error interno' })
    }
})

// Obtener por persona
router.get('/persona/:pid', verificarToken, async (req, res) => {
    try {
        const prestamos = await prisma.prestamo.findMany({
            where: { persona_id: req.params.pid },
            include: { tipo: true },
            orderBy: { createdAt: 'desc' }
        })
        res.json({ prestamos })
    } catch (error) {
        res.status(500).json({ error: 'Error al buscar prestamos de persona' })
    }
})

// Simular Préstamo (GET /api/prestamos/simular?monto=X&cuotas=Y&fecha=Z&tasas=[...])
router.post('/simular', verificarToken, async (req, res) => {
    try {
        const { monto, cuotas, fechaPrimerPago, tasas, metodoAmortizacion, diferirCargos } = req.body

        // Verificar que haya al menos una tasa activa de interés (principal o periódica)
        const tienePrincipal = (tasas || []).some(t =>
            t.activa && (
                t.es_interes_principal === true ||
                (t.tipo_calculo && (t.tipo_calculo.includes('periodico') || t.tipo_calculo.includes('porcentaje')))
            )
        )
        if (!tienePrincipal) {
            return res.status(400).json({ error: 'Debe incluir al menos una tasa de interés activa.' })
        }

        // Advertencia de usura (no bloquea — software a medida)
        if (tasas && tasas.length > 0) {
            const usuraVal = await validarTasaUsura(tasas)
            if (usuraVal.excede) {
                console.warn('[simulacion] Advertencia de usura (no bloqueante):', usuraVal.mensaje)
            }
        }

        // Tasas debe ser un array con el formato de la base de datos o similar para calcularPrestamo
        // El frontend enviará el objeto completo o overrides.

        const calculo = calcularPrestamo({
            montoOtorgado: parseFloat(monto),
            numeroCuotas: parseInt(cuotas),
            fechaPrimerPago: new Date(fechaPrimerPago),
            tasasAsignadas: tasas,
            metodoAmortizacion,
            diferirCargos
        })

        res.json({ calculo })
    } catch (error) {
        res.status(400).json({ error: 'Error en simulación' })
    }
})

// CREACIÓN DE PRÉSTAMO (Motor financiero persistido)
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador']), validate(prestamoCrearSchema), async (req, res) => {
    try {
        const data = req.body
        // data.persona_id, data.tipo_id, data.monto, data.cuotas, data.fechaPrimerPago
        // data.tasasPersonalizadas = [] (viene con los overrides que el admin eligió)

        // Verificar que haya al menos una tasa activa de interés (principal o periódica)
        const tienePrincipal = (data.tasasPersonalizadas || []).some(t =>
            t.activa && (
                t.es_interes_principal === true ||
                (t.tipo_calculo && (t.tipo_calculo.includes('periodico') || t.tipo_calculo.includes('porcentaje')))
            )
        )
        if (!tienePrincipal) {
            return res.status(400).json({ error: 'El préstamo debe tener al menos una tasa de interés activa.' })
        }

        // Advertencia de usura (no bloquea — software a medida)
        const usuraVal = await validarTasaUsura(data.tasasPersonalizadas)
        if (usuraVal.excede) {
            console.warn('[crear-prestamo] Advertencia de usura (no bloqueante):', usuraVal.mensaje)
        }

        // Calcular con motor (fuera de transacción)
        const calculo = calcularPrestamo({
            montoOtorgado: parseFloat(data.monto),
            numeroCuotas: parseInt(data.cuotas),
            fechaPrimerPago: new Date(data.fechaPrimerPago),
            tasasAsignadas: data.tasasPersonalizadas, // Array de objetos modificados
            metodoAmortizacion: data.metodo_amortizacion,
            diferirCargos: data.diferir_cargos
        })

        // Transacción para validar, generar códigos y guardar el Préstamo de forma atómica
        const resultado = await prisma.$transaction(async (tx) => {
            // VALIDACIÓN 1: Máximo 2 préstamos activos (dentro de la transacción)
            const activos = await tx.prestamo.count({
                where: {
                    persona_id: data.persona_id,
                    estado: { in: ['activo', 'en_mora'] }
                }
            })

            if (activos >= 2) {
                throw new Error('Esta persona ya tiene 2 préstamos activos.')
            }

            // Contar cuántos préstamos tiene la persona para N° de Préstamo
            const historialPerson = await tx.prestamo.count({ where: { persona_id: data.persona_id } })
            const numero_prestamo = historialPerson + 1

            // Generar código único global tipo LYAP00001
            const totalGlobal = await tx.prestamo.count()
            const codigo = `LYAP${String(totalGlobal + 1).padStart(5, '0')}`

            const nuevoPrestamo = await tx.prestamo.create({
                data: {
                    persona_id: data.persona_id,
                    tipo_id: data.tipo_id,
                    codigo,
                    numero_prestamo,
                    monto_otorgado: calculo.montoOtorgado,
                    numero_cuotas: calculo.numeroCuotas,
                    metodo_amortizacion: data.metodo_amortizacion || 'lineal',
                    diferir_cargos: data.diferir_cargos !== false,
                    cuota_primera: calculo.cuotaPrimera,
                    cuota_estandar: calculo.cuotaEstandar,
                    cuota_ultima: calculo.cuotaUltima,
                    total_capital: calculo.totalCapital,
                    total_intereses: calculo.totalIntereses,
                    total_cargos: calculo.totalCargosUnicos,
                    total_a_pagar: calculo.totalPagado,
                    costo_financiero: calculo.costoFinanciero,
                    tasa_efectiva_total: calculo.tasaEfectiva,
                    fecha_primer_pago: new Date(data.fechaPrimerPago),
                    fecha_ultimo_pago: new Date(calculo.fechaUltimoPago),
                    proximo_pago: new Date(data.fechaPrimerPago),
                    estado: 'activo', // O 'pendiente_aprobacion' si el negocio exige 2 pasos
                    creado_por: req.usuario.id,
                    // Snapshot Tasas
                    tasas_aplicadas: {
                        create: data.tasasPersonalizadas
                            .filter(t => t.activa) // Solo guardar las activas
                            .map((t, idx) => ({
                                tasa_id: t.id?.startsWith('adhoc-') ? null : t.id,
                                nombre_snapshot: t.nombre_snapshot ?? t.nombre,
                                tipo_calculo_snapshot: t.tipo_calculo_snapshot ?? t.tipo_calculo,
                                valor_snapshot: (() => {
                                    const tipo = t.tipo_calculo_snapshot ?? t.tipo_calculo
                                    let valorRaw = t.valor_snapshot
                                    if (valorRaw === undefined || valorRaw === null || String(valorRaw).trim() === '') {
                                        valorRaw = (tipo === 'monto_fijo') ? (t.valor_fijo ?? 0) : (t.valor_porcentaje ?? 0)
                                    }
                                    const parsed = parseFloat(String(valorRaw).replace(',', '.'))
                                    return isNaN(parsed) ? 0 : parsed
                                })(),
                                aplica_sobre_snapshot: t.aplica_sobre_snapshot ?? t.aplica_sobre ?? 'saldo_pendiente',
                                es_cargo_unico: t.es_cargo_unico ?? false,
                                es_tasa_mora: t.es_tasa_mora ?? false,
                                es_interes_principal: t.es_interes_principal ?? false,
                                activa: true,
                                orden: idx + 1
                            }))
                    },
                    // Generar las 12 (o N) cuotas exactas programadas
                    cuotas: {
                        create: calculo.tablaCuotas.map(c => ({
                            persona_id: data.persona_id,
                            numero_cuota: c.numeroCuota,
                            fecha_programada: new Date(c.fechaPago),
                            saldo_inicio: c.saldoInicio,
                            capital_cuota: c.capitalAbonado,
                            intereses_cuota: c.interesesCobrados,
                            cargos_unicos: c.cargosUnicos,
                            cuota_total: c.cuotaTotal,
                            saldo_final: c.saldoFinal,
                            desglose_tasas: JSON.stringify(c.desglose)
                        }))
                    }
                }
            })

            // Resetear el monto_requerido de la Persona ya que su solicitud ha sido procesada con éxito
            await tx.persona.update({
                where: { id: data.persona_id },
                data: { monto_requerido: 0 }
            })

            return nuevoPrestamo
        })

        // Registrar acción en auditoría
        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'CREAR_PRESTAMO',
            entidad: 'Prestamo',
            entidadId: resultado.id,
            detalles: {
                monto: resultado.monto_otorgado,
                cuotas: resultado.numero_cuotas,
                codigo: resultado.codigo,
                persona_id: resultado.persona_id
            }
        })

        // Enviar correo de confirmación al cliente (no bloquea la respuesta)
        try {
            const persona = await prisma.persona.findUnique({ where: { id: resultado.persona_id } })
            const personaDescifrada = descifrarPersona(persona)
            const correo = personaDescifrada?.correo
            if (correo) {
                const nombreCompleto = `${personaDescifrada.primer_nombre || ''} ${personaDescifrada.primer_apellido || ''}`.trim()
                await enviarConfirmacionDesembolso({
                    email: correo,
                    nombreCompleto,
                    montoDesembolsado: resultado.monto_otorgado,
                    codigoPrestamo: resultado.codigo
                })
                console.log(`[prestamos/crear] ✅ Correo de confirmación enviado a ${correo}`)
            } else {
                console.warn(`[prestamos/crear] ⚠️ La persona no tiene correo registrado, no se envió notificación`)
            }
        } catch (emailErr) {
            console.error('[prestamos/crear] Error enviando correo de confirmación:', emailErr.message)
        }

        res.status(201).json({ mensaje: 'Préstamo creado con éxito', prestamo: resultado })
    } catch (error) {
        if (error.message && error.message.includes('ya tiene 2 préstamos activos')) {
            return res.status(400).json({ error: error.message })
        }
        res.status(500).json({ error: 'Error al registrar préstamo' })
    }
})

// Aprobar (Si estado inicial fue 'pendiente_aprobacion')
router.put('/:id/aprobar', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const prestamo = await prisma.prestamo.update({
            where: { id: req.params.id },
            data: { estado: 'activo', fecha_aprobacion: new Date(), aprobado_por: req.usuario.id }
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'APROBAR_PRESTAMO',
            entidad: 'Prestamo',
            entidadId: prestamo.id,
            detalles: { codigo: prestamo.codigo, persona_id: prestamo.persona_id }
        })

        res.json({ mensaje: 'Préstamo aprobado', prestamo })
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Préstamo no encontrado.' })
        res.status(500).json({ error: 'Error al aprobar' })
    }
})

// Cancelar
router.put('/:id/cancelar', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const { motivo } = req.body
        const prestamo = await prisma.prestamo.update({
            where: { id: req.params.id },
            data: { estado: 'cancelado', motivo }
        })
        // Opcional: Cancelar cuotas pendientes
        await prisma.cuotaProgramada.updateMany({
            where: { prestamo_id: req.params.id, estado: 'pendiente' },
            data: { estado: 'anulada' }
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'CANCELAR_PRESTAMO',
            entidad: 'Prestamo',
            entidadId: prestamo.id,
            detalles: { codigo: prestamo.codigo, motivo }
        })

        res.json({ mensaje: 'Préstamo cancelado' })
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Préstamo no encontrado.' })
        res.status(500).json({ error: 'Error al cancelar' })
    }
})

// Eliminar (Solo SuperAdmin)
router.delete('/:id', verificarToken, requiereRol(['superadmin']), async (req, res) => {
    try {
        const prestamo = await prisma.prestamo.findUnique({ where: { id: req.params.id } })
        if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' })

        // Primero eliminar dependencias
        await prisma.cuotaProgramada.deleteMany({ where: { prestamo_id: req.params.id } })
        await prisma.registroPago.deleteMany({ where: { prestamo_id: req.params.id } })
        await prisma.prestamTasa.deleteMany({ where: { prestamo_id: req.params.id } })

        await prisma.prestamo.delete({ where: { id: req.params.id } })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'ELIMINAR_PRESTAMO',
            entidad: 'Prestamo',
            entidadId: req.params.id,
            detalles: { codigo: prestamo.codigo, persona_id: prestamo.persona_id }
        })

        res.json({ mensaje: 'Préstamo eliminado de la base de datos' })
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' })
    }
})

// Desembolsar préstamo
router.put('/:id/desembolsar', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const prestamoId = req.params.id

        // 1. Buscar el préstamo con los datos del deudor
        const prestamo = await prisma.prestamo.findUnique({
            where: { id: prestamoId },
            include: { persona: true }
        })

        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' })
        }

        if (prestamo.desembolsado) {
            return res.status(400).json({ error: 'El préstamo ya ha sido desembolsado' })
        }

        // Solo permitir desembolsar si el préstamo está aprobado (estado 'activo' o 'en_mora')
        if (!['activo', 'en_mora'].includes(prestamo.estado)) {
            return res.status(400).json({ error: 'Solo se pueden desembolsar préstamos en estado activo o en mora' })
        }

        // 2. Actualizar el préstamo como desembolsado
        const prestamoActualizado = await prisma.prestamo.update({
            where: { id: prestamoId },
            data: {
                desembolsado: true,
                fecha_desembolso: new Date()
            },
            include: {
                persona: {
                    include: {
                        empresa: true
                    }
                }
            }
        })

        // 3. Registrar acción en auditoría
        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'DESEMBOLSAR_PRESTAMO',
            entidad: 'Prestamo',
            entidadId: prestamoActualizado.id,
            detalles: {
                codigo: prestamoActualizado.codigo,
                monto: prestamoActualizado.monto_otorgado,
                persona_id: prestamoActualizado.persona_id
            }
        })

        // 4. Enviar notificación por correo (descifrar datos PII primero)
        const personaDescifrada = descifrarPersona(prestamoActualizado.persona)
        if (personaDescifrada && personaDescifrada.correo) {
            const num = prestamoActualizado.numero_prestamo || 0
            const codigo = prestamoActualizado.codigo || `LYAP${String(num).padStart(5, '0')}`
            const nombreCompleto = [
                personaDescifrada.primer_nombre,
                personaDescifrada.segundo_nombre,
                personaDescifrada.primer_apellido,
                personaDescifrada.segundo_apellido
            ].filter(Boolean).join(' ')

            enviarConfirmacionDesembolso({
                email: personaDescifrada.correo,
                nombreCompleto,
                montoDesembolsado: prestamoActualizado.monto_otorgado,
                codigoPrestamo: codigo
            }).catch(err => {
                console.error('[prestamos/desembolsar] Error enviando correo de confirmación:', err)
            })
        } else {
            console.warn('[prestamos/desembolsar] ⚠️ No se encontró correo del cliente para enviar notificación')
        }

        res.json({
            mensaje: 'Préstamo desembolsado correctamente',
            prestamo: addCodigo({ ...prestamoActualizado, persona: descifrarPersona(prestamoActualizado.persona) })
        })
    } catch (error) {
        console.error('[prestamos/desembolsar] Error al desembolsar:', error)
        res.status(500).json({ error: 'Error al desembolsar el préstamo' })
    }
})

export default router

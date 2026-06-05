import Decimal from 'decimal.js'
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { calcularMora } from '../services/mora.service.js'
import { validate, pagoCrearSchema } from '../middleware/validate.js'
import { registrarAccion } from '../services/audit.service.js'
// Usando mismo truncamiento de finanzas
const redondear2 = (n) => new Decimal(n).toDecimalPlaces(2).toNumber()

const router = Router()

// Historial general de pagos con PAGINACIÓN
router.get('/', verificarToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 50
        const skip = (page - 1) * limit

        const [pagos, total] = await Promise.all([
            prisma.registroPago.findMany({
                include: { persona: true, prestamo: { include: { tipo: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.registroPago.count()
        ])
        res.json({ pagos, total, page, limit, totalPages: Math.ceil(total / limit) })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener historial' })
    }
})

// Historial de pagos de un préstamo
router.get('/prestamo/:id', verificarToken, async (req, res) => {
    try {
        const pagos = await prisma.registroPago.findMany({
            where: { prestamo_id: req.params.id },
            orderBy: { numero_cuota: 'asc' }
        })
        res.json({ pagos })
    } catch (error) {
        res.status(500).json({ error: 'Error' })
    }
})

// Registrar un Pago
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador']), validate(pagoCrearSchema), async (req, res) => {
    try {
        const data = req.body
        // Expected: cuota_id, fecha_pago, monto_recibido, metodo_pago, numero_comprobante

        // GENERACIÓN AUTOMÁTICA DE CÓDIGO ÚNICO (CP001, CP002...)
        if (!data.numero_comprobante) {
            const count = await prisma.registroPago.count()
            data.numero_comprobante = `CP${String(count + 1).padStart(3, '0')}`
        }

        const cuota = await prisma.cuotaProgramada.findUnique({
            where: { id: data.cuota_id },
            include: { prestamo: { include: { tasas_aplicadas: true } } }
        })

        if (!cuota) return res.status(404).json({ error: 'Cuota no encontrada' })
        if (cuota.estado === 'pagada') return res.status(400).json({ error: 'Cuota ya está pagada' })

        const tasaMora = cuota.prestamo.tasas_aplicadas.find(t => t.es_tasa_mora)

        // Cálculo mora en tiempo real para el momento del pago
        const moraResult = calcularMora(cuota, data.fecha_pago, tasaMora)

        const totalDebeStr = new Decimal(cuota.cuota_total).plus(moraResult.interesMora)
        const totalDebe = totalDebeStr.toNumber()
        const pagado = new Decimal(data.monto_recibido).toNumber()

        if (pagado <= 0) {
            return res.status(400).json({ error: 'El monto recibido debe ser mayor a cero.' })
        }

        const { saldo_inicio, capital_cuota, prestamo_id, persona_id, numero_cuota } = cuota

        // Fecha a formato Quincena String
        const d = new Date(data.fecha_pago)
        const m = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]
        const quincena = `${d.getDate() <= 15 ? 'Q1' : 'Q2'} ${m} ${d.getFullYear()}`

        const esPagoParcial = pagado < totalDebeStr.minus(0.02).toNumber()

        // Helper para resincronizar saldos de cuotas futuras si hay abono menor/mayor al capital programado
        const resyncSubsequentCuotas = async (tx, prestamoId, startCuotaNum, deltaCap) => {
            if (new Decimal(deltaCap).isZero()) return;
            const cuotasFuturas = await tx.cuotaProgramada.findMany({
                where: { prestamo_id: prestamoId, numero_cuota: { gt: startCuotaNum } },
                orderBy: { numero_cuota: 'asc' }
            });
            for (const c of cuotasFuturas) {
                const nuevoSaldoInicio = new Decimal(c.saldo_inicio).plus(deltaCap);
                const nuevoSaldoFinal = new Decimal(c.saldo_final).plus(deltaCap);
                await tx.cuotaProgramada.update({
                    where: { id: c.id },
                    data: {
                        saldo_inicio: redondear2(nuevoSaldoInicio.toNumber()),
                        saldo_final: redondear2(nuevoSaldoFinal.toNumber())
                    }
                });
            }
        };

        // Transacción: Crear Pago, actualizar Cuota, actualizar Prestamo
        const resultado = await prisma.$transaction(async (tx) => {
            const sIni = new Decimal(saldo_inicio)
            let sDes = new Decimal(0)
            let capitalAmortizado = new Decimal(0)
            let interesMoraCobrado = new Decimal(0)
            let pagoObj = null

            if (esPagoParcial) {
                // Pago Parcial
                interesMoraCobrado = new Decimal(Math.min(moraResult.interesMora, pagado))
                const abonoCuota = new Decimal(pagado).minus(interesMoraCobrado)

                let nuevoCapital = new Decimal(capital_cuota)
                let nuevoInteres = new Decimal(cuota.intereses_cuota)
                let nuevoCargos = new Decimal(cuota.cargos_unicos)

                let rem = abonoCuota
                if (rem.greaterThan(0)) {
                    if (rem.greaterThanOrEqualTo(nuevoCargos)) {
                        rem = rem.minus(nuevoCargos)
                        nuevoCargos = new Decimal(0)
                    } else {
                        nuevoCargos = nuevoCargos.minus(rem)
                        rem = new Decimal(0)
                    }
                }
                if (rem.greaterThan(0)) {
                    if (rem.greaterThanOrEqualTo(nuevoInteres)) {
                        rem = rem.minus(nuevoInteres)
                        nuevoInteres = new Decimal(0)
                    } else {
                        nuevoInteres = nuevoInteres.minus(rem)
                        rem = new Decimal(0)
                    }
                }
                if (rem.greaterThan(0)) {
                    nuevoCapital = nuevoCapital.minus(rem)
                }

                capitalAmortizado = new Decimal(capital_cuota).minus(nuevoCapital)
                sDes = sIni.minus(capitalAmortizado)
                if (sDes.lessThan(0)) sDes = new Decimal(0)

                // 1. Crear Registro de Pago (Parcial)
                pagoObj = await tx.registroPago.create({
                    data: {
                        prestamo_id,
                        persona_id,
                        numero_cuota,
                        fecha_pago: new Date(data.fecha_pago),
                        quincena,
                        monto_pagado: pagado,
                        saldo_antes: sIni.toNumber(),
                        saldo_despues: redondear2(sDes.toNumber()),
                        interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                        dias_de_atraso: moraResult.diasAtraso,
                        metodo_pago: data.metodo_pago || 'Transferencia bancaria',
                        numero_comprobante: data.numero_comprobante,
                        observacion: `${data.observacion || ''} (Abono Parcial)`.trim(),
                        registrado_por: req.usuario.id
                    }
                })

                // 2. Actualizar Cuota (no se marca como pagada, solo reduce valores)
                await tx.cuotaProgramada.update({
                    where: { id: cuota.id },
                    data: {
                        capital_cuota: redondear2(nuevoCapital.toNumber()),
                        intereses_cuota: redondear2(nuevoInteres.toNumber()),
                        cargos_unicos: redondear2(nuevoCargos.toNumber()),
                        cuota_total: redondear2(nuevoCapital.plus(nuevoInteres).plus(nuevoCargos).toNumber()),
                        saldo_final: redondear2(sDes.toNumber()),
                        observaciones: `${cuota.observaciones || ''} (Abono parcial registrado)`.trim()
                    }
                })

                // Sincronizar saldos de las cuotas posteriores tras abonos de capital adicionales
                await resyncSubsequentCuotas(tx, prestamo_id, numero_cuota, capitalAmortizado.negated())

            } else {
                // Pago Completo o con Excedente (Overpayment)
                capitalAmortizado = new Decimal(capital_cuota)
                interesMoraCobrado = new Decimal(moraResult.interesMora)
                sDes = sIni.minus(capitalAmortizado)
                if (sDes.lessThan(0)) sDes = new Decimal(0)

                // 1. Crear Pago
                pagoObj = await tx.registroPago.create({
                    data: {
                        prestamo_id,
                        persona_id,
                        numero_cuota,
                        fecha_pago: new Date(data.fecha_pago),
                        quincena,
                        monto_pagado: pagado,
                        saldo_antes: sIni.toNumber(),
                        saldo_despues: redondear2(sDes.toNumber()),
                        interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                        dias_de_atraso: moraResult.diasAtraso,
                        metodo_pago: data.metodo_pago || 'Transferencia bancaria',
                        numero_comprobante: data.numero_comprobante,
                        observacion: data.observacion,
                        registrado_por: req.usuario.id
                    }
                })

                // 2. Marcar cuota actual como pagada
                await tx.cuotaProgramada.update({
                    where: { id: cuota.id },
                    data: {
                        estado: 'pagada',
                        fecha_real_pago: new Date(data.fecha_pago),
                        dias_de_atraso: moraResult.diasAtraso,
                        interes_mora: moraResult.interesMora,
                        cuota_total_final: totalDebe,
                        pago_id: pagoObj.id
                    }
                })

                // Procesar excedente si lo hay
                const exceso = new Decimal(pagado).minus(totalDebe)
                if (exceso.greaterThan(0.01)) {
                    let restanteExceso = exceso
                    let capitalExtraAmortizado = new Decimal(0)

                    // Buscar siguientes cuotas para amortizarles el exceso
                    const siguientes = await tx.cuotaProgramada.findMany({
                        where: { prestamo_id, estado: { in: ['pendiente', 'vencida'] } },
                        orderBy: { numero_cuota: 'asc' }
                    })

                    for (const sig of siguientes) {
                        if (restanteExceso.lessThan(0.01)) break

                        const sigDebeSinMora = new Decimal(sig.cuota_total)
                        if (restanteExceso.greaterThanOrEqualTo(sigDebeSinMora.minus(0.01))) {
                            // Amortiza cuota completa
                            await tx.cuotaProgramada.update({
                                where: { id: sig.id },
                                data: {
                                    estado: 'pagada',
                                    fecha_real_pago: new Date(data.fecha_pago),
                                    pago_id: pagoObj.id,
                                    cuota_total_final: sig.cuota_total
                                }
                            })
                            capitalExtraAmortizado = capitalExtraAmortizado.plus(sig.capital_cuota)
                            restanteExceso = restanteExceso.minus(sigDebeSinMora)
                        } else {
                            // Amortiza cuota parcial
                            let nuevoCapital = new Decimal(sig.capital_cuota)
                            let nuevoInteres = new Decimal(sig.intereses_cuota)
                            let nuevoCargos = new Decimal(sig.cargos_unicos)

                            let rem = restanteExceso
                            if (rem.greaterThan(0)) {
                                if (rem.greaterThanOrEqualTo(nuevoCargos)) {
                                    rem = rem.minus(nuevoCargos)
                                    nuevoCargos = new Decimal(0)
                                } else {
                                    nuevoCargos = nuevoCargos.minus(rem)
                                    rem = new Decimal(0)
                                }
                            }
                            if (rem.greaterThan(0)) {
                                if (rem.greaterThanOrEqualTo(nuevoInteres)) {
                                    rem = rem.minus(nuevoInteres)
                                    nuevoInteres = new Decimal(0)
                                } else {
                                    nuevoInteres = nuevoInteres.minus(rem)
                                    rem = new Decimal(0)
                                }
                            }
                            if (rem.greaterThan(0)) {
                                nuevoCapital = nuevoCapital.minus(rem)
                                capitalExtraAmortizado = capitalExtraAmortizado.plus(rem)
                            }

                            await tx.cuotaProgramada.update({
                                where: { id: sig.id },
                                data: {
                                    capital_cuota: redondear2(nuevoCapital.toNumber()),
                                    intereses_cuota: redondear2(nuevoInteres.toNumber()),
                                    cargos_unicos: redondear2(nuevoCargos.toNumber()),
                                    cuota_total: redondear2(nuevoCapital.plus(nuevoInteres).plus(nuevoCargos).toNumber())
                                }
                            })
                            restanteExceso = new Decimal(0)
                        }
                    }

                    // Sincronizar saldos de las cuotas posteriores tras abonos de capital adicionales
                    if (capitalExtraAmortizado.greaterThan(0)) {
                        await resyncSubsequentCuotas(tx, prestamo_id, numero_cuota, capitalExtraAmortizado.negated())
                    }
                }
            }

            // 3. Revisar si hay más cuotas para el préstamo, sino cerrar el préstamo
            const restantes = await tx.cuotaProgramada.count({
                where: { prestamo_id, estado: { not: 'pagada' } }
            })

            const updateData = {
                ultimo_pago: new Date(data.fecha_pago)
            }

            if (!esPagoParcial) {
                updateData.cuotas_pagadas = { increment: 1 }
            }

            if (restantes === 0) {
                updateData.estado = 'cancelado' // Cancelado/Pagado
            } else {
                // Encontrar proximo pago
                const proxima = await tx.cuotaProgramada.findFirst({
                    where: { prestamo_id, estado: 'pendiente' },
                    orderBy: { numero_cuota: 'asc' }
                })
                if (proxima) {
                    updateData.proximo_pago = proxima.fecha_programada
                }
            }

            const estadoPrestamoUpdate = await tx.prestamo.update({
                where: { id: prestamo_id },
                data: updateData
            })

            // Si prestamo sigue activo, verificar si tiene otras cuotas vencidas
            if (estadoPrestamoUpdate.estado !== 'cancelado') {
                const vencidasCount = await tx.cuotaProgramada.count({
                    where: { prestamo_id, estado: 'vencida' }
                })
                if (vencidasCount === 0 && estadoPrestamoUpdate.estado === 'en_mora') {
                    await tx.prestamo.update({
                        where: { id: prestamo_id },
                        data: { estado: 'activo' }
                    })
                }
            }

            return pagoObj
        })

        // Registrar acción en auditoría
        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'REGISTRAR_PAGO',
            entidad: 'RegistroPago',
            entidadId: resultado.id,
            detalles: {
                prestamo_id: resultado.prestamo_id,
                persona_id: resultado.persona_id,
                cuota: resultado.numero_cuota,
                monto: resultado.monto_pagado,
                comprobante: resultado.numero_comprobante
            }
        })

        res.status(201).json({ mensaje: 'Pago registrado exitosamente', pago: resultado })
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar pago' })
    }
})

// REGISTRO MASIVO POR EMPRESA (DEDUCCIONES DE NÓMINA)
router.post('/masivo', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    const { empresa_id, fecha_pago, metodo_pago, lineas } = req.body;
    // lineas: [{ cedula: string, nombre: string, monto: number }]

    if (!empresa_id || !lineas || lineas.length === 0) {
        return res.status(400).json({ error: 'Faltan datos para el proceso masivo' });
    }

    const resultados = [];
    const countTotal = await prisma.registroPago.count();

    for (let i = 0; i < lineas.length; i++) {
        const item = lineas[i];
        const numComprobante = `CP-MAS-${countTotal + i + 1}`;

        try {
            let persona = null;

            if (item.cedula) {
                // 1. Buscar persona por Cédula de forma exacta en la empresa
                persona = await prisma.persona.findFirst({
                    where: {
                        cedula: item.cedula,
                        empresa_id: empresa_id
                    },
                    include: {
                        prestamos: {
                            where: { estado: { in: ['activo', 'en_mora'] } },
                            include: {
                                cuotas: { where: { estado: { in: ['pendiente', 'vencida'] } }, orderBy: { numero_cuota: 'asc' }, take: 1 },
                                tasas_aplicadas: true
                            }
                        }
                    }
                });
                if (!persona) throw new Error(`Cédula ${item.cedula} no encontrada en esta empresa`);
            } else if (item.nombre) {
                // 1. Fallback: Buscar persona en la empresa por coincidencia de nombre (fuzzy simple)
                const personas = await prisma.persona.findMany({
                    where: {
                        empresa_id: empresa_id,
                        OR: [
                            { primer_nombre: { contains: item.nombre.split(' ')[0], mode: 'insensitive' } },
                            { primer_apellido: { contains: item.nombre.split(' ').pop(), mode: 'insensitive' } }
                        ]
                    },
                    include: {
                        prestamos: {
                            where: { estado: { in: ['activo', 'en_mora'] } },
                            include: {
                                cuotas: { where: { estado: { in: ['pendiente', 'vencida'] } }, orderBy: { numero_cuota: 'asc' }, take: 1 },
                                tasas_aplicadas: true
                            }
                        }
                    }
                });

                // Filtrar la mejor coincidencia (nombre completo contiene)
                persona = personas.find(p =>
                    `${p.primer_nombre} ${p.primer_apellido}`.toLowerCase().includes(item.nombre.toLowerCase()) ||
                    item.nombre.toLowerCase().includes(`${p.primer_nombre} ${p.primer_apellido}`.toLowerCase())
                );
                if (!persona) throw new Error('Cliente no encontrado por nombre');
            } else {
                throw new Error('Falta identificación o nombre para procesar');
            }

            const prestamo = persona.prestamos[0];
            if (!prestamo) throw new Error('Sin contrato activo');
            const cuota = prestamo.cuotas[0];
            if (!cuota) throw new Error('Sin cuotas pendientes');

            // 2. Procesar pago (Similar a registro individual pero silenciado)
            const tasaMora = prestamo.tasas_aplicadas.find(t => t.es_tasa_mora);
            const moraResult = calcularMora(cuota, fecha_pago, tasaMora);

            const totalDebe = new Decimal(cuota.cuota_total).plus(moraResult.interesMora).toNumber();
            const pagado = new Decimal(item.monto).toNumber();

            if (pagado <= 0) {
                throw new Error('El monto de pago debe ser mayor a cero');
            }

            const esPagoParcial = pagado < new Decimal(totalDebe).minus(0.02).toNumber();

            // Transacción individual por cada línea
            const pagoResult = await prisma.$transaction(async (tx) => {
                const sIni = new Decimal(cuota.saldo_inicio)
                let sDes = new Decimal(0)
                let capitalAmortizado = new Decimal(0)
                let interesMoraCobrado = new Decimal(0)
                let pago = null

                if (esPagoParcial) {
                    interesMoraCobrado = new Decimal(Math.min(moraResult.interesMora, pagado))
                    const abonoCuota = new Decimal(pagado).minus(interesMoraCobrado)

                    let nuevoCapital = new Decimal(cuota.capital_cuota)
                    let nuevoInteres = new Decimal(cuota.intereses_cuota)
                    let nuevoCargos = new Decimal(cuota.cargos_unicos)

                    let rem = abonoCuota
                    if (rem.greaterThan(0)) {
                        if (rem.greaterThanOrEqualTo(nuevoCargos)) {
                            rem = rem.minus(nuevoCargos)
                            nuevoCargos = new Decimal(0)
                        } else {
                            nuevoCargos = nuevoCargos.minus(rem)
                            rem = new Decimal(0)
                        }
                    }
                    if (rem.greaterThan(0)) {
                        if (rem.greaterThanOrEqualTo(nuevoInteres)) {
                            rem = rem.minus(nuevoInteres)
                            nuevoInteres = new Decimal(0)
                        } else {
                            nuevoInteres = nuevoInteres.minus(rem)
                            rem = new Decimal(0)
                        }
                    }
                    if (rem.greaterThan(0)) {
                        nuevoCapital = nuevoCapital.minus(rem)
                    }

                    capitalAmortizado = new Decimal(cuota.capital_cuota).minus(nuevoCapital)
                    sDes = sIni.minus(capitalAmortizado)
                    if (sDes.lessThan(0)) sDes = new Decimal(0)

                    pago = await tx.registroPago.create({
                        data: {
                            prestamo_id: prestamo.id,
                            persona_id: persona.id,
                            numero_cuota: cuota.numero_cuota,
                            fecha_pago: new Date(fecha_pago),
                            quincena: 'NOMINA MASIVA',
                            monto_pagado: pagado,
                            saldo_antes: sIni.toNumber(),
                            saldo_despues: redondear2(sDes.toNumber()),
                            interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                            dias_de_atraso: moraResult.diasAtraso,
                            metodo_pago: metodo_pago || 'Deducción de nómina',
                            numero_comprobante: numComprobante,
                            observacion: `Recaudo masivo empresa. Item ${i + 1} (Abono Parcial)`,
                            registrado_por: req.usuario.id
                        }
                    });

                    await tx.cuotaProgramada.update({
                        where: { id: cuota.id },
                        data: {
                            capital_cuota: redondear2(nuevoCapital.toNumber()),
                            intereses_cuota: redondear2(nuevoInteres.toNumber()),
                            cargos_unicos: redondear2(nuevoCargos.toNumber()),
                            cuota_total: redondear2(nuevoCapital.plus(nuevoInteres).plus(nuevoCargos).toNumber()),
                            saldo_final: redondear2(sDes.toNumber()),
                            interes_mora: redondear2(new Decimal(cuota.interes_mora).plus(moraResult.interesMora).minus(interesMoraCobrado).toNumber())
                        }
                    });

                    // Sincronizar saldos posteriores
                    const deltaCapital = new Decimal(cuota.capital_cuota).minus(capitalAmortizado)
                    const cuotasFuturas = await tx.cuotaProgramada.findMany({
                        where: { prestamo_id: prestamo.id, numero_cuota: { gt: cuota.numero_cuota } },
                        orderBy: { numero_cuota: 'asc' }
                    });
                    for (const c of cuotasFuturas) {
                        const nuevoSaldoInicio = new Decimal(c.saldo_inicio).plus(deltaCapital);
                        const nuevoSaldoFinal = new Decimal(c.saldo_final).plus(deltaCapital);
                        await tx.cuotaProgramada.update({
                            where: { id: c.id },
                            data: {
                                saldo_inicio: redondear2(nuevoSaldoInicio.toNumber()),
                                saldo_final: redondear2(nuevoSaldoFinal.toNumber())
                            }
                        });
                    }

                } else {
                    // Pago Completo o con Excedente
                    capitalAmortizado = new Decimal(cuota.capital_cuota)
                    interesMoraCobrado = new Decimal(moraResult.interesMora)
                    sDes = sIni.minus(capitalAmortizado)
                    if (sDes.lessThan(0)) sDes = new Decimal(0)

                    pago = await tx.registroPago.create({
                        data: {
                            prestamo_id: prestamo.id,
                            persona_id: persona.id,
                            numero_cuota: cuota.numero_cuota,
                            fecha_pago: new Date(fecha_pago),
                            quincena: 'NOMINA MASIVA',
                            monto_pagado: pagado,
                            saldo_antes: sIni.toNumber(),
                            saldo_despues: redondear2(sDes.toNumber()),
                            interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                            dias_de_atraso: moraResult.diasAtraso,
                            metodo_pago: metodo_pago || 'Deducción de nómina',
                            numero_comprobante: numComprobante,
                            observacion: `Recaudo masivo empresa. Item ${i + 1}`,
                            registrado_por: req.usuario.id
                        }
                    });

                    await tx.cuotaProgramada.update({
                        where: { id: cuota.id },
                        data: {
                            estado: 'pagada',
                            fecha_real_pago: new Date(fecha_pago),
                            dias_de_atraso: moraResult.diasAtraso,
                            interes_mora: moraResult.interesMora,
                            cuota_total_final: totalDebe,
                            pago_id: pago.id
                        }
                    });

                    // Procesar excedente si lo hay
                    const exceso = new Decimal(pagado).minus(totalDebe)
                    if (exceso.greaterThan(0.01)) {
                        let restanteExceso = exceso
                        let capitalExtraAmortizado = new Decimal(0)

                        const siguientes = await tx.cuotaProgramada.findMany({
                            where: { prestamo_id: prestamo.id, estado: { in: ['pendiente', 'vencida'] } },
                            orderBy: { numero_cuota: 'asc' }
                        })

                        for (const sig of siguientes) {
                            if (restanteExceso.lessThanOrEqualTo(0.01)) break

                            const valorCuota = new Decimal(sig.cuota_total)
                            if (restanteExceso.greaterThanOrEqualTo(valorCuota)) {
                                await tx.cuotaProgramada.update({
                                    where: { id: sig.id },
                                    data: {
                                        estado: 'pagada',
                                        fecha_real_pago: new Date(fecha_pago),
                                        cuota_total_final: sig.cuota_total,
                                        pago_id: pago.id
                                    }
                                })
                                capitalExtraAmortizado = capitalExtraAmortizado.plus(sig.capital_cuota)
                                restanteExceso = restanteExceso.minus(valorCuota)
                            } else {
                                let nuevoCapital = new Decimal(sig.capital_cuota)
                                let nuevoInteres = new Decimal(sig.intereses_cuota)
                                let nuevoCargos = new Decimal(sig.cargos_unicos)

                                let rem = restanteExceso
                                if (rem.greaterThan(0)) {
                                    if (rem.greaterThanOrEqualTo(nuevoCargos)) {
                                        rem = rem.minus(nuevoCargos)
                                        nuevoCargos = new Decimal(0)
                                    } else {
                                        nuevoCargos = nuevoCargos.minus(rem)
                                        rem = new Decimal(0)
                                    }
                                }
                                if (rem.greaterThan(0)) {
                                    if (rem.greaterThanOrEqualTo(nuevoInteres)) {
                                        rem = rem.minus(nuevoInteres)
                                        nuevoInteres = new Decimal(0)
                                    } else {
                                        nuevoInteres = nuevoInteres.minus(rem)
                                        rem = new Decimal(0)
                                    }
                                }
                                if (rem.greaterThan(0)) {
                                    nuevoCapital = nuevoCapital.minus(rem)
                                    capitalExtraAmortizado = capitalExtraAmortizado.plus(rem)
                                }

                                await tx.cuotaProgramada.update({
                                    where: { id: sig.id },
                                    data: {
                                        capital_cuota: redondear2(nuevoCapital.toNumber()),
                                        intereses_cuota: redondear2(nuevoInteres.toNumber()),
                                        cargos_unicos: redondear2(nuevoCargos.toNumber()),
                                        cuota_total: redondear2(nuevoCapital.plus(nuevoInteres).plus(nuevoCargos).toNumber())
                                    }
                                })
                                restanteExceso = new Decimal(0)
                            }
                        }

                        // Sincronizar saldos de cuotas posteriores
                        if (capitalExtraAmortizado.greaterThan(0)) {
                            const cuotasFuturas = await tx.cuotaProgramada.findMany({
                                where: { prestamo_id: prestamo.id, numero_cuota: { gt: cuota.numero_cuota } },
                                orderBy: { numero_cuota: 'asc' }
                            });
                            for (const c of cuotasFuturas) {
                                const nuevoSaldoInicio = new Decimal(c.saldo_inicio).minus(capitalExtraAmortizado);
                                const nuevoSaldoFinal = new Decimal(c.saldo_final).minus(capitalExtraAmortizado);
                                await tx.cuotaProgramada.update({
                                    where: { id: c.id },
                                    data: {
                                        saldo_inicio: redondear2(nuevoSaldoInicio.toNumber()),
                                        saldo_final: redondear2(nuevoSaldoFinal.toNumber())
                                    }
                                });
                            }
                        }
                    }
                }

                // Lógica de actualización de préstamo...
                const restantes = await tx.cuotaProgramada.count({
                    where: { prestamo_id: prestamo.id, estado: { not: 'pagada' } }
                });

                const updateData = {
                    ultimo_pago: new Date(fecha_pago)
                };

                if (!esPagoParcial) {
                    updateData.cuotas_pagadas = { increment: 1 }
                }

                if (restantes === 0) {
                    updateData.estado = 'cancelado';
                } else {
                    const proxima = await tx.cuotaProgramada.findFirst({
                        where: { prestamo_id: prestamo.id, estado: 'pendiente' },
                        orderBy: { numero_cuota: 'asc' }
                    });
                    if (proxima) updateData.proximo_pago = proxima.fecha_programada;
                }

                await tx.prestamo.update({
                    where: { id: prestamo.id },
                    data: updateData
                });

                return pago;
            });

            resultados.push({ index: i, success: true, persona: `${persona.primer_nombre} ${persona.primer_apellido}`, monto: pagado });

        } catch (err) {
            resultados.push({ index: i, success: false, error: err.message, raw: item.cedula || item.nombre });
        }
    }

    // Registrar recaudo masivo en la auditoría
    const exitosos = resultados.filter(r => r.success).length
    const fallidos = resultados.filter(r => !r.success).length
    await registrarAccion({
        usuarioId: req.usuario.id,
        usuarioNom: req.usuario.nombre,
        accion: 'RECAUDO_MASIVO',
        entidad: 'RegistroPago',
        detalles: {
            total_procesados: lineas.length,
            exitosos,
            fallidos,
            empresa_id
        }
    })

    res.json({
        mensaje: 'Proceso de recaudo masivo finalizado',
        resumen: {
            total: lineas.length,
            exitosos,
            fallidos
        },
        detalles: resultados
    });
});

export default router

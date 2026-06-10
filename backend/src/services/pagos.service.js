import Decimal from 'decimal.js'
import { calcularMora } from './mora.service.js'

// Usando el mismo truncamiento de finanzas
const redondear2 = (n) => new Decimal(n).toDecimalPlaces(2).toNumber()

/**
 * Helper para resincronizar saldos de cuotas futuras si hay abono menor/mayor al capital programado
 */
export const resyncSubsequentCuotas = async (tx, prestamoId, startCuotaNum, deltaCap) => {
    if (new Decimal(deltaCap).isZero()) return
    const cuotasFuturas = await tx.cuotaProgramada.findMany({
        where: { prestamo_id: prestamoId, numero_cuota: { gt: startCuotaNum } },
        orderBy: { numero_cuota: 'asc' }
    })
    for (const c of cuotasFuturas) {
        const nuevoSaldoInicio = new Decimal(c.saldo_inicio).plus(deltaCap)
        const nuevoSaldoFinal = new Decimal(c.saldo_final).plus(deltaCap)
        await tx.cuotaProgramada.update({
            where: { id: c.id },
            data: {
                saldo_inicio: redondear2(nuevoSaldoInicio.toNumber()),
                saldo_final: redondear2(nuevoSaldoFinal.toNumber())
            }
        })
    }
}

/**
 * Procesa el pago de una cuota de manera atómica dentro de una transacción.
 * Sirve tanto para pagos individuales como masivos.
 */
export const procesarPagoCuota = async (tx, {
    cuota,
    montoRecibido,
    fechaPago,
    metodoPago,
    numeroComprobante,
    observacion,
    usuarioId,
    esMasivo = false
}) => {
    const tasaMora = cuota.prestamo.tasas_aplicadas.find(t => t.es_tasa_mora)

    // Cálculo de mora en tiempo real para el momento del pago
    const moraResult = calcularMora(cuota, fechaPago, tasaMora)

    const totalDebeStr = new Decimal(cuota.cuota_total).plus(moraResult.interesMora)
    const totalDebe = totalDebeStr.toNumber()
    const pagado = new Decimal(montoRecibido).toNumber()

    if (pagado <= 0) {
        throw new Error('El monto recibido debe ser mayor a cero.')
    }

    const { saldo_inicio, capital_cuota, prestamo_id, persona_id, numero_cuota } = cuota

    // Determinar la quincena correspondiente
    let quincena
    if (esMasivo) {
        quincena = 'NOMINA MASIVA'
    } else {
        const d = new Date(fechaPago)
        const m = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]
        quincena = `${d.getDate() <= 15 ? 'Q1' : 'Q2'} ${m} ${d.getFullYear()}`
    }

    const esPagoParcial = pagado < totalDebeStr.minus(0.02).toNumber()

    const sIni = new Decimal(saldo_inicio)
    let sDes = new Decimal(0)
    let capitalAmortizado = new Decimal(0)
    let interesMoraCobrado = new Decimal(0)
    let pagoObj = null

    // Generar observación del pago con el sufijo (Abono Parcial) si aplica
    const observacionPago = esPagoParcial
        ? `${observacion || ''} (Abono Parcial)`.trim()
        : observacion

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
                fecha_pago: new Date(fechaPago),
                quincena,
                monto_pagado: pagado,
                saldo_antes: sIni.toNumber(),
                saldo_despues: redondear2(sDes.toNumber()),
                interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                dias_de_atraso: moraResult.diasAtraso,
                metodo_pago: metodoPago || (esMasivo ? 'Deducción de nómina' : 'Transferencia bancaria'),
                numero_comprobante: numeroComprobante,
                observacion: observacionPago,
                registrado_por: usuarioId
            }
        })

        // 2. Actualizar Cuota (no se marca como pagada, solo reduce valores)
        const nuevaMoraPendiente = new Decimal(cuota.interes_mora).plus(moraResult.interesMora).minus(interesMoraCobrado)

        await tx.cuotaProgramada.update({
            where: { id: cuota.id },
            data: {
                capital_cuota: redondear2(nuevoCapital.toNumber()),
                intereses_cuota: redondear2(nuevoInteres.toNumber()),
                cargos_unicos: redondear2(nuevoCargos.toNumber()),
                cuota_total: redondear2(nuevoCapital.plus(nuevoInteres).plus(nuevoCargos).toNumber()),
                saldo_final: redondear2(sDes.toNumber()),
                interes_mora: redondear2(nuevaMoraPendiente.toNumber()),
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
                fecha_pago: new Date(fechaPago),
                quincena,
                monto_pagado: pagado,
                saldo_antes: sIni.toNumber(),
                saldo_despues: redondear2(sDes.toNumber()),
                interes_mora_cobrado: redondear2(interesMoraCobrado.toNumber()),
                dias_de_atraso: moraResult.diasAtraso,
                metodo_pago: metodoPago || (esMasivo ? 'Deducción de nómina' : 'Transferencia bancaria'),
                numero_comprobante: numeroComprobante,
                observacion: observacionPago,
                registrado_por: usuarioId
            }
        })

        // 2. Marcar cuota actual como pagada
        await tx.cuotaProgramada.update({
            where: { id: cuota.id },
            data: {
                estado: 'pagada',
                fecha_real_pago: new Date(fechaPago),
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
                            fecha_real_pago: new Date(fechaPago),
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
        ultimo_pago: new Date(fechaPago)
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
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Decimal from 'decimal.js'

// Mock de Prisma
vi.mock('../../lib/prisma.js', () => ({
    prisma: {
        cuotaProgramada: {
            findMany: vi.fn(),
            update:   vi.fn(),
            count:    vi.fn(),
            findFirst: vi.fn()
        },
        registroPago: {
            create: vi.fn()
        },
        prestamo: {
            update: vi.fn()
        }
    }
}))

// Mock de mora.service
vi.mock('../mora.service.js', () => ({
    calcularMora: vi.fn(() => ({ interestMora: 0, diasAtraso: 0 }))
}))

import { prisma } from '../../lib/prisma.js'
import { calcularMora } from '../mora.service.js'
import { procesarPagoCuota, resyncSubsequentCuotas } from '../pagos.service.js'

// Data base de prueba
const cuotaTestBase = {
    id: 'cuota-001',
    prestamo_id: 'pres-001',
    persona_id: 'per-001',
    numero_cuota: 1,
    fecha_programada: new Date('2026-06-15'),
    saldo_inicio: 100000,
    capital_cuota: 10000,
    intereses_cuota: 2000,
    cargos_unicos: 500,
    interes_mora: 0,
    cuota_total: 12500,
    estado: 'pendiente',
    prestamo: {
        tasas_aplicadas: [
            { es_tasa_mora: true }
        ]
    }
}

const txMock = {
    cuotaProgramada: {
        findMany: vi.fn(() => []),
        update:   vi.fn(),
        count:    vi.fn(() => 1),
        findFirst: vi.fn(() => ({ fecha_programada: new Date('2026-06-30') }))
    },
    registroPago: {
        create: vi.fn((args) => ({ id: 'pago-001', ...args.data }))
    },
    prestamo: {
        update: vi.fn(() => ({ estado: 'activo' }))
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    calcularMora.mockReturnValue({ interesMora: 0, diasAtraso: 0 })
})

describe('pagos.service.js - procesarPagoCuota', () => {
    it('arroja un error si el monto recibido es menor o igual a cero', async () => {
        await expect(
            procesarPagoCuota(txMock, {
                cuota: cuotaTestBase,
                montoRecibido: 0,
                fechaPago: '2026-06-15',
                metodoPago: 'Efectivo',
                usuarioId: 'user-01'
            })
        ).rejects.toThrow('El monto recibido debe ser mayor a cero.')

        await expect(
            procesarPagoCuota(txMock, {
                cuota: cuotaTestBase,
                montoRecibido: -100,
                fechaPago: '2026-06-15',
                metodoPago: 'Efectivo',
                usuarioId: 'user-01'
            })
        ).rejects.toThrow('El monto recibido debe ser mayor a cero.')
    })

    it('procesa correctamente un pago exacto (completo)', async () => {
        const pagoObj = await procesarPagoCuota(txMock, {
            cuota: cuotaTestBase,
            montoRecibido: 12500,
            fechaPago: '2026-06-15',
            metodoPago: 'Efectivo',
            numeroComprobante: 'CP-100',
            observacion: 'Pago completo de cuota 1',
            usuarioId: 'user-01'
        })

        // Debe registrar el pago
        expect(txMock.registroPago.create).toHaveBeenCalledOnce()
        expect(txMock.registroPago.create.mock.calls[0][0].data.monto_pagado).toBe(12500)
        expect(txMock.registroPago.create.mock.calls[0][0].data.numero_comprobante).toBe('CP-100')

        // Debe marcar la cuota como pagada
        expect(txMock.cuotaProgramada.update).toHaveBeenCalledWith({
            where: { id: cuotaTestBase.id },
            data: {
                estado: 'pagada',
                fecha_real_pago: expect.any(Date),
                dias_de_atraso: 0,
                interes_mora: 0,
                cuota_total_final: 12500,
                pago_id: 'pago-001'
            }
        })

        // Debe actualizar el préstamo
        expect(txMock.prestamo.update).toHaveBeenCalledOnce()
    })

    it('procesa correctamente un pago parcial deduciendo cargos, luego intereses, luego capital', async () => {
        // Recibe 1500 de los 12500
        // Debe deducir:
        // cargos_unicos (500) -> queda en 0 (pagó 500)
        // intereses_cuota (2000) -> queda en 1000 (pagó 1000)
        // capital_cuota (10000) -> queda en 10000 (pagó 0)
        const pagoObj = await procesarPagoCuota(txMock, {
            cuota: cuotaTestBase,
            montoRecibido: 1500,
            fechaPago: '2026-06-15',
            metodoPago: 'Efectivo',
            numeroComprobante: 'CP-101',
            observacion: 'Pago parcial cuota 1',
            usuarioId: 'user-01'
        })

        expect(txMock.registroPago.create).toHaveBeenCalledOnce()
        expect(txMock.registroPago.create.mock.calls[0][0].data.monto_pagado).toBe(1500)

        expect(txMock.cuotaProgramada.update).toHaveBeenCalledWith({
            where: { id: cuotaTestBase.id },
            data: {
                capital_cuota: 10000,
                intereses_cuota: 1000,
                cargos_unicos: 0,
                cuota_total: 11000,
                saldo_final: 100000,
                interes_mora: 0,
                observaciones: '(Abono parcial registrado)'
            }
        })
    })

    it('procesa correctamente un pago con excedente (overpayment) amortizando la siguiente cuota', async () => {
        // Cuota 1 debe: 12500. Pago: 15000 (Exceso: 2500)
        // Siguiente cuota programada debe: capital 10000, interes 2000, cargos 500 (total 12500)
        // Se aplica excedente de 2500 a la cuota 2:
        // Deduce cargos (500) -> queda en 0
        // Deduce interes (2000) -> queda en 0
        // Total amortizado cuota 2: 2500
        const cuota2 = {
            id: 'cuota-002',
            prestamo_id: 'pres-001',
            persona_id: 'per-001',
            numero_cuota: 2,
            capital_cuota: 10000,
            intereses_cuota: 2000,
            cargos_unicos: 500,
            cuota_total: 12500,
            estado: 'pendiente'
        }

        txMock.cuotaProgramada.findMany.mockReturnValue([cuota2])

        const pagoObj = await procesarPagoCuota(txMock, {
            cuota: cuotaTestBase,
            montoRecibido: 15000,
            fechaPago: '2026-06-15',
            metodoPago: 'Efectivo',
            numeroComprobante: 'CP-102',
            usuarioId: 'user-01'
        })

        // Debe haber actualizado cuota 1 a pagada
        expect(txMock.cuotaProgramada.update).toHaveBeenCalledWith({
            where: { id: cuotaTestBase.id },
            data: {
                estado: 'pagada',
                fecha_real_pago: expect.any(Date),
                dias_de_atraso: 0,
                interes_mora: 0,
                cuota_total_final: 12500,
                pago_id: 'pago-001'
            }
        })

        // Debe haber actualizado cuota 2 (parcialmente por el excedente)
        expect(txMock.cuotaProgramada.update).toHaveBeenCalledWith({
            where: { id: cuota2.id },
            data: {
                capital_cuota: 10000,
                intereses_cuota: 0,
                cargos_unicos: 0,
                cuota_total: 10000
            }
        })
    })
})

/**
 * ============================================================
 * YAP - Suite de Pruebas: Motor Financiero
 * ============================================================
 * Archivo  : financiero.test.js
 * Módulos  : financiero.service.js + mora.service.js
 * Framework: Vitest (ya configurado en package.json)
 *
 * ÍNDICE DE PRUEBAS:
 *   1. Helpers de Redondeo
 *   2. obtenerTasaQuincenal - Conversión de tasas
 *   3. calcularCuotaFija    - Amortización Francesa (cuota fija)
 *   4. calcularPrestamo     - Motor completo de amortización
 *      a) Suma de capital = montoOtorgado
 *      b) Intereses decrecientes (saldo insoluto)
 *      c) Cargos únicos (seguro de vida, etc.)
 *      d) Estructura y coherencia de la tabla de cuotas
 *      e) Casos borde (plazo=1, plazo=60, tasa=0%)
 *   5. validarTasaUsura     - Validación del límite regulatorio
 *   6. calcularMora         - Cálculo de intereses por mora
 * ============================================================
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('../../lib/prisma.js', () => ({
    prisma: {
        configuracion: {
            findUnique: vi.fn(() => ({ valor: '3.5' }))
        }
    }
}))

import {
    redondear2,
    redondear4,
    redondear6,
    obtenerTasaQuincenal,
    calcularCuotaFija,
    calcularPrestamo,
    validarTasaUsura,
    obtenerSiguienteQuincena
} from '../financiero.service.js'
import { calcularMora } from '../mora.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// FACTORIES DE TASAS DE PRUEBA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una tasa de interés periódico en el formato que espera calcularPrestamo.
 * NOTA: calcularPrestamo busca la tasa que tenga 'interés' o 'tasa' en su nombre
 * para calcular la cuota fija francesa. Por eso usamos ese nombre.
 */
const tasaInteres = (
    porcentaje,
    tipo = 'porcentaje_mensual',
    aplicaSobre = 'saldo_pendiente'
) => ({
    nombre: 'Interés Ordinario',
    nombre_snapshot: 'Interés Ordinario',
    activa: true,
    es_cargo_unico: false,
    es_tasa_mora: false,
    tipo_calculo: tipo,
    tipo_calculo_snapshot: tipo,
    valor_porcentaje: porcentaje,
    valor_snapshot: porcentaje,
    aplica_sobre: aplicaSobre,
    aplica_sobre_snapshot: aplicaSobre
})

/**
 * Crea un cargo único (aparece sólo en la primera cuota).
 */
const cargoUnico = (porcentaje, nombre = 'Seguro de Vida') => ({
    nombre,
    nombre_snapshot: nombre,
    activa: true,
    es_cargo_unico: true,
    es_tasa_mora: false,
    tipo_calculo: 'porcentaje_periodico',
    tipo_calculo_snapshot: 'porcentaje_periodico',
    valor_porcentaje: porcentaje,
    valor_snapshot: porcentaje,
    aplica_sobre: 'saldo_pendiente',
    aplica_sobre_snapshot: 'saldo_pendiente'
})

/**
 * Crea una tasa de mora para calcularMora.
 */
const tasaMoraFija = (porcentaje) => ({
    valor_porcentaje: porcentaje,
    valor_snapshot: porcentaje,
    tipo_calculo: 'porcentaje_periodico',
    tipo_calculo_snapshot: 'porcentaje_periodico'
})

// Fecha base de primer pago (quincena fija para reproducibilidad)
const FECHA_PRIMER_PAGO = new Date('2025-01-15')

// ─────────────────────────────────────────────────────────────────────────────
// 1. HELPERS DE REDONDEO
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Helpers de Redondeo (decimal.js HALF_UP)', () => {
    it('redondear2: 1.005 → 1.01 (HALF_UP)', () => {
        expect(redondear2(1.005)).toBe(1.01)
    })

    it('redondear2: 1.2349 → 1.23', () => {
        expect(redondear2(1.2349)).toBe(1.23)
    })

    it('redondear2: enteros sin decimales quedan igual', () => {
        expect(redondear2(5000000)).toBe(5000000)
        expect(redondear2(0)).toBe(0)
    })

    it('redondear4: 1.23456 → 1.2346', () => {
        expect(redondear4(1.23456)).toBe(1.2346)
    })

    it('redondear4: número muy pequeño → 0', () => {
        expect(redondear4(0.00001)).toBe(0)
    })

    it('redondear6: 1.0000001 → 1', () => {
        expect(redondear6(1.0000001)).toBe(1)
    })

    it('redondear6: 1.8 / 2 → 0.9 exacto (sin error flotante)', () => {
        expect(redondear6(1.8 / 2)).toBe(0.9)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. OBTENER TASA QUINCENAL
// ─────────────────────────────────────────────────────────────────────────────
describe('2. obtenerTasaQuincenal - Conversión de Tasas', () => {
    it('porcentaje_mensual 1.8% → quincenal = 0.9%', () => {
        const tasa = { tipo_calculo: 'porcentaje_mensual', valor_porcentaje: 1.8 }
        expect(obtenerTasaQuincenal(tasa)).toBe(0.9)
    })

    it('porcentaje_anual 24% → quincenal = 1% (24 quincenas/año)', () => {
        const tasa = { tipo_calculo: 'porcentaje_anual', valor_porcentaje: 24 }
        expect(obtenerTasaQuincenal(tasa)).toBe(1)
    })

    it('porcentaje_periodico 1.5% → quincenal = 1.5% (sin conversión)', () => {
        const tasa = { tipo_calculo: 'porcentaje_periodico', valor_porcentaje: 1.5 }
        expect(obtenerTasaQuincenal(tasa)).toBe(1.5)
    })

    it('porcentaje_simple 2% → quincenal = 2% (mismo que periódico)', () => {
        const tasa = { tipo_calculo: 'porcentaje_simple', valor_porcentaje: 2.0 }
        expect(obtenerTasaQuincenal(tasa)).toBe(2.0)
    })

    it('monto_fijo → retorna null (no es porcentaje)', () => {
        const tasa = { tipo_calculo: 'monto_fijo', valor_porcentaje: 50000 }
        expect(obtenerTasaQuincenal(tasa)).toBeNull()
    })

    it('usa valor_snapshot si está presente (préstamos ya creados)', () => {
        // valor_snapshot=2.0 DEBE tener prioridad sobre valor_porcentaje=1.0
        // 2.0% mensual / 2 = 1.0% quincenal
        const tasa = {
            tipo_calculo_snapshot: 'porcentaje_mensual',
            valor_snapshot: 2.0,
            tipo_calculo: 'porcentaje_mensual',
            valor_porcentaje: 1.0
        }
        expect(obtenerTasaQuincenal(tasa)).toBe(1.0)
    })

    it('usa tipo_calculo_snapshot si está presente', () => {
        // tipo_calculo_snapshot = mensual (÷2), pero tipo_calculo = periodico (sin cambio)
        // debe usar snapshot: 3.6% mensual / 2 = 1.8% quincenal
        const tasa = {
            tipo_calculo_snapshot: 'porcentaje_mensual',
            tipo_calculo: 'porcentaje_periodico',
            valor_porcentaje: 3.6,
            valor_snapshot: 3.6
        }
        expect(obtenerTasaQuincenal(tasa)).toBe(1.8)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. CALCULAR CUOTA FIJA (Amortización Francesa)
// ─────────────────────────────────────────────────────────────────────────────
describe('3. calcularCuotaFija - Fórmula Francesa', () => {
    it('tasa=0% → cuota = capital / cuotas (sin interés)', () => {
        const cuota = calcularCuotaFija(1200000, 0, 12)
        expect(cuota).toBe(100000)
    })

    it('plazo=1, tasa=1% → cuota = capital × (1 + 1/100)', () => {
        const cuota = calcularCuotaFija(1000000, 1.0, 1)
        expect(cuota).toBe(1010000)
    })

    it('capital=$5.000.000, plazo=12, tasa=0.9% quincenal → cuota entre $430k y $450k', () => {
        const cuota = calcularCuotaFija(5000000, 0.9, 12)
        expect(cuota).toBeGreaterThan(430000)
        expect(cuota).toBeLessThan(450000)
    })

    it('cuota mayor plazo < cuota menor plazo (a igualdad de capital y tasa)', () => {
        const cuota12 = calcularCuotaFija(5000000, 0.9, 12)
        const cuota24 = calcularCuotaFija(5000000, 0.9, 24)
        expect(cuota12).toBeGreaterThan(cuota24)
    })

    it('cuota mayor tasa > cuota menor tasa (a igualdad de capital y plazo)', () => {
        const cuota1pct = calcularCuotaFija(5000000, 1.0, 12)
        const cuota2pct = calcularCuotaFija(5000000, 2.0, 12)
        expect(cuota2pct).toBeGreaterThan(cuota1pct)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. CALCULAR PRESTAMO - Motor Completo de Amortización
// ─────────────────────────────────────────────────────────────────────────────
describe('4. calcularPrestamo - Motor Completo', () => {

    // ── 4a) La suma de capital amortizado = montoOtorgado ────────────────────
    describe('4a) Conservación del Capital (suma ∑capitalAbonado = montoOtorgado)', () => {
        it('$5M, 12 cuotas, 1.8% mensual → suma capital = $5.000.000 ±$0.02', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            const suma = tablaCuotas.reduce((acc, c) => acc + c.capitalAbonado, 0)
            expect(Math.abs(suma - 5000000)).toBeLessThanOrEqual(0.02)
        })

        it('$3M, 24 cuotas, 1.5% mensual → suma capital = $3.000.000 ±$0.02', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 3000000,
                numeroCuotas: 24,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.5)]
            })
            const suma = tablaCuotas.reduce((acc, c) => acc + c.capitalAbonado, 0)
            expect(Math.abs(suma - 3000000)).toBeLessThanOrEqual(0.02)
        })

        it('totalCapital en el objeto resultado = montoOtorgado exacto', () => {
            const resultado = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            expect(resultado.totalCapital).toBe(5000000)
        })

        it('la última cuota deja saldoFinal = 0', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            const ultima = tablaCuotas[tablaCuotas.length - 1]
            expect(ultima.saldoFinal).toBe(0)
        })
    })

    // ── 4b) Intereses decrecientes sobre saldo insoluto ──────────────────────
    describe('4b) Intereses Decrecientes (aplica_sobre=saldo_pendiente)', () => {
        it('interés cuota 1 > interés cuota 12 (saldo disminuye → interés disminuye)', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8, 'porcentaje_mensual', 'saldo_pendiente')]
            })
            expect(tablaCuotas[0].interesesCobrados).toBeGreaterThan(tablaCuotas[11].interesesCobrados)
        })

        it('saldoInicio de cada cuota > saldoFinal (capital siempre se amortiza)', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8, 'porcentaje_mensual', 'saldo_pendiente')]
            })
            tablaCuotas.forEach(cuota => {
                expect(cuota.saldoInicio).toBeGreaterThan(cuota.saldoFinal)
            })
        })

        it('interés cuota N ≈ saldoInicio × (tasaQ/100) con tolerancia ±$1', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8, 'porcentaje_mensual', 'saldo_pendiente')]
            })
            const tasaQ = 0.9 // 1.8% mensual / 2
            // Verificar las primeras 5 cuotas
            tablaCuotas.slice(0, 5).forEach(cuota => {
                const esperado = redondear2(cuota.saldoInicio * tasaQ / 100)
                expect(Math.abs(cuota.interesesCobrados - esperado)).toBeLessThanOrEqual(1)
            })
        })
    })

    // ── 4c) Cargos Únicos (Seguro de Vida, etc.) ─────────────────────────────
    describe('4c) Cargos Únicos - Solo en cuota 1', () => {
        it('el cargo único aparece SOLO en cuota 1 (cuotas 2..N lo tienen en cero)', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [
                    tasaInteres(1.8),
                    cargoUnico(1.5)
                ]
            })
            expect(tablaCuotas[0].cargosUnicos).toBeGreaterThan(0)
            tablaCuotas.slice(1).forEach(cuota => {
                expect(cuota.cargosUnicos).toBe(0)
            })
        })

        it('el monto del cargo único = montoOtorgado × porcentaje/100', () => {
            const monto = 5000000
            const pct = 1.5
            const esperado = redondear2(monto * pct / 100) // $75.000

            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: monto,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8), cargoUnico(pct)]
            })
            expect(tablaCuotas[0].cargosUnicos).toBe(esperado)
        })

        it('totalCargosUnicos del resultado = cargosUnicos de cuota 1', () => {
            const resultado = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8), cargoUnico(2.0)]
            })
            expect(resultado.totalCargosUnicos).toBe(resultado.tablaCuotas[0].cargosUnicos)
        })

        it('sin cargo único → totalCargosUnicos=0 y cargosUnicos=0 en todas las cuotas', () => {
            const resultado = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            expect(resultado.totalCargosUnicos).toBe(0)
            resultado.tablaCuotas.forEach(c => expect(c.cargosUnicos).toBe(0))
        })
    })

    // ── 4d) Estructura y Coherencia de la Tabla ──────────────────────────────
    describe('4d) Estructura y Coherencia de la Tabla de Cuotas', () => {
        let resultado

        // Calcular una vez y reusar en todos los tests de este bloque
        beforeAll(() => {
            resultado = calcularPrestamo({
                montoOtorgado: 5000000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8), cargoUnico(1.5)]
            })
        })

        it('la tabla tiene exactamente N cuotas', () => {
            expect(resultado.tablaCuotas).toHaveLength(12)
        })

        it('los numeroCuota son secuenciales del 1 al N', () => {
            resultado.tablaCuotas.forEach((c, idx) => {
                expect(c.numeroCuota).toBe(idx + 1)
            })
        })

        it('saldoFinal[N-1] = saldoInicio[N] (continuidad del saldo)', () => {
            for (let i = 0; i < resultado.tablaCuotas.length - 1; i++) {
                expect(resultado.tablaCuotas[i].saldoFinal)
                    .toBe(resultado.tablaCuotas[i + 1].saldoInicio)
            }
        })

        it('cuotaTotal = capitalAbonado + interesesCobrados + cargosUnicos en cada cuota', () => {
            resultado.tablaCuotas.forEach(c => {
                const esperado = redondear2(c.capitalAbonado + c.interesesCobrados + c.cargosUnicos)
                expect(c.cuotaTotal).toBe(esperado)
            })
        })

        it('cada cuota contiene todos los campos requeridos', () => {
            resultado.tablaCuotas.forEach(c => {
                expect(c).toHaveProperty('numeroCuota')
                expect(c).toHaveProperty('fechaPago')
                expect(c).toHaveProperty('saldoInicio')
                expect(c).toHaveProperty('capitalAbonado')
                expect(c).toHaveProperty('interesesCobrados')
                expect(c).toHaveProperty('cargosUnicos')
                expect(c).toHaveProperty('cuotaTotal')
                expect(c).toHaveProperty('saldoFinal')
                expect(c).toHaveProperty('desglose')
            })
        })

        it('fechaPago son strings ISO (compatible con JSON / Prisma)', () => {
            resultado.tablaCuotas.forEach(c => {
                expect(typeof c.fechaPago).toBe('string')
                expect(() => new Date(c.fechaPago)).not.toThrow()
            })
        })

        it('totalPagado = totalCapital + totalIntereses + totalCargosUnicos', () => {
            const esperado = redondear2(
                resultado.totalCapital + resultado.totalIntereses + resultado.totalCargosUnicos
            )
            expect(resultado.totalPagado).toBe(esperado)
        })
    })

    // ── 4e) Casos Borde ──────────────────────────────────────────────────────
    describe('4e) Casos Borde', () => {
        it('BORDE: plazo=1 → una sola cuota amortiza todo el capital', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 1000000,
                numeroCuotas: 1,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            expect(tablaCuotas).toHaveLength(1)
            expect(tablaCuotas[0].capitalAbonado).toBe(1000000)
            expect(tablaCuotas[0].saldoFinal).toBe(0)
        })

        it('BORDE: plazo=60 → 60 cuotas, suma capital = montoOtorgado, saldoFinal[60]=0', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 10000000,
                numeroCuotas: 60,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            expect(tablaCuotas).toHaveLength(60)
            const suma = tablaCuotas.reduce((acc, c) => acc + c.capitalAbonado, 0)
            expect(Math.abs(suma - 10000000)).toBeLessThanOrEqual(0.02)
            expect(tablaCuotas[59].saldoFinal).toBe(0)
        })

        it('BORDE: tasa=0% → sin intereses, solo amortización de capital', () => {
            const { tablaCuotas, totalIntereses } = calcularPrestamo({
                montoOtorgado: 1200000,
                numeroCuotas: 12,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(0, 'porcentaje_mensual')]
            })
            expect(totalIntereses).toBe(0)
            tablaCuotas.forEach(c => expect(c.interesesCobrados).toBe(0))
        })

        it('BORDE: tasasAsignadas=[] → sin intereses, sin cargos, solo capital', () => {
            const { tablaCuotas, totalIntereses, totalCargosUnicos } = calcularPrestamo({
                montoOtorgado: 600000,
                numeroCuotas: 6,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: []
            })
            expect(totalIntereses).toBe(0)
            expect(totalCargosUnicos).toBe(0)
            expect(tablaCuotas[5].saldoFinal).toBe(0)
        })

        it('BORDE: monto con centavos → error de redondeo acumulado ≤ $0.02', () => {
            const monto = 1234567.89
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: monto,
                numeroCuotas: 10,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.5)]
            })
            const suma = tablaCuotas.reduce((acc, c) => acc + c.capitalAbonado, 0)
            expect(Math.abs(suma - monto)).toBeLessThanOrEqual(0.02)
        })

        it('BORDE: monto grande ($500M) → sin errores de overflow', () => {
            const { tablaCuotas } = calcularPrestamo({
                montoOtorgado: 500000000,
                numeroCuotas: 24,
                fechaPrimerPago: FECHA_PRIMER_PAGO,
                tasasAsignadas: [tasaInteres(1.8)]
            })
            const suma = tablaCuotas.reduce((acc, c) => acc + c.capitalAbonado, 0)
            expect(Math.abs(suma - 500000000)).toBeLessThanOrEqual(0.02)
            expect(tablaCuotas[23].saldoFinal).toBe(0)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. VALIDAR TASA DE USURA (límite 3.5% mensual)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. validarTasaUsura - Límite Regulatorio (~3.5% mensual)', () => {
    it('tasa 1.8% mensual → NO excede usura (< 3.5%)', async () => {
        const resultado = await validarTasaUsura([tasaInteres(1.8)])
        expect(resultado.excede).toBe(false)
    })

    it('tasa 3.5% mensual (exacto límite) → NO excede (no es mayor, es igual)', async () => {
        const resultado = await validarTasaUsura([tasaInteres(3.5)])
        expect(resultado.excede).toBe(false)
    })

    it('tasa 4% mensual → SÍ excede y el mensaje contiene "Alerta de Usura"', async () => {
        const resultado = await validarTasaUsura([tasaInteres(4.0)])
        expect(resultado.excede).toBe(true)
        expect(resultado.mensaje).toContain('Alerta de Usura')
    })

    it('tasa 4% mensual → tasaAcumulada = 4.0 en el resultado', async () => {
        const resultado = await validarTasaUsura([tasaInteres(4.0)])
        expect(resultado.excede).toBe(true)
        expect(resultado.tasaAcumulada).toBe(4.0)
    })

    it('dos tasas cuya suma supera 3.5%/mensual → excede', async () => {
        // 2.0% mensual (1.0 Q) + 1.5% mensual (0.75 Q) + 0.5% mensual (0.25 Q) = 4.0% mensual
        const tasas = [
            tasaInteres(2.0),
            tasaInteres(1.5),
            tasaInteres(0.5)
        ]
        const resultado = await validarTasaUsura(tasas)
        expect(resultado.excede).toBe(true)
    })

    it('cargo único NO cuenta para el límite de usura (es_cargo_unico=true)', async () => {
        // 1.8% mensual + 5% cargo único → solo cuentan los periódicos
        const tasas = [tasaInteres(1.8), cargoUnico(5.0)]
        const resultado = await validarTasaUsura(tasas)
        expect(resultado.excede).toBe(false)
    })

    it('tasa inactiva (activa=false) NO cuenta para usura', async () => {
        const tasaInactiva = { ...tasaInteres(4.0), activa: false }
        const resultado = await validarTasaUsura([tasaInactiva])
        expect(resultado.excede).toBe(false)
    })

    it('array vacío → no excede', async () => {
        expect(await validarTasaUsura([])).toMatchObject({ excede: false })
    })

    it('argumento null → retorna {excede: false} sin crash', async () => {
        expect(await validarTasaUsura(null)).toMatchObject({ excede: false })
    })

    it('argumento undefined → retorna {excede: false} sin crash', async () => {
        expect(await validarTasaUsura(undefined)).toMatchObject({ excede: false })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. CALCULAR MORA
// ─────────────────────────────────────────────────────────────────────────────
describe('6. calcularMora - Intereses por Atraso', () => {
    const TASA_MORA = tasaMoraFija(1.5) // 1.5% quincenal de mora

    // Construye una cuota con N días de atraso
    const cuotaConAtraso = (diasAtraso, saldo = 1000000) => ({
        fecha_programada: new Date(Date.now() - diasAtraso * 24 * 60 * 60 * 1000).toISOString(),
        saldo_inicio: saldo
    })

    it('fecha en el FUTURO → diasAtraso=0, interesMora=0', () => {
        const cuotaFutura = {
            fecha_programada: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            saldo_inicio: 1000000
        }
        const resultado = calcularMora(cuotaFutura, new Date(), TASA_MORA)
        expect(resultado.diasAtraso).toBe(0)
        expect(resultado.interesMora).toBe(0)
    })

    it('fecha EXACTA (hoy) → diasAtraso=0, interesMora=0', () => {
        const ahora = new Date()
        const cuotaPuntual = { fecha_programada: ahora.toISOString(), saldo_inicio: 1000000 }
        const resultado = calcularMora(cuotaPuntual, ahora, TASA_MORA)
        expect(resultado.diasAtraso).toBe(0)
        expect(resultado.interesMora).toBe(0)
    })

    it('5 días de atraso → diasAtraso=5, interesMora > 0', () => {
        const resultado = calcularMora(cuotaConAtraso(5), new Date(), TASA_MORA)
        expect(resultado.diasAtraso).toBe(5)
        expect(resultado.interesMora).toBeGreaterThan(0)
    })

    it('10 días de atraso → diasAtraso=10', () => {
        const resultado = calcularMora(cuotaConAtraso(10), new Date(), TASA_MORA)
        expect(resultado.diasAtraso).toBe(10)
    })

    it('10 días atraso, $1M saldo, 1.5% quincenal → mora ≈ $10.000', () => {
        // interesMora = 1.000.000 × (1.5/100) × (10/15) = 10.000
        const resultado = calcularMora(cuotaConAtraso(10, 1000000), new Date(), TASA_MORA)
        expect(Math.abs(resultado.interesMora - 10000)).toBeLessThanOrEqual(50)
    })

    it('15 días (1 quincena exacta), $1M → mora = $15.000', () => {
        // interesMora = 1.000.000 × (1.5/100) × (15/15) = 15.000
        const resultado = calcularMora(cuotaConAtraso(15, 1000000), new Date(), TASA_MORA)
        expect(Math.abs(resultado.interesMora - 15000)).toBeLessThanOrEqual(50)
    })

    it('30 días de atraso tiene más mora que 5 días (proporcionalidad)', () => {
        const mora30 = calcularMora(cuotaConAtraso(30), new Date(), TASA_MORA).interesMora
        const mora5  = calcularMora(cuotaConAtraso(5),  new Date(), TASA_MORA).interesMora
        expect(mora30).toBeGreaterThan(mora5)
    })

    it('mora proporcional al saldo: doble saldo → doble mora', () => {
        const mora1M = calcularMora(cuotaConAtraso(10, 1000000), new Date(), TASA_MORA).interesMora
        const mora2M = calcularMora(cuotaConAtraso(10, 2000000), new Date(), TASA_MORA).interesMora
        expect(Math.abs(mora2M - mora1M * 2)).toBeLessThanOrEqual(1)
    })

    it('tasaMora=null → interesMora=0, diasAtraso=0 (sin crash)', () => {
        const resultado = calcularMora(cuotaConAtraso(10), new Date(), null)
        expect(resultado.interesMora).toBe(0)
        expect(resultado.diasAtraso).toBe(0)
    })

    it('usa valor_snapshot con prioridad sobre valor_porcentaje', () => {
        // valor_snapshot=2.0% vs valor_porcentaje=1.0% → mora debe ser el doble con snapshot
        const tasaConSnapshot = {
            valor_snapshot: 2.0,
            valor_porcentaje: 1.0,
            tipo_calculo_snapshot: 'porcentaje_periodico'
        }
        const cuota = cuotaConAtraso(10, 1000000)
        const moraConSnapshot = calcularMora(cuota, new Date(), tasaConSnapshot).interesMora
        const moraCon1Pct = calcularMora(cuota, new Date(), tasaMoraFija(1.0)).interesMora
        // Con 2% la mora debe ser ~el doble que con 1%
        expect(Math.abs(moraConSnapshot - moraCon1Pct * 2)).toBeLessThanOrEqual(1)
    })

    it('retorna quincenasAtraso = diasAtraso / 15', () => {
        const resultado = calcularMora(cuotaConAtraso(15), new Date(), TASA_MORA)
        expect(resultado.quincenasAtraso).toBe(1)
    })

    it('retorna tasaUsada = el porcentaje usado en el cálculo', () => {
        const resultado = calcularMora(cuotaConAtraso(10), new Date(), TASA_MORA)
        expect(resultado.tasaUsada).toBe(1.5)
    })
})

    // ── 4f) Tasa Plana / Interés Simple ─────────────────────────────────────
    describe('4f) Tasa Plana / Interés Simple (metodoAmortizacion = lineal)', () => {
        it('calcula la cuota exacta de $173.200 con interés 5% mensual (2.5% quincenal) y cargos prorrateados', () => {
            const capital = 1500000
            const cuotas = 12
            // Tasas configuradas:
            // Interés Corriente: 5% mensual (que se calcula como 2.5% quincenal periódico)
            // Cargo de estudio: 5% único (es_cargo_unico: true)
            // Seguro / Póliza: 3.56% único (es_cargo_unico: true)
            const tasas = [
                {
                    nombre: "Interés Corriente",
                    tipo_calculo: "porcentaje_periodico",
                    valor_porcentaje: 2.5,
                    aplica_sobre: "saldo_pendiente",
                    es_cargo_unico: false,
                    activa: true
                },
                {
                    nombre: "Estudio de Crédito",
                    tipo_calculo: "porcentaje_simple",
                    valor_porcentaje: 5.0,
                    es_cargo_unico: true,
                    activa: true
                },
                {
                    nombre: "Póliza",
                    tipo_calculo: "porcentaje_simple",
                    valor_porcentaje: 3.56,
                    es_cargo_unico: true,
                    activa: true
                }
            ]

            const resultado = calcularPrestamo({
                montoOtorgado: capital,
                numeroCuotas: cuotas,
                fechaPrimerPago: '2026-03-02T12:00:00.000Z',
                tasasAsignadas: tasas,
                metodoAmortizacion: 'lineal',
                diferirCargos: true
            })

            // Verificar cuotas y totales con amortización lineal decreciente
            expect(resultado.cuotaPrimera).toBe(173200)
            expect(resultado.cuotaEstandar).toBe(154450)
            expect(resultado.cuotaUltima).toBe(138825)
            expect(resultado.totalPagado).toBe(1872150)
            expect(resultado.totalIntereses).toBe(243750)
            expect(resultado.totalCargosUnicos).toBe(128400)

            resultado.tablaCuotas.forEach(cuota => {
                expect(cuota.capitalAbonado).toBe(125000)
                expect(cuota.cargosUnicos).toBe(10700)
                // Interés decrece por cuota: cuota 1 es 37500, cuota 12 es 3125
                const expectedInteres = 37500 - (cuota.numeroCuota - 1) * 3125
                expect(cuota.interesesCobrados).toBe(expectedInteres)
                expect(cuota.cuotaTotal).toBe(125000 + expectedInteres + 10700)
            })
        })
    })

    // ── 4g) Pruebas de Correcciones de Bugs (Porcentajes y simulador) ────────
    describe('4g) Corrección de Bugs de Simulador y Porcentajes', () => {
        it('Bug 1: obtenerTasaQuincenal cae al fallback si valor_snapshot está vacío o no es numérico', () => {
            const tasa = {
                tipo_calculo: 'porcentaje_periodico',
                valor_porcentaje: 2.5,
                valor_snapshot: '' // vacío
            }
            expect(obtenerTasaQuincenal(tasa)).toBe(2.5)

            const tasaNaN = {
                tipo_calculo: 'porcentaje_periodico',
                valor_porcentaje: 2.5,
                valor_snapshot: 'invalid-number'
            }
            expect(obtenerTasaQuincenal(tasaNaN)).toBe(0) // parseado como 0
        })

        it('Bug 2: cargo único con tipo monto_fijo no se calcula como porcentaje', () => {
            const capital = 1000000
            const tasas = [
                {
                    nombre: "Estudio Fijo",
                    tipo_calculo: "monto_fijo",
                    valor_fijo: 50000,
                    valor_snapshot: "50000",
                    es_cargo_unico: true,
                    activa: true
                }
            ]

            const resultado = calcularPrestamo({
                montoOtorgado: capital,
                numeroCuotas: 5,
                fechaPrimerPago: '2026-03-02',
                tasasAsignadas: tasas,
                metodoAmortizacion: 'lineal',
                diferirCargos: false // Cobrar en cuota 1
            })

            // El cargo total debe ser $50.000 (y no $500.000 o $10.000 si se dividiera por 100)
            expect(resultado.totalCargosUnicos).toBe(50000)
            expect(resultado.tablaCuotas[0].cargosUnicos).toBe(50000)
            expect(resultado.tablaCuotas[1].cargosUnicos).toBe(0)
        })
    })

    describe('4g) Lógica de Quincena Calendario Real', () => {
        it('debe calcular correctamente la siguiente quincena desde el día 15 (va al fin de mes)', () => {
            const fecha = new Date('2026-01-15T12:00:00.000Z')
            const siguiente = obtenerSiguienteQuincena(fecha)
            expect(siguiente.getUTCMonth()).toBe(0) // Enero (0-indexed)
            expect(siguiente.getUTCDate()).toBe(31)
            expect(siguiente.getUTCHours()).toBe(12)
        })

        it('debe calcular correctamente la siguiente quincena desde fin de mes (va al 15 del mes siguiente)', () => {
            const fecha = new Date('2026-01-31T12:00:00.000Z')
            const siguiente = obtenerSiguienteQuincena(fecha)
            expect(siguiente.getUTCMonth()).toBe(1) // Febrero (0-indexed)
            expect(siguiente.getUTCDate()).toBe(15)
            expect(siguiente.getUTCHours()).toBe(12)
        })

        it('debe calcular correctamente fin de mes en año bisiesto (Feb 29)', () => {
            const fecha = new Date('2024-02-15T10:00:00.000Z')
            const siguiente = obtenerSiguienteQuincena(fecha)
            expect(siguiente.getUTCMonth()).toBe(1) // Febrero
            expect(siguiente.getUTCDate()).toBe(29)
        })

        it('debe calcular correctamente fin de mes en año no bisiesto (Feb 28)', () => {
            const fecha = new Date('2025-02-15T10:00:00.000Z')
            const siguiente = obtenerSiguienteQuincena(fecha)
            expect(siguiente.getUTCMonth()).toBe(1) // Febrero
            expect(siguiente.getUTCDate()).toBe(28)
        })

        it('debe alinear las cuotas del préstamo a las quincenas calendario reales', () => {
            const capital = 1000000
            const tasas = [tasaInteres(2.0)]
            const resultado = calcularPrestamo({
                montoOtorgado: capital,
                numeroCuotas: 4,
                fechaPrimerPago: '2026-01-15T12:00:00.000Z',
                tasasAsignadas: tasas,
                metodoAmortizacion: 'lineal'
            })

            // Las cuotas deben tener las fechas:
            // Cuota 1: 2026-01-15
            // Cuota 2: 2026-01-31
            // Cuota 3: 2026-02-15
            // Cuota 4: 2026-02-28
            expect(new Date(resultado.tablaCuotas[0].fechaPago).getUTCDate()).toBe(15)
            expect(new Date(resultado.tablaCuotas[1].fechaPago).getUTCDate()).toBe(31)
            expect(new Date(resultado.tablaCuotas[2].fechaPago).getUTCDate()).toBe(15)
            expect(new Date(resultado.tablaCuotas[3].fechaPago).getUTCDate()).toBe(28)
        })
    })


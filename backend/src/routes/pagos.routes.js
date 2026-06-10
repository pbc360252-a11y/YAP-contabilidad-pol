import Decimal from 'decimal.js'
import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { calcularMora } from '../services/mora.service.js'
import { validate, pagoCrearSchema } from '../middleware/validate.js'
import { registrarAccion } from '../services/audit.service.js'
import crypto from 'crypto'
import { procesarPagoCuota } from '../services/pagos.service.js'

// Usando mismo truncamiento de finanzas
const redondear2 = (n) => new Decimal(n).toDecimalPlaces(2).toNumber()

// Genera número de comprobante único y seguro (sin race condition)
const generarComprobante = (prefijo = 'CP') =>
    `${prefijo}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`

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
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador', 'cobrador']), validate(pagoCrearSchema), async (req, res) => {
    try {
        const data = req.body
        // Expected: cuota_id, fecha_pago, monto_recibido, metodo_pago, numero_comprobante

        // GENERACIÓN AUTOMÁTICA DE CÓDIGO ÚNICO (UUID-based, sin race condition)
        if (!data.numero_comprobante) {
            data.numero_comprobante = generarComprobante('CP')
        }

        const cuota = await prisma.cuotaProgramada.findUnique({
            where: { id: data.cuota_id },
            include: { prestamo: { include: { tasas_aplicadas: true } } }
        })

        if (!cuota) return res.status(404).json({ error: 'Cuota no encontrada' })
        if (cuota.estado === 'pagada') return res.status(400).json({ error: 'Cuota ya está pagada' })

        // Transacción: Crear Pago, actualizar Cuota, actualizar Prestamo
        const resultado = await prisma.$transaction(async (tx) => {
            return await procesarPagoCuota(tx, {
                cuota,
                montoRecibido: data.monto_recibido,
                fechaPago: data.fecha_pago,
                metodoPago: data.metodo_pago,
                numeroComprobante: data.numero_comprobante,
                observacion: data.observacion,
                usuarioId: req.usuario.id,
                esMasivo: false
            })
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
        res.status(500).json({ error: error.message || 'Error al registrar pago' })
    }
})

// REGISTRO MASIVO POR EMPRESA (DEDUCCIONES DE NÓMINA)
router.post('/masivo', verificarToken, requiereRol(['superadmin', 'administrador', 'cobrador']), async (req, res) => {
    const { empresa_id, fecha_pago, metodo_pago, lineas } = req.body;
    // lineas: [{ cedula: string, nombre: string, monto: number }]

    if (!empresa_id || !lineas || lineas.length === 0) {
        return res.status(400).json({ error: 'Faltan datos para el proceso masivo' });
    }

    const resultados = [];

    for (let i = 0; i < lineas.length; i++) {
        const item = lineas[i];
        const numComprobante = generarComprobante('CP-MAS');

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
                const matches = personas.filter(p =>
                    `${p.primer_nombre} ${p.primer_apellido}`.toLowerCase().includes(item.nombre.toLowerCase()) ||
                    item.nombre.toLowerCase().includes(`${p.primer_nombre} ${p.primer_apellido}`.toLowerCase())
                );

                // Desambiguación de coincidencia de nombres (I5)
                if (matches.length > 1) {
                    throw new Error('Múltiples clientes encontrados con nombre similar en esta empresa. Por favor use la Cédula.');
                }

                persona = matches[0];
                if (!persona) throw new Error('Cliente no encontrado por nombre');
            } else {
                throw new Error('Falta identificación o nombre para procesar');
            }

            const prestamo = persona.prestamos[0];
            if (!prestamo) throw new Error('Sin contrato activo');
            const cuota = prestamo.cuotas[0];
            if (!cuota) throw new Error('Sin cuotas pendientes');

            // 2. Procesar pago (Similar a registro individual pero silenciado)
            const pagoResult = await prisma.$transaction(async (tx) => {
                return await procesarPagoCuota(tx, {
                    cuota,
                    montoRecibido: item.monto,
                    fechaPago: fecha_pago,
                    metodoPago: metodo_pago,
                    numeroComprobante: numComprobante,
                    observacion: `Recaudo masivo empresa. Item ${i + 1}`,
                    usuarioId: req.usuario.id,
                    esMasivo: true
                });
            });

            resultados.push({ index: i, success: true, persona: `${persona.primer_nombre} ${persona.primer_apellido}`, monto: item.monto });

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

import { z } from 'zod'

/**
 * Middleware genérico de validación con Zod.
 * Uso: router.post('/ruta', validate(MiEsquema), handler)
 */
export const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
        const issues = result.error.errors || result.error.issues || []
        const errores = issues.map(e => ({
            campo: e.path.join('.'),
            mensaje: e.message
        }))
        return res.status(400).json({
            error: 'Datos inválidos. Por favor revisa los campos enviados.',
            detalles: errores
        })
    }
    req.body = result.data // datos ya limpios y transformados
    next()
}

// ══════════════════════════════════════════════════════════════
// ESQUEMAS DE VALIDACIÓN
// ══════════════════════════════════════════════════════════════

// ── Auth ──────────────────────────────────────────────────────
export const loginSchema = z.object({
    correo: z.string().email('El correo no es válido.').toLowerCase().trim(),
    password: z.string()
        .min(8, 'La contraseña debe tener mínimo 8 caracteres.')
        .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
        .regex(/[0-9]/, 'Debe incluir al menos un número.')
})

// ── Solicitud pública (formulario sin login) ──────────────────
export const solicitudPublicaSchema = z.object({
    primer_nombre: z.string().min(2, 'El primer nombre es obligatorio.').trim(),
    segundo_nombre: z.string().trim().optional().default(''),
    primer_apellido: z.string().min(2, 'El primer apellido es obligatorio.').trim(),
    segundo_apellido: z.string().trim().optional().default(''),
    cedula: z.string().min(5, 'La cédula debe tener al menos 5 caracteres.').trim(),
    celular: z.string().min(7, 'El celular debe tener al menos 7 dígitos.').trim(),
    telefono: z.string().trim().optional().default(''),
    correo: z.string().email('El correo no es válido.').toLowerCase().trim().optional().or(z.literal('')),
    empresa_id: z.string().min(1, 'Debes seleccionar una empresa.'),
    cargo: z.string().trim().optional().default(''),
    monto_requerido: z.coerce.number().min(100000, 'El monto mínimo es $100.000 COP.'),
    observaciones: z.string().trim().optional().default('')
})

// ── Personas ──────────────────────────────────────────────────
export const personaSchema = z.object({
    primer_nombre: z.string().min(2).trim(),
    segundo_nombre: z.string().trim().optional(),
    primer_apellido: z.string().min(2).trim(),
    segundo_apellido: z.string().trim().optional(),
    cedula: z.string().min(5).trim(),
    celular: z.string().min(7).trim().optional(),
    telefono: z.string().trim().optional(),
    telefono2: z.string().trim().optional(),
    correo: z.string().email().optional().or(z.literal('')),
    empresa_id: z.string().min(1, 'La empresa es obligatoria.'),
    cargo: z.string().trim().optional(),
    monto_requerido: z.coerce.number().min(0).optional().default(0),
    estado: z.enum(['activo', 'inactivo']).optional().default('activo'),
    observaciones: z.string().trim().optional()
})

// ── Préstamos ─────────────────────────────────────────────────
export const prestamoSchema = z.object({
    persona_id: z.string().min(1, 'La persona es obligatoria.'),
    tipo_id: z.string().min(1, 'El tipo de préstamo es obligatorio.'),
    monto_otorgado: z.coerce.number().min(100000, 'El monto mínimo es $100.000 COP.'),
    numero_cuotas: z.coerce.number().int().min(1).max(120),
    fecha_otorgado: z.string().optional(),
    observaciones: z.string().trim().optional()
})

export const prestamoCrearSchema = z.object({
    persona_id: z.string().min(1, 'La persona es obligatoria.'),
    tipo_id: z.string().min(1, 'El tipo de préstamo es obligatorio.'),
    monto: z.coerce.number().min(100000, 'El monto mínimo es $100.000 COP.'),
    cuotas: z.coerce.number().int().min(1, 'El número de cuotas debe ser mayor a 0.').max(120),
    fechaPrimerPago: z.string().min(1, 'La fecha del primer pago es obligatoria.'),
    tasasPersonalizadas: z.array(z.any()).optional().default([]),
    observaciones: z.string().trim().optional().default('')
})


// ── Empresas ──────────────────────────────────────────────────
export const empresaSchema = z.object({
    nombre: z.string().min(2, 'El nombre de la empresa es obligatorio.').trim(),
    nit: z.string().trim().optional(),
    representante: z.string().trim().optional(),
    telefono: z.string().trim().optional(),
    correo: z.string().email().optional().or(z.literal('')),
    direccion: z.string().trim().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido').optional().default('#1A6FFF'),
    cuenta_bancaria: z.string().trim().optional(),
    banco: z.string().trim().optional(),
    estado: z.enum(['activa', 'inactiva']).optional().default('activa'),
    observaciones: z.string().trim().optional()
})

// ── Usuarios ──────────────────────────────────────────────────
export const usuarioSchema = z.object({
    nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.').trim(),
    email: z.string().email('El correo no es válido.').toLowerCase().trim().optional(),
    correo: z.string().email('El correo no es válido.').toLowerCase().trim().optional(),
    password: z.string()
        .min(8, 'La contraseña debe tener mínimo 8 caracteres.')
        .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
        .regex(/[0-9]/, 'Debe incluir al menos un número.')
        .optional(),
    rol: z.enum(['administrador', 'superadmin', 'analista', 'cobrador', 'operador']).optional().default('administrador'),
    estado: z.any().optional()
})

// ── Pagos ─────────────────────────────────────────────────────
export const pagoSchema = z.object({
    prestamo_id: z.string().min(1, 'El préstamo es obligatorio.'),
    persona_id: z.string().min(1, 'La persona es obligatoria.'),
    numero_cuota: z.coerce.number().int().min(1),
    fecha_pago: z.string().min(1, 'La fecha de pago es obligatoria.'),
    quincena: z.string().min(1, 'La quincena es obligatoria.'),
    monto_pagado: z.coerce.number().min(1, 'El monto pagado debe ser mayor a 0.'),
    metodo_pago: z.string().optional().default('Transferencia bancaria'),
    numero_comprobante: z.string().trim().optional(),
    observacion: z.string().trim().optional()
})

export const pagoCrearSchema = z.object({
    cuota_id: z.string().min(1, 'El ID de la cuota es obligatorio.'),
    fecha_pago: z.string().min(1, 'La fecha de pago es obligatoria.'),
    monto_recibido: z.coerce.number().min(1, 'El monto recibido debe ser mayor a cero.'),
    metodo_pago: z.string().optional().default('Transferencia bancaria'),
    numero_comprobante: z.string().trim().optional().or(z.literal('')),
    observacion: z.string().trim().optional().default('')
})


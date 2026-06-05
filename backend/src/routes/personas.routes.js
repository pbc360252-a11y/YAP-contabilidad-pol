import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { enviarConfirmacionRegistro } from '../services/email.service.js'
import { cifrarPersona, descifrarPersona, descifrarPersonas } from '../services/crypto.service.js'
import { validate, personaSchema } from '../middleware/validate.js'
import { registrarAccion } from '../services/audit.service.js'

const router = Router()

// Obtener todas las personas (con búsqueda y paginación)
router.get('/', verificarToken, async (req, res) => {
    try {
        const { empresa_id, q, page = 1, limit = 200 } = req.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        const where = {
            ...(empresa_id && { empresa_id }),
            ...(q && {
                OR: [
                    { primer_nombre: { contains: q } },
                    { primer_apellido: { contains: q } },
                    { segundo_nombre: { contains: q } },
                    { cedula: { contains: q } }
                ]
            })
        }

        const [personas, total] = await Promise.all([
            prisma.persona.findMany({
                where,
                include: {
                    empresa: true,
                    prestamos: {
                        where: { estado: { in: ['activo', 'en_mora'] } },
                        include: {
                            cuotas: {
                                where: { estado: { in: ['pendiente', 'vencida'] } },
                                orderBy: { numero_cuota: 'asc' }
                            }
                        }
                    }
                },
                orderBy: [{ primer_apellido: 'asc' }, { primer_nombre: 'asc' }],
                skip,
                take: parseInt(limit)
            }),
            prisma.persona.count({ where })
        ])
        res.json({ personas: descifrarPersonas(personas), total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener personas' })
    }
})

// Buscar personas (?q=termino)
router.get('/buscar', verificarToken, async (req, res) => {
    try {
        const { q, empresa_id } = req.query
        if (!q && !empresa_id) return res.json({ personas: [] })

        const where = {
            AND: [
                empresa_id ? { empresa_id } : {},
                q ? {
                    OR: [
                        { primer_nombre: { contains: q } },
                        { primer_apellido: { contains: q } },
                        { cedula: { contains: q } }
                    ]
                } : {}
            ]
        }

        const personas = await prisma.persona.findMany({
            where,
            include: { empresa: true }
        })
        res.json({ personas: descifrarPersonas(personas) })
    } catch (error) {
        res.status(500).json({ error: 'Error al buscar' })
    }
})

// Obtener persona por id (Perfil Completo 360)
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const persona = await prisma.persona.findUnique({
            where: { id: req.params.id },
            include: {
                empresa: true,
                prestamos: {
                    include: { cuotas: true, tipo: true }
                },
                pagos: { orderBy: { fecha_pago: 'desc' }, take: 20 }
            }
        })
        if (!persona) return res.status(404).json({ error: 'Persona no encontrada' })
        res.json({ persona: descifrarPersona(persona) })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener' })
    }
})

// Crear persona
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador']), validate(personaSchema), async (req, res) => {
    try {
        const data = req.body
        data.creado_por = req.usuario.id

        // Validar cédula única
        const existe = await prisma.persona.findUnique({ where: { cedula: data.cedula } })
        if (existe) return res.status(400).json({ error: 'La cédula ya está registrada.' })

        // Obtener el número en la fila ANTES de crear (total actual + 1)
        const totalRegistros = await prisma.persona.count()
        const numeroTurno = totalRegistros + 1

        // Cifrar campos sensibles (PII) antes de persistir
        const dataProtegida = cifrarPersona(data)
        const nueva = await prisma.persona.create({ data: dataProtegida })
        const nuevaDescifrada = descifrarPersona(nueva)

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'CREAR_PERSONA',
            entidad: 'Persona',
            entidadId: nueva.id,
            detalles: { cedula: nuevaDescifrada.cedula, nombre: `${nuevaDescifrada.primer_nombre} ${nuevaDescifrada.primer_apellido}` }
        })

        // Disparar correo de confirmación de forma asíncrona (no bloquea la respuesta)
        if (nuevaDescifrada.correo) {
            const nombreCompleto = `${nuevaDescifrada.primer_nombre} ${nuevaDescifrada.primer_apellido}`.trim()
            enviarConfirmacionRegistro({
                email: nuevaDescifrada.correo,
                nombreCompleto,
                numeroTurno
            }).catch(err => console.error('[EmailService] Error no capturado:', err.message))
        }

        res.status(201).json({ mensaje: 'Persona registrada con éxito', persona: nuevaDescifrada })
    } catch (error) {
        res.status(500).json({ error: 'Error al crear' })
    }
})

// Editar persona
router.put('/:id', verificarToken, requiereRol(['superadmin', 'administrador']), validate(personaSchema.partial()), async (req, res) => {
    try {
        // Cifrar campos sensibles antes de actualizar
        const dataProtegida = cifrarPersona(req.body)
        const editada = await prisma.persona.update({
            where: { id: req.params.id },
            data: dataProtegida
        })

        const personaDescifrada = descifrarPersona(editada)
        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'EDITAR_PERSONA',
            entidad: 'Persona',
            entidadId: editada.id,
            detalles: { cedula: personaDescifrada.cedula, nombre: `${personaDescifrada.primer_nombre} ${personaDescifrada.primer_apellido}` }
        })

        res.json({ mensaje: 'Información actualizada', persona: personaDescifrada })
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' })
    }
})

// Eliminar persona (solo si no tiene préstamos)
router.delete('/:id', verificarToken, requiereRol(['superadmin']), async (req, res) => {
    try {
        const r = await prisma.prestamo.count({ where: { persona_id: req.params.id } })
        if (r > 0) return res.status(400).json({ error: 'No se puede eliminar. Tiene historial de préstamos. Puede desactivarla.' })
        
        const persona = await prisma.persona.findUnique({ where: { id: req.params.id } })
        if (!persona) return res.status(404).json({ error: 'Persona no encontrada' })
        const personaDescifrada = descifrarPersona(persona)

        await prisma.persona.delete({ where: { id: req.params.id } })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'ELIMINAR_PERSONA',
            entidad: 'Persona',
            entidadId: req.params.id,
            detalles: { cedula: personaDescifrada.cedula, nombre: `${personaDescifrada.primer_nombre} ${personaDescifrada.primer_apellido}` }
        })

        res.json({ mensaje: 'Persona eliminada' })
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' })
    }
})

// Restablecer acceso al portal del cliente (PIN)
router.post('/:id/restablecer-portal', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const persona = await prisma.persona.findUnique({ where: { id: req.params.id } })
        if (!persona) return res.status(404).json({ error: 'Persona no encontrada' })
        const personaDescifrada = descifrarPersona(persona)

        await prisma.persona.update({
            where: { id: req.params.id },
            data: {
                password: null,
                cambiar_password: true
            }
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'RESTABLECER_PIN_PORTAL',
            entidad: 'Persona',
            entidadId: req.params.id,
            detalles: { cedula: personaDescifrada.cedula, nombre: `${personaDescifrada.primer_nombre} ${personaDescifrada.primer_apellido}` }
        })

        res.json({ mensaje: 'Acceso al portal restablecido con éxito. El PIN temporal del deudor ahora vuelve a ser su Cédula.' })
    } catch (error) {
        res.status(500).json({ error: 'Error al restablecer acceso del portal' })
    }
})

// Rechazar/descartar solicitud pública
router.post('/:id/rechazar-solicitud', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const { motivo } = req.body
        const persona = await prisma.persona.findUnique({ where: { id: req.params.id } })
        if (!persona) return res.status(404).json({ error: 'Persona no encontrada' })

        const personaDescifrada = descifrarPersona(persona)
        const obsActuales = persona.observaciones ? `${persona.observaciones}\n` : ''
        const nuevasObs = `${obsActuales}[Rechazo Solicitud ${new Date().toLocaleDateString('es-CO')}]: ${motivo || 'Rechazado por el administrador'}`

        await prisma.persona.update({
            where: { id: req.params.id },
            data: {
                monto_requerido: 0,
                observaciones: nuevasObs
            }
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'RECHAZAR_SOLICITUD',
            entidad: 'Persona',
            entidadId: req.params.id,
            detalles: { cedula: personaDescifrada.cedula, nombre: `${personaDescifrada.primer_nombre} ${personaDescifrada.primer_apellido}`, motivo }
        })

        res.json({ mensaje: 'Solicitud de crédito descartada con éxito' })
    } catch (error) {
        res.status(500).json({ error: 'Error al rechazar solicitud' })
    }
})

export default router

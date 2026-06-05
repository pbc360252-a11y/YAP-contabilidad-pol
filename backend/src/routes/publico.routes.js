import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { cifrarPersona, descifrarPersona } from '../services/crypto.service.js'
import { enviarConfirmacionRegistro, enviarNotificacionAdminNuevaSolicitud } from '../services/email.service.js'
import { validate, solicitudPublicaSchema } from '../middleware/validate.js'

const router = Router()

// Obtener todas las empresas activas (público)
router.get('/empresas', async (req, res) => {
    try {
        const empresas = await prisma.empresa.findMany({
            where: { estado: 'activa' },
            orderBy: { nombre: 'asc' }
        })
        res.json({ empresas })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener empresas' })
    }
})

// Registrar solicitud pública
router.post('/solicitar', validate(solicitudPublicaSchema), async (req, res) => {
    try {
        const {
            primer_nombre,
            segundo_nombre,
            primer_apellido,
            segundo_apellido,
            cedula,
            telefono,
            celular,
            correo,
            empresa_id,
            cargo,
            monto_requerido,
            observaciones
        } = req.body
        // Validación de campos cubierta por Zod middleware (validate)

        // Validar si la cédula ya existe
        const existe = await prisma.persona.findUnique({ where: { cedula } })
        if (existe) {
            return res.status(400).json({ error: 'Esta cédula ya se encuentra registrada en el sistema. Por favor, comuníquese con un asesor.' })
        }

        // Cifrar los datos PII del cliente
        const personaData = {
            primer_nombre,
            segundo_nombre: segundo_nombre || null,
            primer_apellido,
            segundo_apellido: segundo_apellido || null,
            cedula,
            telefono: telefono || null,
            celular,
            correo: correo || null,
            empresa_id,
            cargo: cargo || null,
            monto_requerido: parseFloat(monto_requerido),
            observaciones: observaciones || null,
            estado: 'activo'
        }

        const dataProtegida = cifrarPersona(personaData)
        const nueva = await prisma.persona.create({
            data: dataProtegida,
            include: { empresa: true }
        })

        // Descifrar para operaciones en memoria / envíos de correo
        const nuevaDescifrada = descifrarPersona(nueva)

        // 1. Correo al cliente
        let numeroTurno = 1
        try {
            const totalRegistros = await prisma.persona.count()
            numeroTurno = totalRegistros
            if (nuevaDescifrada.correo) {
                const nombreCompleto = `${nuevaDescifrada.primer_nombre} ${nuevaDescifrada.primer_apellido}`.trim()
                enviarConfirmacionRegistro({
                    email: nuevaDescifrada.correo,
                    nombreCompleto,
                    numeroTurno
                }).catch(err => console.error('[PublicRoute] Error al enviar bienvenida:', err.message))
            }
        } catch (e) {
            console.error('[PublicRoute] Error calculando turno/correo de cliente:', e.message)
        }

        // 2. Notificación al administrador
        try {
            // Buscamos correos de administradores en la DB
            const admins = await prisma.usuario.findMany({
                where: { rol: { in: ['superadmin', 'administrador'] }, estado: 'activo' },
                select: { correo: true }
            })
            const adminEmails = admins.map(a => a.correo)
            
            // Fallback si no hay administradores en DB
            const emailAdminDestino = adminEmails.length > 0 ? adminEmails[0] : 'admin@yap.com.co'

            const nombreCompleto = `${nuevaDescifrada.primer_nombre} ${nuevaDescifrada.primer_apellido}`.trim()
            enviarNotificacionAdminNuevaSolicitud({
                emailAdmin: emailAdminDestino,
                nombreCompleto,
                cedula: nuevaDescifrada.cedula,
                emailCliente: nuevaDescifrada.correo,
                celular: nuevaDescifrada.celular,
                empresaNombre: nuevaDescifrada.empresa?.nombre || 'Desconocida',
                cargo: nuevaDescifrada.cargo,
                montoRequerido: nuevaDescifrada.monto_requerido,
                observaciones: nuevaDescifrada.observaciones
            }).catch(err => console.error('[PublicRoute] Error al enviar alerta a admin:', err.message))
        } catch (e) {
            console.error('[PublicRoute] Error notificando al administrador:', e.message)
        }

        res.status(201).json({
            mensaje: 'Solicitud registrada con éxito',
            persona: {
                id: nuevaDescifrada.id,
                primer_nombre: nuevaDescifrada.primer_nombre,
                primer_apellido: nuevaDescifrada.primer_apellido,
                turno: numeroTurno
            }
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar la solicitud' })
    }
})

export default router

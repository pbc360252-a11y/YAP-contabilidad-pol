import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import multer from 'multer'
import { subirImagenLogo } from '../services/storage.service.js'
import { validate, usuarioSchema } from '../middleware/validate.js'
import { registrarAccion } from '../services/audit.service.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Usamos verificarToken para todas las rutas de este archivo
router.use(verificarToken)

// GET /api/usuarios - Obtener todos los usuarios (Solo admins)
router.get('/', requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            select: {
                id: true,
                nombre: true,
                correo: true,
                rol: true,
                estado: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        // Formatear para el frontend
        const prevUsuarios = usuarios.map(u => ({
            ...u,
            email: u.correo, // El frontend espera email
            empresa: 'YAP (CRÉDITOS POR LIBRANZA)', // Temporal: Ajustar si el usuario se asocia a empresa en DB
            ultimoAcceso: null, // Se puede implementar después
            avatar: u.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(),
            creadoEn: u.createdAt
        }))

        res.json(prevUsuarios)
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener usuarios' })
    }
})

// POST /api/usuarios - Crear un usuario (Solo admins)
router.post('/', requiereRol(['superadmin', 'administrador']), validate(usuarioSchema), async (req, res) => {
    try {
        const { nombre, email, correo, password, rol, estado } = req.body
        const userEmail = email || correo

        if (!userEmail || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' })
        }

        const existe = await prisma.usuario.findUnique({ where: { correo: userEmail } })
        if (existe) {
            return res.status(400).json({ error: 'El correo ya está en uso' })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const nuevoUsuario = await prisma.usuario.create({
            data: {
                nombre,
                correo: userEmail,
                password: hashedPassword,
                rol: rol || 'administrador',
                estado: estado === false ? 'inactivo' : 'activo'
            }
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'CREAR_USUARIO',
            entidad: 'Usuario',
            entidadId: nuevoUsuario.id,
            detalles: { nombre: nuevoUsuario.nombre, correo: nuevoUsuario.correo, rol: nuevoUsuario.rol }
        })

        const { password: _, ...usuarioSinPass } = nuevoUsuario
        res.status(201).json({
            ...usuarioSinPass,
            email: usuarioSinPass.correo,
            empresa: 'YAP (CRÉDITOS POR LIBRANZA)',
            ultimoAcceso: null,
            avatar: usuarioSinPass.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(),
            creadoEn: usuarioSinPass.createdAt
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al crear usuario' })
    }
})

// PUT /api/usuarios/:id - Actualizar usuario
router.put('/:id', requiereRol(['superadmin', 'administrador']), validate(usuarioSchema.partial()), async (req, res) => {
    try {
        const { id } = req.params
        const { nombre, email, correo, password, rol, estado } = req.body
        const userEmail = email || correo

        const usuarioExistente = await prisma.usuario.findUnique({ where: { id } })
        if (!usuarioExistente) return res.status(404).json({ error: 'Usuario no encontrado' })

        const dataUpdate = {
            nombre,
            rol,
            estado: estado === false ? 'inactivo' : 'activo'
        }

        if (userEmail && userEmail !== usuarioExistente.correo) {
            const existeCorreo = await prisma.usuario.findUnique({ where: { correo: userEmail } })
            if (existeCorreo) return res.status(400).json({ error: 'El correo ya está en uso' })
            dataUpdate.correo = userEmail
        }

        if (password) {
            dataUpdate.password = await bcrypt.hash(password, 10)
        }

        const usuarioEditado = await prisma.usuario.update({
            where: { id },
            data: dataUpdate
        })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'EDITAR_USUARIO',
            entidad: 'Usuario',
            entidadId: usuarioEditado.id,
            detalles: { nombre: usuarioEditado.nombre, correo: usuarioEditado.correo, rol: usuarioEditado.rol }
        })

        const { password: _, ...usuarioSinPass } = usuarioEditado
        res.json({
            ...usuarioSinPass,
            email: usuarioSinPass.correo,
            empresa: 'YAP (CRÉDITOS POR LIBRANZA)',
            ultimoAcceso: null,
            avatar: usuarioSinPass.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(),
            creadoEn: usuarioSinPass.createdAt,
            estado: usuarioSinPass.estado === 'activo'
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar usuario' })
    }
})

// DELETE /api/usuarios/:id - Eliminar usuario
router.delete('/:id', requiereRol(['superadmin']), async (req, res) => {
    try {
        const { id } = req.params
        // No permitir auto-eliminación por seguridad
        if (req.usuario?.id === id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' })
        }

        const usuario = await prisma.usuario.findUnique({ where: { id } })
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

        await prisma.usuario.delete({ where: { id } })

        await registrarAccion({
            usuarioId: req.usuario.id,
            usuarioNom: req.usuario.nombre,
            accion: 'ELIMINAR_USUARIO',
            entidad: 'Usuario',
            entidadId: id,
            detalles: { nombre: usuario.nombre, correo: usuario.correo }
        })

        res.json({ mensaje: 'Usuario eliminado correctamente' })
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar usuario' })
    }
})

// GET /api/usuarios/me/perfil - Obtener mi perfil
router.get('/me/perfil', async (req, res) => {
    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: req.usuario.id }
        })
        const { password, ...sinPass } = usuario
        res.json(sinPass)
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener perfil' })
    }
})

// PUT /api/usuarios/me/perfil - Actualizar mi perfil
router.put('/me/perfil', async (req, res) => {
    try {
        const { nombre, correo } = req.body
        const editado = await prisma.usuario.update({
            where: { id: req.usuario.id },
            data: { nombre, correo }
        })
        const { password, ...sinPass } = editado
        res.json(sinPass)
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar perfil' })
    }
})

// POST /api/usuarios/me/foto - Subir foto de perfil
router.post('/me/foto', upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No hay imagen' })

        const fileName = `perfil_${req.usuario.id}_${Date.now()}.${req.file.originalname.split('.').pop()}`
        const publicUrl = await subirImagenLogo(fileName, req.file.buffer, req.file.mimetype)

        await prisma.usuario.update({
            where: { id: req.usuario.id },
            data: { foto_url: publicUrl }
        })

        res.json({ foto_url: publicUrl })
    } catch (error) {
        res.status(500).json({ error: 'Error al subir foto de perfil' })
    }
})

export default router

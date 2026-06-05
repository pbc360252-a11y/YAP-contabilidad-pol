import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { validate, empresaSchema } from '../middleware/validate.js'

const router = Router()

// Obtener todas las empresas
router.get('/', verificarToken, async (req, res) => {
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

// Crear una nueva empresa (para entrada manual)
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador']), validate(empresaSchema), async (req, res) => {
    try {
        const { nombre } = req.body

        // Buscar si ya existe para evitar duplicados por nombre
        const existe = await prisma.empresa.findFirst({
            where: { nombre: { equals: nombre } }
        })

        if (existe) {
            return res.json({ mensaje: 'Empresa ya existe', empresa: existe })
        }

        const nueva = await prisma.empresa.create({
            data: {
                nombre,
                estado: 'activa'
            }
        })
        res.status(201).json({ mensaje: 'Empresa creada con éxito', empresa: nueva })
    } catch (error) {
        res.status(500).json({ error: 'Error al crear empresa' })
    }
})

export default router

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'

const router = Router()

// Obtener registros de auditoría con paginación, búsqueda y filtros
router.get('/', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 50
        const skip = (page - 1) * limit

        const { accion, entidad, q } = req.query

        const where = {
            ...(accion && { accion }),
            ...(entidad && { entidad }),
            ...(q && {
                OR: [
                    { usuario_nom: { contains: q } },
                    { accion: { contains: q } },
                    { entidad: { contains: q } },
                    { detalles: { contains: q } }
                ]
            })
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.auditLog.count({ where })
        ])

        res.json({
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener bitácora de auditoría' })
    }
})

export default router

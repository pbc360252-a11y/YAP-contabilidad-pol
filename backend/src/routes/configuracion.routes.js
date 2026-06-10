import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'

const router = Router()

// GET /api/configuracion
router.get('/', async (req, res) => {
    try {
        const configList = await prisma.configuracion.findMany()
        const configs = {}
        configList.forEach(c => configs[c.clave] = c.valor)
        res.json({ configuraciones: configs })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener configuraciones' })
    }
})

// PUT /api/configuracion
router.put('/', verificarToken, requiereRol(['superadmin']), async (req, res) => {
    try {
        const values = req.body // Espera { key1: 'value', key2: 'value' }
        for (const [clave, valor] of Object.entries(values)) {
            // No sobreescribir la API Key si se envía el valor enmascarado
            if (clave === 'email_resend_api_key' && (valor === '••••••••' || String(valor).includes('...'))) {
                continue
            }
            await prisma.configuracion.upsert({
                where: { clave },
                update: { valor: String(valor) },
                create: { clave, valor: String(valor) }
            })
        }

        res.json({ mensaje: 'Configuraciones actualizadas.' })
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' })
    }
})

import multer from 'multer'
import { subirImagenLogo } from '../services/storage.service.js'

const upload = multer({ storage: multer.memoryStorage() })

// POST /api/configuracion/logo
router.post('/logo', verificarToken, requiereRol(['superadmin']), upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' })

        const fileName = `logo_${Date.now()}.${req.file.originalname.split('.').pop()}`
        const publicUrl = await subirImagenLogo(fileName, req.file.buffer, req.file.mimetype)

        await prisma.configuracion.upsert({
            where: { clave: 'logo_empresa' },
            update: { valor: publicUrl },
            create: { clave: 'logo_empresa', valor: publicUrl }
        })

        res.json({ mensaje: 'Logo actualizado con éxito', url: publicUrl })
    } catch (error) {
        res.status(500).json({ error: 'Error al subir logo' })
    }
})

export default router

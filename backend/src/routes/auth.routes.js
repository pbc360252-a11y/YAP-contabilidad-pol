import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { verificarToken } from '../middleware/auth.js'
import { diagnosticarEmailService, enviarConfirmacionRegistro } from '../services/email.service.js'
import rateLimit from 'express-rate-limit'
import { validate, loginSchema } from '../middleware/validate.js'
import { generarTokens, renovarAccessToken, revocarRefreshToken } from '../services/token.service.js'

const router = Router()

// Rate limiter: máximo 5 intentos de login por IP en 15 minutos
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5,
    message: { error: 'Demasiados intentos de acceso. Por seguridad, espera 15 minutos antes de volver a intentarlo.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // No contar intentos exitosos
})

// Iniciar sesión
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { correo, password } = req.body

        if (!correo || !password) {
            return res.status(400).json({ error: 'Faltan credenciales.' })
        }

        const usuario = await prisma.usuario.findUnique({
            where: { correo }
        })

        if (!usuario || usuario.estado !== 'activo') {
            return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo.' })
        }

        const passCorrecta = await bcrypt.compare(password, usuario.password)
        if (!passCorrecta) {
            return res.status(401).json({ error: 'Credenciales inválidas.' })
        }

        // Genera access token + refresh token
        const { accessToken, refreshToken } = await generarTokens(usuario)

        const { password: _, ...usuarioSinPass } = usuario

        res.json({
            mensaje: 'Acceso correcto',
            token: accessToken,
            refreshToken,
            usuario: usuarioSinPass
        })
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' })
    }
})

// Renovar access token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body
        if (!refreshToken) {
            return res.status(400).json({ error: 'Se requiere el refreshToken.' })
        }

        const resultado = await renovarAccessToken(refreshToken)
        if (!resultado) {
            return res.status(401).json({ error: 'Refresh token inválido o expirado. Por favor inicia sesión nuevamente.' })
        }

        res.json({
            mensaje: 'Token renovado',
            token: resultado.accessToken,
            usuario: resultado.usuario
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al renovar sesión' })
    }
})

// Cerrar sesión
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body
        await revocarRefreshToken(refreshToken)
        res.json({ mensaje: 'Sesión terminada exitosamente.' })
    } catch (error) {
        res.status(500).json({ error: 'Error al cerrar sesión' })
    }
})

// Obtener sesión actual
router.get('/me', verificarToken, (req, res) => {
    res.json({ usuario: req.usuario })
})

// ── Diagnóstico del Servicio de Correo ─────────────────────────
// GET /api/auth/test-email → Verifica configuración sin enviar
router.get('/test-email', verificarToken, (req, res) => {
    const diagnostico = diagnosticarEmailService()
    res.json({
        mensaje: diagnostico.configurado
            ? '✅ Servicio de correo configurado y listo para enviar'
            : '⚠️ Servicio de correo en modo simulación (sin RESEND_API_KEY)',
        ...diagnostico
    })
})

// POST /api/auth/test-email → Envía un correo de prueba real al admin logueado
router.post('/test-email', verificarToken, async (req, res) => {
    try {
        const emailDestino = req.body.email || req.usuario.correo
        if (!emailDestino) {
            return res.status(400).json({ error: 'No hay correo de destino. Pasa { email: "tu@correo.com" } en el body.' })
        }

        const resultado = await enviarConfirmacionRegistro({
            email: emailDestino,
            nombreCompleto: req.usuario.nombre || 'Administrador YAP',
            numeroTurno: 0  // Número simbólico para el correo de prueba
        })

        res.json({
            mensaje: resultado.sent
                ? `✅ Correo de prueba enviado exitosamente a ${emailDestino}`
                : `📋 Correo simulado (sin RESEND_API_KEY). Revisar carpeta temp_emails/ en el servidor.`,
            ...resultado,
            destino: emailDestino
        })
    } catch (error) {
        res.status(500).json({ error: 'Error al enviar correo de prueba' })
    }
})

export default router


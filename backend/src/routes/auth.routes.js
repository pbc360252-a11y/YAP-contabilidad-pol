import { Router } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { verificarToken } from '../middleware/auth.js'
import { diagnosticarEmailService, enviarConfirmacionRegistro } from '../services/email.service.js'
import rateLimit from 'express-rate-limit'
import { validate, loginSchema } from '../middleware/validate.js'
import { generarTokens, renovarAccessToken, revocarRefreshToken, REFRESH_TOKEN_EXPIRY_DAYS } from '../services/token.service.js'

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

        // Actualizar último acceso del usuario
        const usuarioActualizado = await prisma.usuario.update({
            where: { id: usuario.id },
            data: { ultimoAcceso: new Date() }
        })

        // Genera access token + refresh token
        const { accessToken, refreshToken } = await generarTokens(usuarioActualizado)

        const { password: _, ...usuarioSinPass } = usuarioActualizado

        // ── RefreshToken en httpOnly cookie (no accesible desde JS) ──────────
        const isProd = process.env.NODE_ENV === 'production'
        res.cookie('yap_refresh', refreshToken, {
            httpOnly: true,                    // No accesible desde JavaScript
            secure: isProd,                    // Solo HTTPS en producción
            sameSite: isProd ? 'Strict' : 'Lax',
            maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // Sincronizado con BD (30 días)
            path: '/api/auth'                  // Limitar alcance de la cookie
        })

        res.json({
            mensaje: 'Acceso correcto',
            token: accessToken,
            usuario: usuarioSinPass
        })
    } catch (error) {
        console.error('[auth/login]', error)
        res.status(500).json({ error: 'Error interno del servidor' })
    }
})

// Renovar access token — lee el refreshToken desde cookie httpOnly
router.post('/refresh', async (req, res) => {
    try {
        // Leer de cookie (seguro) con fallback al body para compatibilidad offline/dev
        const refreshToken = req.cookies?.yap_refresh || req.body?.refreshToken
        if (!refreshToken) {
            return res.status(400).json({ error: 'Se requiere el refreshToken.' })
        }

        const resultado = await renovarAccessToken(refreshToken)
        if (!resultado) {
            res.clearCookie('yap_refresh', { path: '/api/auth' })
            return res.status(401).json({ error: 'Refresh token inválido o expirado. Por favor inicia sesión nuevamente.' })
        }

        // Refresh Token Rotation: actualizar la cookie con el nuevo token rotado
        const isProd = process.env.NODE_ENV === 'production'
        res.cookie('yap_refresh', resultado.newRefreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? 'Strict' : 'Lax',
            maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // Sincronizado con BD
            path: '/api/auth'
        })

        res.json({
            mensaje: 'Token renovado',
            token: resultado.accessToken,
            usuario: resultado.usuario
        })
    } catch (error) {
        console.error('[auth/refresh]', error)
        res.status(500).json({ error: 'Error al renovar sesión' })
    }
})

// Cerrar sesión — revoca token en BD y borra la cookie
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.yap_refresh || req.body?.refreshToken
        if (refreshToken) await revocarRefreshToken(refreshToken)
        res.clearCookie('yap_refresh', { path: '/api/auth' })
        res.json({ mensaje: 'Sesión terminada exitosamente.' })
    } catch (error) {
        console.error('[auth/logout]', error)
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


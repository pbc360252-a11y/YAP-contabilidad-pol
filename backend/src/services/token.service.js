import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { jwtSecret } from '../middleware/auth.js'

// ── Configuración de tokens ──────────────────────────────────────────────────
const ACCESS_TOKEN_EXPIRY      = '15m'   // Access token: 15 minutos (reduce ventana de token robado)
export const REFRESH_TOKEN_EXPIRY_DAYS = 30     // Refresh token: 30 días (usado en BD y en la cookie)

/**
 * Genera un par de tokens: access token (JWT corto) + refresh token (aleatorio largo)
 */
export const generarTokens = async (usuario) => {
    // 1. Access Token (JWT firmado)
    const accessToken = jwt.sign(
        { id: usuario.id, rol: usuario.rol },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )

    // 2. Refresh Token (cadena aleatoria + fecha de expiración)
    const refreshTokenValue = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

    // 3. Guardar refresh token en BD (invalida los anteriores del mismo usuario si quieres sesión única)
    await prisma.refreshToken.create({
        data: {
            token: refreshTokenValue,
            usuario_id: usuario.id,
            expires_at: expiresAt
        }
    })

    return { accessToken, refreshToken: refreshTokenValue, expiresIn: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 }
}

/**
 * Renueva el access token usando un refresh token válido.
 * Implementa Refresh Token Rotation: el token usado se invalida y se emite uno nuevo.
 * Retorna null si el refresh token es inválido o expiró.
 */
export const renovarAccessToken = async (refreshTokenValue) => {
    if (!refreshTokenValue) return null

    const stored = await prisma.refreshToken.findUnique({
        where: { token: refreshTokenValue },
        include: { usuario: true }
    })

    if (!stored) return null
    if (stored.expires_at < new Date()) {
        // Token expirado → limpiarlo de la BD
        await prisma.refreshToken.delete({ where: { id: stored.id } })
        return null
    }
    if (!stored.usuario || stored.usuario.estado !== 'activo') return null

    // ── Refresh Token Rotation ────────────────────────────────────────────────
    // 1. Revocar el token actual (uso único)
    await prisma.refreshToken.delete({ where: { id: stored.id } })

    // 2. Emitir nuevo refresh token
    const newRefreshTokenValue = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)
    await prisma.refreshToken.create({
        data: {
            token: newRefreshTokenValue,
            usuario_id: stored.usuario.id,
            expires_at: expiresAt
        }
    })

    // 3. Emitir nuevo access token
    const accessToken = jwt.sign(
        { id: stored.usuario.id, rol: stored.usuario.rol },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )

    const { password, ...usuarioSinPass } = stored.usuario
    return { accessToken, newRefreshToken: newRefreshTokenValue, usuario: usuarioSinPass }
}

/**
 * Invalida (revoca) un refresh token específico — usado en logout
 */
export const revocarRefreshToken = async (refreshTokenValue) => {
    if (!refreshTokenValue) return
    await prisma.refreshToken.deleteMany({ where: { token: refreshTokenValue } }).catch(() => {})
}

/**
 * Limpia todos los refresh tokens expirados de la BD (llamar desde cron)
 */
export const limpiarTokensExpirados = async () => {
    const result = await prisma.refreshToken.deleteMany({
        where: { expires_at: { lt: new Date() } }
    })
    return result.count
}

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Routes
import authRoutes from './routes/auth.routes.js'
import configuracionRoutes from './routes/configuracion.routes.js'
import tasasRoutes from './routes/tasas.routes.js'
import tiposPrestamoRoutes from './routes/tipos-prestamo.routes.js'
import personasRoutes from './routes/personas.routes.js'
import prestamosRoutes from './routes/prestamos.routes.js'
import cuotasRoutes from './routes/cuotas.routes.js'
import pagosRoutes from './routes/pagos.routes.js'
import informesRoutes from './routes/informes.routes.js'
import usuariosRoutes from './routes/usuarios.routes.js'
import empresasRoutes from './routes/empresas.routes.js'
import statsRoutes from './routes/stats.routes.js'
import publicoRoutes from './routes/publico.routes.js'
import clienteRoutes from './routes/cliente.routes.js'
import auditoriaRoutes from './routes/auditoria.routes.js'
import { iniciarCronJobs } from './services/cron.service.js'


import { prisma } from './lib/prisma.js'
const app = express()

// Cabeceras de seguridad HTTP con Helmet
app.use(helmet({
    crossOriginResourcePolicy: false, // Permitir cargar imágenes locales o de Supabase sin CORS estricto en el navegador
}))

// Confiar en el proxy inverso (necesario para express-rate-limit detrás de Render/Vercel/Cloudflare)
app.set('trust proxy', 1)

// ── Rate Limiting Global ───────────────────────────────────────────────────
// Protege toda la API: máx 200 peticiones por IP cada 15 minutos
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Demasiadas peticiones desde tu IP. Por favor espera unos minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health' // No limitar el healthcheck
})
app.use('/api', apiLimiter)
// ──────────────────────────────────────────────────────────────────────────

const allowedOrigins = [
    'http://localhost:5173',
    'https://yap-contabilidad-pol-4.onrender.com',
    'https://yap-contabilidad-pol-2.onrender.com',
    'https://yap-contabilidad-pol-1.onrender.com',
    'https://yap-frontend.onrender.com'
]

app.use(cors({
    origin: (origin, callback) => {
        // Permitir peticiones sin origen (como curl o Postman)
        if (!origin) return callback(null, true);
        
        const isAllowedOrigin = allowedOrigins.includes(origin) || 
                          origin.endsWith('.onrender.com')

        // localhost solo permitido fuera de producción
        const isLocalhost = process.env.NODE_ENV !== 'production' &&
                            origin.startsWith('http://localhost:')
                          
        if (isAllowedOrigin || isLocalhost || (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    credentials: true
}))
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Rutas base
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', info: 'YAP (CRÉDITOS POR LIBRANZA) API' })
})

app.use('/api/publico', publicoRoutes)
app.use('/api/cliente', clienteRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/configuracion', configuracionRoutes)
app.use('/api/tasas', tasasRoutes)
app.use('/api/tipos-prestamo', tiposPrestamoRoutes)
app.use('/api/personas', personasRoutes)
app.use('/api/prestamos', prestamosRoutes)
app.use('/api/cuotas', cuotasRoutes)
app.use('/api/pagos', pagosRoutes)
app.use('/api/informes', informesRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/empresas', empresasRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/auditoria', auditoriaRoutes)

// Inicializar Cron Jobs
iniciarCronJobs()

// Error handler centralizado
// En producción oculta los detalles internos; en desarrollo los muestra
app.use((err, req, res, next) => {
    console.error('[ERROR]', err)
    const isProd = process.env.NODE_ENV === 'production'
    res.status(err.status || 500).json({
        error: err.message || 'Ha ocurrido un error en el servidor.',
        ...(isProd ? {} : { detail: err.message, stack: err.stack })
    })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`)
})

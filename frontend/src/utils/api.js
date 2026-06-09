import axios from 'axios'
import { useStore } from '../store/useStore'

// mockDb se carga dinámicamente SOLO si el modo offline está permitido.
// Esto evita que las 9.741 líneas entren en el bundle de producción.
let _mockDb = null
const getMockDb = async () => {
    if (!_mockDb) {
        const mod = await import('./mockDb')
        _mockDb = mod.mockDb
    }
    return _mockDb
}

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
    headers: {
        'Content-Type': 'application/json'
    }
})

// Controladores para el modo fuera de línea (Offline Mode)
const isOfflineDemoAllowed = () => {
    // Permitir por defecto en desarrollo local, o si se activa explícitamente vía variable de entorno
    return import.meta.env.DEV || import.meta.env.VITE_ALLOW_OFFLINE_DEMO === 'true'
}

export const isOffline = () => {
    if (!isOfflineDemoAllowed()) return false
    return localStorage.getItem('yap_offline_mode') === 'true'
}

export const enableOfflineMode = () => {
    if (!isOfflineDemoAllowed()) return
    localStorage.setItem('yap_offline_mode', 'true')
}

export const disableOfflineMode = () => localStorage.removeItem('yap_offline_mode')

// Función auxiliar para determinar si debemos activar el modo offline tras un fallo
const shouldTriggerOffline = (err) => {
    if (!isOfflineDemoAllowed()) return false
    if (!err.response) return true; // Error de red (el servidor está apagado)
    const status = err.response.status;
    return status === 404 || status === 502 || status === 503 || status === 504;
}

const wrapMockResponse = (response) => {
    if (response && response.status >= 300) {
        const error = new Error('Request failed with status code ' + response.status);
        error.response = response;
        throw error;
    }
    return response;
};

// Interceptores y wrappers para desviar llamadas a LocalStorage si el backend no responde
const originalGet = api.get
api.get = async function (url, config) {
    // Las rutas públicas NUNCA deben ir al modo offline
    const isPublicRoute = url.startsWith('/publico') || url.startsWith('publico')
    if (isOffline() && !isPublicRoute) {
        if (import.meta.env.DEV) console.log(`[Offline GET] ${url}`)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineRequest('GET', url, undefined, db))
    }
    try {
        return await originalGet.apply(this, arguments)
    } catch (err) {
        if (!isPublicRoute && shouldTriggerOffline(err)) {
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] GET ${url}`)
            enableOfflineMode()
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineRequest('GET', url, undefined, db))
        }
        throw err
    }
}

const originalPost = api.post
api.post = async function (url, data, config) {
    const isPublicRoute = url.startsWith('/publico') || url.startsWith('publico')
    if (isOffline() && !isPublicRoute) {
        if (import.meta.env.DEV) console.log(`[Offline POST] ${url}`, data)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineRequest('POST', url, data, db))
    }
    try {
        return await originalPost.apply(this, arguments)
    } catch (err) {
        if (!isPublicRoute && shouldTriggerOffline(err)) {
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] POST ${url}`)
            enableOfflineMode()
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineRequest('POST', url, data, db))
        }
        throw err
    }
}

const originalPut = api.put
api.put = async function (url, data, config) {
    if (isOffline()) {
        if (import.meta.env.DEV) console.log(`[Offline PUT] ${url}`, data)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineRequest('PUT', url, data, db))
    }
    try {
        return await originalPut.apply(this, arguments)
    } catch (err) {
        if (shouldTriggerOffline(err)) {
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] PUT ${url}`)
            enableOfflineMode()
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineRequest('PUT', url, data, db))
        }
        throw err
    }
}

const originalDelete = api.delete
api.delete = async function (url, config) {
    if (isOffline()) {
        if (import.meta.env.DEV) console.log(`[Offline DELETE] ${url}`)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineRequest('DELETE', url, undefined, db))
    }
    try {
        return await originalDelete.apply(this, arguments)
    } catch (err) {
        if (shouldTriggerOffline(err)) {
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] DELETE ${url}`)
            enableOfflineMode()
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineRequest('DELETE', url, undefined, db))
        }
        throw err
    }
}

function handleOfflineRequest(method, url, data, mockDb) {
    // cleanUrl: quita el query string y el slash inicial. ej. "/personas/buscar?q=juan" -> "personas/buscar"
    const cleanUrl = url.split('?')[0].replace(/^\//, '');
    const seg = cleanUrl.split('/'); // seg[0]=recurso, seg[1]=id, seg[2]=sub-id

    // ── Auditoria ─────────────────────────────────────────────────────────────
    if (cleanUrl === 'auditoria') {
        const qMatch = url.match(/[?&]q=([^&]*)/)
        const q = qMatch ? decodeURIComponent(qMatch[1]) : ''
        const accMatch = url.match(/[?&]accion=([^&]*)/)
        const acc = accMatch ? decodeURIComponent(accMatch[1]) : ''
        const entMatch = url.match(/[?&]entidad=([^&]*)/)
        const ent = entMatch ? decodeURIComponent(entMatch[1]) : ''
        const pageMatch = url.match(/[?&]page=([^&]*)/)
        const page = pageMatch ? parseInt(decodeURIComponent(pageMatch[1])) : 1
        const limitMatch = url.match(/[?&]limit=([^&]*)/)
        const limit = limitMatch ? parseInt(decodeURIComponent(limitMatch[1])) : 15
        return mockDb.getAuditoria(q, acc, ent, page, limit)
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (cleanUrl === 'auth/login') {
        return mockDb.login(data?.correo, data?.password)
    }

    // ── Configuración ─────────────────────────────────────────────────────────
    if (cleanUrl === 'configuracion') {
        return method === 'GET' ? mockDb.getConfiguracion() : mockDb.updateConfiguracion(data)
    }

    // ── Cuotas ────────────────────────────────────────────────────────────────
    if (cleanUrl === 'cuotas/vencidas') {
        return mockDb.getCuotasVencidas()
    }
    if (cleanUrl === 'cuotas/proximas') {
        return mockDb.getCuotasProximas()
    }

    // ── Tasas ─────────────────────────────────────────────────────────────────
    if (cleanUrl === 'tasas') {
        return method === 'GET' ? mockDb.getTasas() : mockDb.createTasa(data)
    }
    if (cleanUrl === 'tasas/reordenar') {
        return mockDb.reordenarTasas(data)
    }
    if (seg[0] === 'tasas' && seg[1]) {
        return method === 'PUT' ? mockDb.updateTasa(seg[1], data) : mockDb.deleteTasa(seg[1])
    }

    // ── Tipos Préstamo ────────────────────────────────────────────────────────
    if (cleanUrl === 'tipos-prestamo') {
        return method === 'GET' ? mockDb.getTipos() : mockDb.createTipo(data)
    }
    if (seg[0] === 'tipos-prestamo' && seg[1]) {
        return method === 'PUT' ? mockDb.updateTipo(seg[1], data) : mockDb.deleteTipo(seg[1])
    }

    // ── Rutas Públicas ────────────────────────────────────────────────────────
    if (cleanUrl === 'publico/empresas') {
        // En modo offline devolvemos las empresas del mockDb con el formato correcto
        const result = mockDb.getEmpresas()
        const empresas = result?.data?.empresas || result?.data || []
        return { status: 200, data: { empresas: Array.isArray(empresas) ? empresas : [] } }
    }
    if (cleanUrl === 'publico/solicitar') {
        return { status: 200, data: { message: 'Solicitud registrada (modo offline)', persona: { turno: 'N/A' } } }
    }

    // ── Empresas ──────────────────────────────────────────────────────────────
    if (cleanUrl === 'empresas') {
        return method === 'GET' ? mockDb.getEmpresas() : mockDb.createEmpresa(data)
    }
    if (seg[0] === 'empresas' && seg[1]) {
        return method === 'PUT' ? mockDb.updateEmpresa(seg[1], data) : mockDb.deleteEmpresa(seg[1])
    }

    // ── Personas ──────────────────────────────────────────────────────────────
    if (cleanUrl === 'personas') {
        return method === 'GET' ? mockDb.getPersonas() : mockDb.createPersona(data)
    }
    // personas/buscar?q=... DEBE ir antes de personas/:id
    if (cleanUrl === 'personas/buscar') {
        const qMatch = url.match(/[?&]q=([^&]*)/)
        const q = qMatch ? decodeURIComponent(qMatch[1]) : ''
        return mockDb.buscarPersonas(q)
    }
    if (seg[0] === 'personas' && seg[1]) {
        if (method === 'GET') return mockDb.getPersonaById(seg[1])
        return method === 'PUT' ? mockDb.updatePersona(seg[1], data) : mockDb.deletePersona(seg[1])
    }

    // ── Préstamos ─────────────────────────────────────────────────────────────
    if (cleanUrl === 'prestamos') {
        return method === 'GET' ? mockDb.getPrestamos() : mockDb.createPrestamo(data)
    }
    // prestamos/todos/detallados DEBE ir antes de prestamos/:id
    if (cleanUrl === 'prestamos/todos/detallados') {
        return mockDb.getPrestamosTodosDetallados()
    }
    // prestamos/persona/:id DEBE ir antes de prestamos/:id
    if (seg[0] === 'prestamos' && seg[1] === 'persona' && seg[2]) {
        return mockDb.getPrestamosByPersona(seg[2])
    }
    if (seg[0] === 'prestamos' && seg[1]) {
        if (method === 'GET') return mockDb.getPrestamoById(seg[1])
        return method === 'PUT' ? mockDb.updatePrestamo(seg[1], data) : mockDb.deletePrestamo(seg[1])
    }

    // ── Pagos ─────────────────────────────────────────────────────────────────
    if (cleanUrl === 'pagos') {
        return method === 'GET' ? mockDb.getPagos() : mockDb.registrarPago(data)
    }
    if (cleanUrl === 'pagos/masivo') {
        return mockDb.procesarRecaudoMasivo(data)
    }

    // ── Informes ──────────────────────────────────────────────────────────────
    if (cleanUrl === 'informes') {
        return method === 'GET' ? mockDb.getInformes() : mockDb.createInforme(data)
    }
    if (seg[0] === 'informes' && seg[1] === 'generar-extracto' && seg[2]) {
        return mockDb.generarExtracto(seg[2])
    }

    // ── Usuarios / Perfil ─────────────────────────────────────────────────────
    if (cleanUrl === 'usuarios') {
        return method === 'GET' ? mockDb.getUsuarios() : mockDb.createUsuario(data)
    }
    if (seg[0] === 'usuarios' && seg[1] && seg[1] !== 'me') {
        return method === 'PUT' ? mockDb.updateUsuario(seg[1], data) : mockDb.deleteUsuario(seg[1])
    }
    if (cleanUrl === 'usuarios/me/perfil') {
        return mockDb.actualizarPerfil(data)
    }
    if (cleanUrl === 'usuarios/me/foto') {
        return mockDb.actualizarFoto(data)
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    if (cleanUrl === 'stats') {
        return mockDb.getStats()
    }

    // Fallback para rutas no mapeadas
    return { status: 200, data: {} }
}

api.interceptors.request.use(config => {
    const token = useStore.getState().token
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    // Las cookies httpOnly (yap_refresh) se envían automáticamente por el navegador
    // con credentials:true — no necesitamos gestionarlas aquí
    return config
}, error => {
    return Promise.reject(error)
})

// Control para evitar múltiples refreshes simultáneos
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error)
        else prom.resolve(token)
    })
    failedQueue = []
}

api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config

        // Si es 401 y no es la ruta de refresh/login (evitar bucle infinito)
        const isAuthRoute = originalRequest?.url?.includes('/auth/refresh') ||
                            originalRequest?.url?.includes('/auth/login')

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
            if (isRefreshing) {
                // Cola de peticiones mientras se refresca
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`
                    return axios(originalRequest)
                }).catch(err => Promise.reject(err))
            }

            originalRequest._retry = true
            isRefreshing = true

            try {
                // El navegador envía la cookie httpOnly yap_refresh automáticamente
                const { data } = await axios.post(
                    `${api.defaults.baseURL}/auth/refresh`,
                    {},
                    { withCredentials: true }
                )

                const newToken = data.token
                useStore.getState().setToken(newToken, data.usuario)
                processQueue(null, newToken)

                originalRequest.headers.Authorization = `Bearer ${newToken}`
                return axios(originalRequest)
            } catch (refreshError) {
                // Cookie expirada o revocada — forzar logout
                processQueue(refreshError, null)
                useStore.getState().logout()
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login'
                }
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }

        return Promise.reject(error)
    }
)

export default api

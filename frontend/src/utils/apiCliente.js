import axios from 'axios'
import { isOffline } from './api'

// mockDb se carga dinámicamente SOLO si el modo offline está permitido.
let _mockDb = null
const getMockDb = async () => {
    if (!_mockDb) {
        const mod = await import('./mockDb')
        _mockDb = mod.mockDb
    }
    return _mockDb
}

const apiCliente = axios.create({
    baseURL: `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/cliente`,
    headers: {
        'Content-Type': 'application/json'
    }
})

const wrapMockResponse = (response) => {
    if (response && response.status >= 300) {
        const error = new Error('Request failed with status code ' + response.status);
        error.response = response;
        throw error;
    }
    return response;
};

// Interceptores y wrappers para desviar llamadas a LocalStorage si el backend no responde
const originalGet = apiCliente.get
apiCliente.get = async function (url, config) {
    if (isOffline()) {
        if (import.meta.env.DEV) console.log(`[Offline Client GET] ${url}`)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineClientRequest('GET', url, undefined, db))
    }
    try {
        return await originalGet.apply(this, arguments)
    } catch (err) {
        if (!err.response) { // Servidor apagado
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] Client GET ${url}`)
            localStorage.setItem('yap_offline_mode', 'true')
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineClientRequest('GET', url, undefined, db))
        }
        throw err
    }
}

const originalPost = apiCliente.post
apiCliente.post = async function (url, data, config) {
    if (isOffline()) {
        if (import.meta.env.DEV) console.log(`[Offline Client POST] ${url}`, data)
        const db = await getMockDb()
        return wrapMockResponse(handleOfflineClientRequest('POST', url, data, db))
    }
    try {
        return await originalPost.apply(this, arguments)
    } catch (err) {
        if (!err.response) {
            if (import.meta.env.DEV) console.warn(`[Error de Servidor - Activando Modo Offline] Client POST ${url}`)
            localStorage.setItem('yap_offline_mode', 'true')
            const db = await getMockDb()
            return wrapMockResponse(handleOfflineClientRequest('POST', url, data, db))
        }
        throw err
    }
}

function handleOfflineClientRequest(method, url, data, db) {
    const cleanUrl = url.split('?')[0].replace(/^\//, '');
    
    // Obtener la ID del cliente autenticado del token mockeado o localStorage
    const currentCliente = JSON.parse(localStorage.getItem('clienteUsuario') || '{}');
    const clienteId = currentCliente.id || 'per-1'; // fallback a per-1 si no hay sesión
    
    if (cleanUrl === 'auth/login') {
        return db.loginCliente(data?.cedula, data?.password)
    }
    if (cleanUrl === 'dashboard') {
        return db.getClienteDashboard(clienteId)
    }
    if (cleanUrl === 'prestamos') {
        return db.getClientePrestamos(clienteId)
    }
    if (cleanUrl === 'pagos') {
        return db.getClientePagos(clienteId)
    }
    if (cleanUrl === 'perfil/cambiar-pin') {
        return db.cambiarPinCliente(clienteId, data?.nuevoPin)
    }
    
    return { status: 200, data: {} }
}

apiCliente.interceptors.request.use(config => {
    const token = localStorage.getItem('clienteToken')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
}, error => {
    return Promise.reject(error)
})

// Interceptor para redirección al login en caso de vencimiento
apiCliente.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            // Eliminar token expirado
            localStorage.removeItem('clienteToken')
            localStorage.removeItem('clienteUsuario')
            
            // Redirigir si no está ya en la pantalla de login
            if (window.location.pathname.startsWith('/portal') && window.location.pathname !== '/portal/login') {
                window.location.href = '/portal/login'
            }
        }
        return Promise.reject(error)
    }
)

export default apiCliente

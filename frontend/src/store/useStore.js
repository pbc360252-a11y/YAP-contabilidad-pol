import { create } from 'zustand'

export const useStore = create((set) => ({
    usuario: JSON.parse(localStorage.getItem('usuario')) || null,
    token: localStorage.getItem('token') || null,
    refreshToken: localStorage.getItem('refreshToken') || null,

    login: (usuario, token, refreshToken) => {
        localStorage.setItem('usuario', JSON.stringify(usuario))
        localStorage.setItem('token', token)
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
        set({ usuario, token, refreshToken: refreshToken || null })
    },

    // Actualiza solo el access token (llamado por el interceptor de refresh)
    setToken: (token, usuario = null) => {
        localStorage.setItem('token', token)
        if (usuario) localStorage.setItem('usuario', JSON.stringify(usuario))
        set((state) => ({
            token,
            usuario: usuario || state.usuario
        }))
    },

    logout: () => {
        localStorage.removeItem('usuario')
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        set({ usuario: null, token: null, refreshToken: null })
    },

    // UI state
    sidebarAbierta: true,
    vistaPremium: true, // true = Premium (dark/glass), false = Standard (corporate/clean)
    notificaciones: [],   // Se cargan desde el backend al iniciar sesión
    atencionPendiente: 0,

    toggleSidebar: () => set((state) => ({ sidebarAbierta: !state.sidebarAbierta })),
    setVistaPremium: (valor) => set({ vistaPremium: valor }),
    limpiarNotificaciones: () => set({ notificaciones: [] }),
    eliminarNotificacion: (id) => set((state) => ({
        notificaciones: state.notificaciones.filter(n => n.id !== id)
    })),
    quitarAtencion: () => set((state) => ({
        atencionPendiente: Math.max(0, state.atencionPendiente - 1)
    }))
}))

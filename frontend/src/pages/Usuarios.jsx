import React, { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import {
    Users, UserPlus, Search, ChevronLeft, ChevronRight,
    Edit2, Trash2, X, Eye, EyeOff, ShieldCheck,
    Shield, User, Building2, Calendar, CheckCircle, XCircle,
    AlertTriangle, Mail, Lock, ChevronDown
} from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const ROLES = [
    { value: 'superadmin', label: 'Superadmin', color: 'cyan' },
    { value: 'administrador', label: 'Administrador', color: 'green' },
    { value: 'operador', label: 'Operador', color: 'slate' },
]

const POR_PAGINA = 5

/* ──────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────── */
function RolBadge({ rol }) {
    const cfg = {
        superadmin: 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20',
        administrador: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
        operador: 'bg-slate-500/10 text-[var(--texto-2)] border border-slate-500/20',
    }
    const labels = { superadmin: 'Superadmin', administrador: 'Administrador', operador: 'Operador' }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${cfg[rol] ?? cfg.operador}`}>
            {rol === 'superadmin' && <ShieldCheck size={11} />}
            {rol === 'administrador' && <Shield size={11} />}
            {rol === 'operador' && <User size={11} />}
            {labels[rol] ?? rol}
        </span>
    )
}

function Avatar({ initials, foto_url, size = 'md' }) {
    const colors = [
        'from-cyan-600 to-cyan-400',
        'from-emerald-600 to-emerald-400',
        'from-violet-600 to-violet-400',
        'from-amber-600 to-amber-400',
        'from-rose-600 to-rose-400',
        'from-cyan-600 to-cyan-400',
    ]
    const content = initials || '?'
    const idx = (content.charCodeAt(0) + (content.charCodeAt(1) || 0)) % colors.length
    const sz = size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs'

    return (
        <div className={`${sz} rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0 relative overflow-hidden underline-none`}>
            {foto_url ? (
                <img
                    src={foto_url.startsWith('http') ? foto_url : `${SERVER_URL}${foto_url}`}
                    alt="Foto"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            ) : null}
            <span className={foto_url ? 'absolute' : ''}>{content}</span>
        </div>
    )
}

function formatFecha(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatFechaCorta(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ──────────────────────────────────────────────
   MODAL CREAR / EDITAR
   ────────────────────────────────────────────── */
function ModalUsuario({ usuario, onClose, onGuardar }) {
    const esEdicion = !!usuario?.id
    const [empresas, setEmpresas] = useState([])
    const [form, setForm] = useState({
        nombre: usuario?.nombre || '',
        email: usuario?.email || '',
        password: '',
        rol: usuario?.rol || 'operador',
        empresa: usuario?.empresa || '',
        estado: usuario?.estado ?? true,
    })
    const [verPass, setVerPass] = useState(false)
    const [errores, setErrores] = useState({})

    useEffect(() => {
        api.get('/empresas')
            .then(res => {
                const lista = res.data?.empresas || []
                setEmpresas(lista)
                if (!form.empresa && lista.length > 0) {
                    setForm(f => ({ ...f, empresa: lista[0].nombre }))
                }
            })
            .catch(console.error)
    }, [])

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const validar = () => {
        const e = {}
        if (!form.nombre.trim()) e.nombre = 'El nombre es requerido'
        if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Correo inválido'
        if (!esEdicion && !form.password.trim()) e.password = 'La contraseña es requerida'
        if (form.password && form.password.length < 6) e.password = 'Mínimo 6 caracteres'
        setErrores(e)
        return Object.keys(e).length === 0
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!validar()) return
        await onGuardar({ ...usuario, ...form })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--borde)]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--cyan)]/10 border border-[var(--cyan)]/20 flex items-center justify-center">
                            {esEdicion ? <Edit2 size={18} className="text-[var(--cyan)]" /> : <UserPlus size={18} className="text-[var(--cyan)]" />}
                        </div>
                        <div>
                            <h2 className="text-[var(--texto-1)] font-bold text-lg">{esEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                            <p className="text-[var(--texto-3)] text-xs">{esEdicion ? 'Modifica los datos del usuario' : 'Completa el formulario para crear'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--texto-3)] hover:text-[var(--texto-1)] hover:bg-[var(--fondo-base)] rounded-lg transition-all">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Nombre */}
                    <div>
                        <label className="block text-[var(--texto-3)] text-xs font-bold uppercase tracking-wider mb-1.5">Nombre Completo</label>
                        <input
                            type="text"
                            value={form.nombre}
                            onChange={e => set('nombre', e.target.value)}
                            placeholder="Ej: Carlos Andrés Pérez"
                            className={`w-full bg-[var(--fondo-base)] border ${errores.nombre ? 'border-red-500' : 'border-[var(--borde)]'} rounded-xl px-4 py-2.5 text-[var(--texto-1)] placeholder-[var(--texto-3)] text-sm focus:outline-none focus:border-[var(--cyan)] focus:ring-1 focus:ring-[var(--cyan)]/50 transition-all`}
                        />
                        {errores.nombre && <p className="text-red-400 text-xs mt-1">{errores.nombre}</p>}
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-[var(--texto-3)] text-xs font-bold uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                        <div className="relative">
                            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => set('email', e.target.value)}
                                placeholder="usuario@empresa.com"
                                className={`w-full bg-[var(--fondo-base)] border ${errores.email ? 'border-red-500' : 'border-[var(--borde)]'} rounded-xl pl-10 pr-4 py-2.5 text-[var(--texto-1)] placeholder-[var(--texto-3)] text-sm focus:outline-none focus:border-[var(--cyan)] focus:ring-1 focus:ring-[var(--cyan)]/50 transition-all`}
                            />
                        </div>
                        {errores.email && <p className="text-red-400 text-xs mt-1">{errores.email}</p>}
                    </div>

                    {/* Contraseña */}
                    <div>
                        <label className="block text-[var(--texto-3)] text-xs font-bold uppercase tracking-wider mb-1.5">
                            {esEdicion ? 'Nueva Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
                        </label>
                        <div className="relative">
                            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                            <input
                                type={verPass ? 'text' : 'password'}
                                value={form.password}
                                onChange={e => set('password', e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                className={`w-full bg-[var(--fondo-base)] border ${errores.password ? 'border-red-500' : 'border-[var(--borde)]'} rounded-xl pl-10 pr-10 py-2.5 text-[var(--texto-1)] placeholder-[var(--texto-3)] text-sm focus:outline-none focus:border-[var(--cyan)] focus:ring-1 focus:ring-[var(--cyan)]/50 transition-all`}
                            />
                            <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)] hover:text-[var(--texto-1)] transition-colors">
                                {verPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {errores.password && <p className="text-red-400 text-xs mt-1">{errores.password}</p>}
                    </div>

                    {/* Rol + Empresa (2 columnas) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[var(--texto-3)] text-xs font-bold uppercase tracking-wider mb-1.5">Rol</label>
                            <div className="relative">
                                <select
                                    value={form.rol}
                                    onChange={e => set('rol', e.target.value)}
                                    className="w-full bg-[var(--fondo-base)] border border-[var(--borde)] rounded-xl px-4 py-2.5 text-[var(--texto-1)] text-sm focus:outline-none focus:border-[var(--cyan)] appearance-none cursor-pointer transition-all"
                                >
                                    {ROLES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)] pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[var(--texto-3)] text-xs font-bold uppercase tracking-wider mb-1.5">Empresa</label>
                            <div className="relative">
                                <select
                                    value={form.empresa}
                                    onChange={e => set('empresa', e.target.value)}
                                    className="w-full bg-[var(--fondo-base)] border border-[var(--borde)] rounded-xl px-4 py-2.5 text-[var(--texto-1)] text-sm focus:outline-none focus:border-[var(--cyan)] appearance-none cursor-pointer transition-all"
                                >
                                    <option value="" disabled>Seleccione una empresa</option>
                                    {empresas.map(emp => (
                                        <option key={emp.id} value={emp.nombre}>{emp.nombre}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)] pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Estado toggle */}
                    <div className="flex items-center justify-between p-4 bg-[var(--fondo-base)]/50 border border-[var(--borde)] rounded-xl">
                        <div>
                            <p className="text-[var(--texto-1)] text-sm font-bold">Estado del usuario</p>
                            <p className="text-[var(--texto-3)] text-xs mt-0.5">El usuario podrá o no iniciar sesión</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => set('estado', !form.estado)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${form.estado ? 'bg-[var(--cyan)]' : 'bg-[var(--borde-hover)]'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.estado ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-[var(--texto-1)] hover:border-[var(--texto-2)] rounded-xl text-sm font-bold transition-all">
                            Cancelar
                        </button>
                        <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-[var(--cyan)]/20">
                            {esEdicion ? 'Guardar Cambios' : 'Crear Usuario'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

/* ──────────────────────────────────────────────
   MODAL ELIMINAR
   ────────────────────────────────────────────── */
function ModalEliminar({ usuario, onClose, onConfirmar }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={28} className="text-red-500" />
                    </div>
                    <h2 className="text-[var(--texto-1)] font-bold text-xl mb-2">Eliminar Usuario</h2>
                    <p className="text-[var(--texto-2)] text-sm mb-1">¿Estás seguro de eliminar a</p>
                    <p className="text-[var(--texto-1)] font-bold text-base mb-4">"{usuario?.nombre}"?</p>
                    <p className="text-[var(--texto-3)] text-xs mb-6">Esta acción no se puede deshacer. El usuario perderá el acceso al sistema de forma permanente.</p>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-[var(--texto-1)] rounded-xl text-sm font-bold transition-all">
                            Cancelar
                        </button>
                        <button onClick={onConfirmar} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20">
                            Sí, Eliminar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ──────────────────────────────────────────────
   COMPONENTE PRINCIPAL
   ────────────────────────────────────────────── */
export function Usuarios() {
    const [usuarios, setUsuarios] = useState([])
    const [busqueda, setBusqueda] = useState('')
    const [filtroRol, setFiltroRol] = useState('todos')
    const [filtroEstado, setFiltroEstado] = useState('todos')
    const [pagina, setPagina] = useState(1)
    const [modalCrear, setModalCrear] = useState(false)
    const [usuarioEditar, setUsuarioEditar] = useState(null)
    const [usuarioEliminar, setUsuarioEliminar] = useState(null)
    const [cargando, setCargando] = useState(true)

    const cargarUsuarios = async () => {
        try {
            setCargando(true)
            const { data } = await api.get('/usuarios')
            setUsuarios(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error('Error cargando usuarios:', error)
            setUsuarios([])
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        cargarUsuarios()
    }, [])

    /* ── Stats ── */
    const stats = useMemo(() => ({
        total: usuarios.length,
        activos: usuarios.filter(u => u.estado === 'activo' || u.estado === true).length,
        admins: usuarios.filter(u => u.rol === 'administrador' || u.rol === 'superadmin').length,
        nuevosEsteMes: usuarios.filter(u => {
            if (!u.creadoEn) return false
            const d = new Date(u.creadoEn)
            const hoy = new Date()
            return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear()
        }).length,
    }), [usuarios])

    /* ── Filtrado ── */
    const filtrados = useMemo(() => {
        return usuarios.filter(u => {
            const matchBusqueda = busqueda === '' ||
                u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
                u.empresa?.toLowerCase().includes(busqueda.toLowerCase())
            const matchRol = filtroRol === 'todos' || u.rol === filtroRol
            const matchEstado = filtroEstado === 'todos' || (filtroEstado === 'activo' ? (u.estado === 'activo' || u.estado === true) : (u.estado === 'inactivo' || u.estado === false))
            return matchBusqueda && matchRol && matchEstado
        })
    }, [usuarios, busqueda, filtroRol, filtroEstado])

    const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA) || 1
    const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

    const irPagina = (n) => setPagina(Math.max(1, Math.min(n, totalPaginas)))

    const toggleEstado = async (id) => {
        try {
            const usuario = usuarios.find(u => u.id === id)
            if (!usuario) return
            const nuevoEstado = usuario.estado === 'activo' || usuario.estado === true ? false : true

            const { data } = await api.put(`/usuarios/${id}`, {
                ...usuario,
                estado: nuevoEstado
            })

            setUsuarios(prev => prev.map(u => u.id === id ? data : u))
            toast.success('Estado del usuario actualizado')
        } catch (error) {
            console.error('Error al cambiar de estado:', error)
            toast.error(error.response?.data?.error || 'Error al cambiar estado')
        }
    }

    const guardarUsuario = async (data) => {
        try {
            if (data.id) {
                // Editar
                const { data: usuarioActualizado } = await api.put(`/usuarios/${data.id}`, data)
                setUsuarios(prev => prev.map(u => u.id === data.id ? usuarioActualizado : u))
            } else {
                // Crear
                const { data: usuarioNuevo } = await api.post('/usuarios', data)
                setUsuarios(prev => [usuarioNuevo, ...prev])
            }
            toast.success(data.id ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente')
            setModalCrear(false)
            setUsuarioEditar(null)
            setPagina(1)
        } catch (error) {
            console.error('Error guardando usuario:', error)
            toast.error(error.response?.data?.error || 'Error al guardar el usuario')
        }
    }

    const eliminarUsuario = async () => {
        if (!usuarioEliminar) return
        try {
            await api.delete(`/usuarios/${usuarioEliminar.id}`)
            setUsuarios(prev => prev.filter(u => u.id !== usuarioEliminar.id))
            setUsuarioEliminar(null)
            toast.success('Usuario eliminado correctamente')
        } catch (error) {
            console.error('Error eliminando usuario:', error)
            toast.error(error.response?.data?.error || 'Error al eliminar el usuario')
        }
    }

    /* ── RENDER ── */
    return (
        <div className="space-y-6 max-w-7xl mx-auto">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--texto-1)] tracking-wide flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-[var(--cyan)]/10 border border-[var(--cyan)]/20 flex items-center justify-center">
                            <Users size={18} className="text-[var(--cyan)]" />
                        </span>
                        Gestión de Usuarios
                    </h1>
                    <p className="text-[var(--texto-3)] text-sm mt-1 ml-12 font-medium">Administra los accesos y roles de tu equipo de trabajo</p>
                </div>
                <button
                    onClick={() => setModalCrear(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-[var(--cyan)]/20 text-sm"
                >
                    <UserPlus size={16} />
                    Nuevo Usuario
                </button>
            </div>

            {/* ── Stats Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Usuarios', valor: stats.total, icon: <Users size={20} />, color: 'blue' },
                    { label: 'Usuarios Activos', valor: stats.activos, icon: <CheckCircle size={20} />, color: 'emerald' },
                    { label: 'Administradores', valor: stats.admins, icon: <ShieldCheck size={20} />, color: 'violet' },
                    { label: 'Nuevos Este Mes', valor: stats.nuevosEsteMes, icon: <Calendar size={20} />, color: 'amber' },
                ].map(card => (
                    <div key={card.label} className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-4 flex items-center gap-4 hover:border-[var(--cyan)] transition-all">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
                            ${card.color === 'blue' ? 'bg-[var(--cyan)]/10 text-[var(--cyan)] border border-[var(--cyan)]/20' : ''}
                            ${card.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : ''}
                            ${card.color === 'violet' ? 'bg-violet-500/10 text-violet-500 border border-violet-500/20' : ''}
                            ${card.color === 'amber' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : ''}
                        `}>
                            {card.icon}
                        </div>
                        <div>
                            <p className="text-[var(--texto-3)] text-xs font-bold">{card.label}</p>
                            <p className="text-[var(--texto-1)] text-2xl font-bold leading-tight">{card.valor}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filtros ── */}
            <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-md shadow-black/5">
                {/* Búsqueda */}
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                    <input
                        type="text"
                        value={busqueda}
                        onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
                        placeholder="Buscar por nombre, correo o empresa..."
                        className="w-full bg-[var(--fondo-base)] border border-[var(--borde)] rounded-xl pl-10 pr-4 py-2.5 text-[var(--texto-1)] placeholder-[var(--texto-3)] text-sm focus:outline-none focus:border-[var(--cyan)] focus:ring-1 focus:ring-[var(--cyan)]/30 transition-all font-medium"
                    />
                </div>
                {/* Filtro Rol */}
                <div className="relative">
                    <select
                        value={filtroRol}
                        onChange={e => { setFiltroRol(e.target.value); setPagina(1) }}
                        className="bg-[var(--fondo-base)] border border-[var(--borde)] rounded-xl px-4 py-2.5 text-sm text-[var(--texto-1)] appearance-none pr-8 focus:outline-none focus:border-[var(--cyan)] cursor-pointer transition-all min-w-[140px] font-medium"
                    >
                        <option value="todos">Todos los roles</option>
                        <option value="superadmin">Superadmin</option>
                        <option value="administrador">Administrador</option>
                        <option value="operador">Operador</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)] pointer-events-none" />
                </div>
                {/* Filtro Estado */}
                <div className="relative">
                    <select
                        value={filtroEstado}
                        onChange={e => { setFiltroEstado(e.target.value); setPagina(1) }}
                        className="bg-[var(--fondo-base)] border border-[var(--borde)] rounded-xl px-4 py-2.5 text-sm text-[var(--texto-1)] appearance-none pr-8 focus:outline-none focus:border-[var(--cyan)] cursor-pointer transition-all min-w-[130px] font-medium"
                    >
                        <option value="todos">Todos los estados</option>
                        <option value="activo">Activos</option>
                        <option value="inactivo">Inactivos</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)] pointer-events-none" />
                </div>
            </div>

            {/* ── Tabla ── */}
            <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl overflow-hidden shadow-xl shadow-black/5">
                {/* Cabecera tabla */}
                <div className="grid grid-cols-[2fr_2fr_1.2fr_1.5fr_1.5fr_0.8fr_1fr] gap-4 px-6 py-4 bg-[var(--fondo-base)] border-b border-[var(--borde)] text-[11px] font-bold text-[var(--texto-3)] uppercase tracking-wider">
                    <span>Usuario</span>
                    <span>Correo</span>
                    <span>Rol</span>
                    <span className="hidden lg:block">Empresa</span>
                    <span className="hidden xl:block">Último Acceso</span>
                    <span>Estado</span>
                    <span className="text-right">Acciones</span>
                </div>

                {/* Filas */}
                {paginados.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[var(--texto-3)]">
                        <Users size={40} className="mb-3" />
                        <p className="text-sm font-medium">Sin resultados</p>
                        <p className="text-xs mt-1">Intenta con otros filtros de búsqueda</p>
                    </div>
                ) : (
                    paginados.map((u, i) => (
                        <div
                            key={u.id}
                            className={`grid grid-cols-[2fr_2fr_1.2fr_1.5fr_1.5fr_0.8fr_1fr] gap-4 px-6 py-4 items-center border-b border-[var(--borde)] hover:bg-[var(--cyan)]/5 transition-all ${i % 2 === 0 ? '' : 'bg-[var(--fondo-base)]/30'}`}
                        >
                            {/* Avatar + Nombre */}
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar initials={u.nombre?.substring(0, 2).toUpperCase()} foto_url={u.foto_url} />
                                <div className="min-w-0">
                                    <p className="text-[var(--texto-1)] font-bold text-sm truncate">{u.nombre}</p>
                                    <p className="text-[var(--texto-3)] text-xs">Desde {formatFechaCorta(u.creadoEn)}</p>
                                </div>
                            </div>

                            {/* Email */}
                            <div className="min-w-0">
                                <p className="text-[var(--texto-2)] text-sm truncate font-medium">{u.email}</p>
                            </div>

                            {/* Rol */}
                            <div>
                                <RolBadge rol={u.rol} />
                            </div>

                            {/* Empresa */}
                            <div className="hidden lg:flex items-center gap-2 min-w-0">
                                <Building2 size={13} className="text-[var(--texto-3)] flex-shrink-0" />
                                <span className="text-[var(--texto-2)] text-sm truncate font-medium">{u.empresa}</span>
                            </div>

                            {/* Último acceso */}
                            <div className="hidden xl:flex items-center gap-2 min-w-0">
                                <Calendar size={13} className="text-[var(--texto-3)] flex-shrink-0" />
                                <span className="text-[var(--texto-2)] text-xs truncate font-medium">{u.ultimoAcceso ? formatFecha(u.ultimoAcceso) : <span className="italic opacity-60">Sin registro</span>}</span>
                            </div>

                            {/* Toggle estado */}
                            <div>
                                <button
                                    onClick={() => toggleEstado(u.id)}
                                    className={`relative w-11 h-[22px] rounded-full transition-colors ${u.estado ? 'bg-[var(--cyan)]' : 'bg-slate-300'}`}
                                    title={u.estado ? 'Desactivar usuario' : 'Activar usuario'}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${u.estado ? 'translate-x-[22px]' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {/* Acciones */}
                            <div className="flex justify-end gap-1">
                                <button
                                    onClick={() => setUsuarioEditar(u)}
                                    className="p-2 text-[var(--texto-3)] hover:text-[var(--cyan)] hover:bg-[var(--cyan)]/10 rounded-lg transition-all"
                                    title="Editar usuario"
                                >
                                    <Edit2 size={15} />
                                </button>
                                <button
                                    onClick={() => setUsuarioEliminar(u)}
                                    className="p-2 text-[var(--texto-3)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Eliminar usuario"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))
                )}

                {/* ── Paginación ── */}
                {filtrados.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--borde)] bg-[var(--fondo-base)]/40">
                        <p className="text-[var(--texto-3)] text-xs">
                            Mostrando <span className="text-[var(--texto-1)] font-bold">{(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtrados.length)}</span> de <span className="text-[var(--texto-1)] font-bold">{filtrados.length}</span> usuarios
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => irPagina(pagina - 1)}
                                disabled={pagina === 1}
                                className="p-1.5 rounded-lg border border-[var(--borde)] text-[var(--texto-3)] hover:text-[var(--texto-1)] hover:border-[var(--texto-2)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(num => (
                                <button
                                    key={num}
                                    onClick={() => irPagina(num)}
                                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${num === pagina
                                        ? 'bg-[var(--cyan)] text-white'
                                        : 'text-[var(--texto-3)] hover:text-[var(--texto-1)] hover:bg-[var(--fondo-base)] border border-[var(--borde)]'
                                        }`}
                                >
                                    {num}
                                </button>
                            ))}
                            <button
                                onClick={() => irPagina(pagina + 1)}
                                disabled={pagina === totalPaginas}
                                className="p-1.5 rounded-lg border border-[var(--borde)] text-[var(--texto-3)] hover:text-[var(--texto-1)] hover:border-[var(--texto-2)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Modales ── */}
            {modalCrear && (
                <ModalUsuario
                    usuario={null}
                    onClose={() => setModalCrear(false)}
                    onGuardar={guardarUsuario}
                />
            )}
            {usuarioEditar && (
                <ModalUsuario
                    usuario={usuarioEditar}
                    onClose={() => setUsuarioEditar(null)}
                    onGuardar={guardarUsuario}
                />
            )}
            {usuarioEliminar && (
                <ModalEliminar
                    usuario={usuarioEliminar}
                    onClose={() => setUsuarioEliminar(null)}
                    onConfirmar={eliminarUsuario}
                />
            )}
        </div>
    )
}

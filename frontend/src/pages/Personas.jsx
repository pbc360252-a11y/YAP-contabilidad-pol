import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Eye, Trash2, X, Printer, DollarSign, Users, Calculator } from 'lucide-react'
import api from '../utils/api'
import { BadgeEstado } from '../components/ui/BadgeEstado'
import { formatCedula, formatCOPCorto, formatCOP } from '../utils/formatCOP'
import { QuickPrint } from '../components/ui/QuickPrint'
import { GenericReportPDF } from '../components/ui/GenericReportPDF'
import { ModalPersona } from '../components/personas/ModalPersona'
import { ModalRegistrarPago } from '../components/pagos/ModalRegistrarPago'
import { AmortizacionPDF } from '../components/prestamos/AmortizacionPDF'
import { ModalRecaudoMasivo } from '../components/pagos/ModalRecaudoMasivo'
import { toast } from 'react-hot-toast'
import { useRef, useMemo } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useStore } from '../store/useStore'

// Helper cn simple para evitar dependencia de clsx
function cn(...classes) {
    return classes.filter(Boolean).join(' ')
}

// Genera un color consistente por nombre
const AVATAR_COLORS = [
    { bg: 'rgba(26,111,255,0.2)', text: '#60A5FA', border: 'rgba(26,111,255,0.3)' },
    { bg: 'rgba(0,212,255,0.15)', text: '#22D3EE', border: 'rgba(0,212,255,0.3)' },
    { bg: 'rgba(16,185,129,0.15)', text: '#34D399', border: 'rgba(16,185,129,0.3)' },
    { bg: 'rgba(245,158,11,0.15)', text: '#FCD34D', border: 'rgba(245,158,11,0.3)' },
    { bg: 'rgba(168,85,247,0.15)', text: '#C084FC', border: 'rgba(168,85,247,0.3)' },
    { bg: 'rgba(239,68,68,0.15)', text: '#FCA5A5', border: 'rgba(239,68,68,0.3)' },
]
function getAvatarColor(name = '') {
    const idx = (name?.charCodeAt(0) || 0) % AVATAR_COLORS.length
    return AVATAR_COLORS[idx]
}

function AvatarInitials({ name = '', apellido = '' }) {
    const c = getAvatarColor(name)
    return (
        <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
        >
            {name?.[0]}{apellido?.[0]}
        </div>
    )
}

export function Personas() {
    const { vistaPremium } = useStore()
    const navigate = useNavigate()
    const [personas, setPersonas] = useState([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [personaEditar, setPersonaEditar] = useState(null)
    const [empresas, setEmpresas] = useState([])
    const [filtroEmpresa, setFiltroEmpresa] = useState(null)
    const [perfilPersona, setPerfilPersona] = useState(null)
    const [modalPagoCuota, setModalPagoCuota] = useState(null)
    const [buscandoCuota, setBuscandoCuota] = useState(false)
    const [prestamoParaAmortizar, setPrestamoParaAmortizar] = useState(null)
    const [modalMasivoOpen, setModalMasivoOpen] = useState(false)
    const amortizacionPrintRef = useRef()

    const handlePrintAmortizacion = useReactToPrint({
        contentRef: amortizacionPrintRef,
        documentTitle: `Amortizacion_${prestamoParaAmortizar?.codigo || 'Reporte'}`,
    })

    const imprimirAmortizacion = async (prestamoId) => {
        try {
            const res = await api.get(`/prestamos/${prestamoId}`)
            setPrestamoParaAmortizar(res.data.prestamo)
            // Pequeño delay para que el componente se monte
            setTimeout(() => {
                handlePrintAmortizacion()
            }, 500)
        } catch (error) {
            console.error(error)
            toast.error("Error al cargar datos de amortización")
        }
    }

    const cargarEmpresas = async () => {
        try {
            const res = await api.get('/empresas')
            setEmpresas(res.data?.empresas || [])
        } catch (error) {
            console.error(error)
            setEmpresas([])
        }
    }

    const cargarPersonas = async (q = '', empId = null) => {
        setCargando(true)
        try {
            let url = q ? `/personas/buscar?q=${q}` : '/personas'
            if (empId) {
                url += (url.includes('?') ? '&' : '?') + `empresa_id=${empId}`
            }
            const res = await api.get(url)
            setPersonas(res.data?.personas || [])
        } catch (error) {
            console.error(error)
            setPersonas([])
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        cargarEmpresas()
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => cargarPersonas(busqueda, filtroEmpresa), 300)
        return () => clearTimeout(timer)
    }, [busqueda, filtroEmpresa])

    const [confirmDesactivarId, setConfirmDesactivarId] = useState(null)

    const desactivar = async (id) => {
        try {
            await api.delete(`/personas/${id}`)
            setConfirmDesactivarId(null)
            toast.success('Cliente eliminado/desactivado correctamente')
            cargarPersonas(busqueda)
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al eliminar')
        }
    }


    const verPerfil = async (p) => {
        setPerfilPersona(p)
    }

    const abrirPagoRapido = async (persona) => {
        setBuscandoCuota(persona.id)
        try {
            // Buscamos el detalle de la persona para ver sus cuotas
            const res = await api.get(`/personas/${persona.id}`)
            const detail = res.data.persona

            // Recolectamos todas las cuotas pendientes o vencidas de todos sus préstamos
            let todasLasCuotas = []
            detail.prestamos?.forEach(pr => {
                const cuotasPendientes = pr.cuotas?.filter(c => c.estado === 'pendiente' || c.estado === 'vencida') || []
                todasLasCuotas = [...todasLasCuotas, ...cuotasPendientes]
            })

            // Ordenamos por fecha para pagar la más antigua primero
            todasLasCuotas.sort((a, b) => new Date(a.fecha_programada) - new Date(b.fecha_programada))

            if (todasLasCuotas.length > 0) {
                // Inyectamos la persona en la cuota para que el modal tenga el nombre
                const cuotaAPagar = { ...todasLasCuotas[0], persona: detail }
                setModalPagoCuota(cuotaAPagar)
            } else {
                toast.error('Este cliente no tiene cuotas pendientes de pago.')
            }
        } catch (error) {
            console.error(error)
            toast.error('Error al buscar cuotas pendientes.')
        } finally {
            setBuscandoCuota(false)
        }
    }

    const personasFiltradas = personas

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between mb-8">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <Users className={vistaPremium ? 'text-[#00D4FF]' : 'text-[#4FD1C5]'} size={20} />
                            <h1 className="text-xl font-black text-[var(--texto-1)] tracking-tight uppercase">Directorio de Clientes</h1>
                        </div>
                        <p className="text-[var(--texto-3)] text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Gestión Administrativa Coraza</p>
                    </div>

                    <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
                        <QuickPrint
                            component={GenericReportPDF}
                            className={`!py-2.5 !px-5 !text-[10px] ${
                                vistaPremium ? '!bg-gradient-to-r !from-[#1A6FFF] !to-[#00D4FF]' : '!bg-[#4FD1C5]'
                            }`}
                            props={{
                                title: "Reporte de Cartera y Amortización General",
                                subtitle: `Consolidado de obligaciones - ${personasFiltradas.length} clientes`,
                                infoRows: [
                                    { label: "Total Clientes", value: personas.length },
                                    { label: "Empresa / Filtro", value: filtroEmpresa ? empresas.find(e => e.id === filtroEmpresa)?.nombre : "TODA LA CARTERA" },
                                    { label: "Cartera Activa", value: formatCOP(personasFiltradas.reduce((s, p) => s + (p.prestamos?.[0]?.monto_otorgado || 0), 0)) }
                                ],
                                tableHeaders: [
                                    { label: "Nombre Cliente" },
                                    { label: "ID / Cédula" },
                                    { label: "Empresa" },
                                    { label: "Cap. Inicial", align: 'text-right' },
                                    { label: "Cuota Quinc.", align: 'text-right' },
                                    { label: "Estado", align: 'text-center' }
                                ],
                                tableRows: personasFiltradas.map(p => {
                                    const pActivo = p.prestamos?.[0];
                                    return [
                                        { value: `${p.primer_nombre} ${p.primer_apellido}`.toUpperCase() },
                                        { value: p.cedula },
                                        { value: (p.empresa?.nombre || 'Independiente').slice(0, 15) },
                                        { value: pActivo ? formatCOPCorto(pActivo.monto_otorgado) : '$0', style: 'font-mono' },
                                        { value: pActivo ? formatCOPCorto(pActivo.cuota_estandar) : '$0', style: 'font-mono' },
                                        { value: pActivo ? pActivo.estado.toUpperCase() : 'SIN CRÉDITO', style: 'font-bold' }
                                    ]
                                }),
                                footerText: `TOTAL SALDO EN CARTERA: ${formatCOP(personasFiltradas.reduce((s, p) => s + (p.prestamos?.[0]?.total_a_pagar || 0), 0))}`
                            }}
                        />
                        <button
                            onClick={() => setModalMasivoOpen(true)}
                            className={`font-black text-[10px] uppercase py-2.5 px-5 rounded-xl border transition-all flex items-center gap-2 group tracking-widest ${
                                vistaPremium ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}
                        >
                            <DollarSign size={16} />
                            <span>Recaudo Masivo</span>
                        </button>
                        <button
                            onClick={() => { setPersonaEditar(null); setModalOpen(true); }}
                            className={`font-black py-3 px-6 rounded-2xl transition-all shadow-xl flex items-center gap-2 hover:scale-[1.03] active:scale-95 ${
                                vistaPremium ? '!bg-gradient-to-r !from-[#4FD1C5] !to-[#38B2AC] text-white' : 'bg-[#4FD1C5] text-white shadow-teal-500/20'
                            }`}
                        >
                            <Plus size={16} />
                            <span>Nuevo Registro</span>
                        </button>
                    </div>
                </div>

                {/* Quick Bar - Filtro por Empresa */}
                <div className="flex items-center gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    <button
                        onClick={() => setFiltroEmpresa(null)}
                        className={cn(
                            "whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border",
                            !filtroEmpresa
                                ? (vistaPremium ? "bg-[#4FD1C5] text-white border-[#4FD1C5]" : "bg-[#4FD1C5] text-white border-[#4FD1C5] shadow-lg shadow-teal-500/20")
                                : "bg-white/5 text-[var(--texto-3)] border-[var(--borde)] hover:bg-white/10"
                        )}
                    >
                        TODAS LAS EMPRESAS
                    </button>
                    {empresas.map(emp => (
                        <button
                            key={emp.id}
                            onClick={() => setFiltroEmpresa(emp.id)}
                            className={cn(
                                "whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border uppercase",
                                filtroEmpresa === emp.id
                                    ? (vistaPremium ? "bg-[#4FD1C5] text-white border-[#4FD1C5]" : "bg-[#4FD1C5] text-white border-[#4FD1C5] shadow-lg shadow-teal-500/20")
                                    : "bg-white/5 text-[var(--texto-3)] border-[var(--borde)] hover:bg-white/10"
                            )}
                        >
                            {emp.nombre}
                        </button>
                    ))}
                </div>

                <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-6 shadow-xl">
                    <div className="relative max-w-md mb-6">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                        <input
                            type="text"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar por nombre, cédula o email..."
                            className="w-full bg-[var(--fondo-card)] border border-[var(--borde)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--texto-1)] focus:outline-none focus:border-[#4FD1C5] focus:shadow-[0_0_12px_rgba(79,209,197,0.2)] transition-all"
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--borde)]">
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Cédula</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Nombre Completo</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Empresa</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Teléfono</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Estado</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cargando ? (
                                    <tr><td colSpan="6" className="py-8 text-center text-[var(--texto-3)]">Cargando directorio...</td></tr>
                                ) : personas.length === 0 ? (
                                    <tr><td colSpan="6" className="py-8 text-center text-[var(--texto-3)]">No se encontraron personas.</td></tr>
                                ) : (
                                    personas.map(p => (
                                        <tr key={p.id} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
                                            <td className="py-3.5 px-4 text-sm text-[var(--texto-2)] font-mono">{formatCedula(p.cedula)}</td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-[#4FD1C5]/10 flex items-center justify-center text-[10px] font-black text-[#38B2AC]">
                                                        {p.primer_nombre?.[0] || '?'}{p.primer_apellido?.[0] || ''}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-[var(--texto-1)] font-semibold leading-none">{p.primer_nombre} {p.primer_apellido}</p>
                                                        {p.prestamos?.length > 0 && (
                                                            <p className="text-[10px] text-[var(--texto-3)] mt-0.5">{p.prestamos.length} crédito{p.prestamos.length !== 1 ? 's' : ''}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {p.empresa ? (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-[var(--texto-2)] border border-white/10 uppercase tracking-wide">
                                                        {p.empresa.nombre}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-[var(--texto-3)] italic">Independiente</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-sm text-[var(--texto-2)]">{p.telefono || '-'}</td>
                                            <td className="py-3 px-4 text-sm">
                                                {p.prestamos?.length > 0
                                                    ? <BadgeEstado estado={p.prestamos.some(pr => pr.estado === 'en_mora') ? 'en_mora' : 'activo'} />
                                                    : p.monto_requerido && p.monto_requerido > 0
                                                        ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black bg-[#4FD1C5]/10 text-[#4FD1C5] border border-[#4FD1C5]/20 uppercase tracking-wider animate-pulse shadow-[0_0_15px_rgba(79,209,197,0.15)]">Solicitud Pendiente</span>
                                                        : <span className="text-xs text-[var(--texto-3)]">Sin créditos</span>}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-right space-x-2">
                                                {p.monto_requerido && p.monto_requerido > 0 && p.prestamos?.length === 0 && (
                                                    <button
                                                        onClick={() => {
                                                            navigate('/prestamos', { state: { personaId: p.id } })
                                                        }}
                                                        className="px-3 py-1.5 bg-[#4FD1C5]/10 text-[#4FD1C5] hover:bg-[#4FD1C5]/20 border border-[#4FD1C5]/20 rounded-xl transition-all inline-flex items-center gap-1.5 hover:scale-105 font-black text-[10px] uppercase tracking-wider"
                                                        title="Procesar Crédito Pendiente"
                                                    >
                                                        <Calculator size={12} />
                                                        <span>Procesar Crédito</span>
                                                    </button>
                                                )}
                                                {p.prestamos?.length > 0 && (
                                                    <button
                                                        onClick={() => abrirPagoRapido(p)}
                                                        disabled={buscandoCuota === p.id}
                                                        className={cn(
                                                            "p-1.5 rounded-lg transition-all",
                                                            buscandoCuota === p.id ? "animate-pulse text-gray-400" : "text-[#10B981] hover:bg-[#10B981]/10 px-2 inline-flex items-center gap-1"
                                                        )}
                                                        title="Registrar Pago de Cuota"
                                                    >
                                                        <DollarSign size={16} />
                                                        {buscandoCuota === p.id && <span className="text-[10px]">Cargando...</span>}
                                                    </button>
                                                )}
                                                {p.prestamos?.length > 0 && (
                                                    <button
                                                        onClick={() => imprimirAmortizacion(p.prestamos[0].id)}
                                                        className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors"
                                                        title="Imprimir Amortización Activa"
                                                    >
                                                        <Printer size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => verPerfil(p)}
                                                    className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors" title="Ver Perfil 360">
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => { setPersonaEditar(p); setModalOpen(true); }}
                                                    className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors" title="Editar">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => setConfirmDesactivarId(p.id)} className="p-1.5 text-[var(--texto-3)] hover:text-[#F43F5E] hover:bg-[rgba(244,63,94,0.1)] rounded-lg transition-colors" title="Eliminar">
                                                    <Trash2 size={16} />
                                                </button>

                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* MODALS RENDERED OUTSIDE CONTENT ANIMATION */}
            {modalOpen && (
                <ModalPersona
                    persona={personaEditar}
                    onClose={() => { setModalOpen(false); setPersonaEditar(null); cargarPersonas(busqueda); }}
                    onNewLoan={(personaId) => {
                        navigate('/prestamos', { state: { personaId } });
                    }}
                />
            )}

            {perfilPersona && (
                <ModalPerfil
                    persona={perfilPersona}
                    onClose={() => setPerfilPersona(null)}
                    onPrintAmortizacion={imprimirAmortizacion}
                />
            )}

            {/* Hidden Print Container for Amortization */}
            <div style={{ position: 'absolute', top: '-9999px', opacity: 0, pointerEvents: 'none' }}>
                <AmortizacionPDF ref={amortizacionPrintRef} prestamo={prestamoParaAmortizar} />
            </div>


            {modalPagoCuota && (
                <ModalRegistrarPago
                    cuota={modalPagoCuota}
                    onClose={() => setModalPagoCuota(null)}
                    onSuccess={() => {
                        setModalPagoCuota(null)
                        toast.success('Pago registrado con éxito')
                        cargarPersonas(busqueda, filtroEmpresa)
                    }}
                />
            )}

            {modalMasivoOpen && (
                <ModalRecaudoMasivo
                    onClose={() => setModalMasivoOpen(false)}
                    onRefresh={() => cargarPersonas(busqueda)}
                />
            )}

            {confirmDesactivarId && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--fondo-base)] border border-[var(--borde)] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={24} className="text-red-500" />
                        </div>
                        <h3 className="text-white font-bold text-lg text-center mb-2">¿Desactivar cliente?</h3>
                        <p className="text-[var(--texto-3)] text-sm text-center mb-6">Esta acción no se puede deshacer y puede afectar sus créditos activos.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDesactivarId(null)} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all">Cancelar</button>
                            <button onClick={() => desactivar(confirmDesactivarId)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}


function ModalPerfil({ persona, onClose, onPrintAmortizacion }) {
    const [prestamos, setPrestamos] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get(`/prestamos/persona/${persona.id}`)
            .then(res => setPrestamos(res.data.prestamos || []))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [persona.id])

    const [showConfirmPin, setShowConfirmPin] = useState(false)

    const handleRestablecerPin = async () => {
        try {
            await api.post(`/personas/${persona.id}/restablecer-portal`)
            setShowConfirmPin(false)
            toast.success('¡Acceso al portal del cliente restablecido con éxito!')
        } catch (error) {
            console.error(error)
            toast.error('Error al restablecer acceso del portal.')
        }
    }


    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(6,12,26,0.85)] backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
            <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-2xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] my-auto p-8 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white transition-colors bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                    <X size={18} />
                </button>
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#4FD1C5] to-[#38B2AC] flex items-center justify-center text-3xl font-black text-white shadow-2xl">
                        {persona.primer_nombre?.[0]}{persona.primer_apellido?.[0]}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">{persona.primer_nombre} {persona.segundo_nombre} {persona.primer_apellido} {persona.segundo_apellido}</h2>
                        <p className="text-sm text-[var(--texto-3)]">CC: {persona.cedula} · {persona.empresa?.nombre || 'Independiente'}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
                    <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Teléfono</p>
                        <p className="text-white font-medium">{persona.telefono || '-'}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Celular</p>
                        <p className="text-[#00D4FF] font-medium">{persona.celular || '-'}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Correo</p>
                        <p className="text-white font-medium text-xs break-all">{persona.correo || '-'}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Cargo</p>
                        <p className="text-white font-medium">{persona.cargo || '-'}</p>
                    </div>
                    <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/10">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Monto Requerido</p>
                        <p className="text-emerald-400 font-bold">{persona.monto_requerido ? formatCOP(persona.monto_requerido) : '-'}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Créditos</p>
                        <p className="text-white font-bold">{prestamos.length}</p>
                    </div>
                    <div 
                        onClick={() => setShowConfirmPin(true)}
                        className="bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 rounded-xl p-3 cursor-pointer select-none transition-all flex flex-col justify-center active:scale-[0.97]"
                        title="Restablecer acceso de portal del cliente"
                    >
                        <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest mb-0.5">Portal de Clientes</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Restablecer PIN de acceso</p>
                    </div>

                </div>
                {persona.observaciones && (
                    <div className="bg-white/5 rounded-xl p-3 mb-4">
                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Observaciones</p>
                        <p className="text-white text-sm">{persona.observaciones}</p>
                    </div>
                )}
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Historial de Créditos</h3>
                {loading ? (
                    <p className="text-[var(--texto-3)] text-sm text-center py-4">Cargando...</p>
                ) : prestamos.length === 0 ? (
                    <p className="text-[var(--texto-3)] text-sm text-center py-4">Sin créditos registrados.</p>
                ) : (
                    <div className="space-y-2">
                        {prestamos.map(pr => (
                            <div key={pr.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                                <div>
                                    <p className="text-xs text-white font-bold">{pr.tipo?.nombre}</p>
                                    <p className="text-[10px] text-[var(--texto-3)] font-mono">#{pr.id.slice(0, 8)}</p>
                                </div>
                                <div className="text-right flex items-center gap-3">
                                    <div className="flex flex-col items-end">
                                        <p className="text-sm text-[#00D4FF] font-bold">{formatCOPCorto(pr.total_a_pagar)}</p>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${pr.estado === 'activo' ? 'bg-green-500/20 text-green-400' : pr.estado === 'en_mora' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {pr.estado}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => onPrintAmortizacion(pr.id)}
                                        className="p-2 bg-[#00D4FF]/10 text-[#00D4FF] rounded-xl hover:bg-[#00D4FF]/20 transition-all"
                                        title="Imprimir Amortización Detallada"
                                    >
                                        <Printer size={16} />
                                    </button>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
                {showConfirmPin && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                        <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl text-center relative animate-fade-in">
                            <h3 className="text-white font-bold text-lg mb-2">Restablecer acceso</h3>
                            <p className="text-[var(--texto-3)] text-sm mb-6">¿Seguro que deseas restablecer el acceso al portal de este cliente? El PIN temporal volverá a ser su Cédula.</p>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowConfirmPin(false)} className="flex-1 py-3 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all text-sm">Cancelar</button>
                                <button type="button" onClick={handleRestablecerPin} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl font-bold transition-all shadow-lg text-sm">Restablecer</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}




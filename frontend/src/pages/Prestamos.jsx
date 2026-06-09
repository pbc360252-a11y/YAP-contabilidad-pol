import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { Plus, Calculator, X, Eye, Calculator as CalcIcon, Printer, Trash2, Search, Filter, Save, Check, ChevronDown } from 'lucide-react'
import api from '../utils/api'
import { formatCOP, formatCOPCorto } from '../utils/formatCOP'
import { formatFechaCorta } from '../utils/formatFecha'
import { BadgeEstado } from '../components/ui/BadgeEstado'
import { calcularPrestamoSimulador, validarTasaUsura } from '../utils/financiero'
import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ModalPersona } from '../components/personas/ModalPersona'
import { PrestamoPDF } from '../components/prestamos/PrestamoPDF'
import toast from 'react-hot-toast'
import { Loader } from '../components/ui/Loader'
import { useStore } from '../store/useStore'

export function Prestamos() {
    const { vistaPremium } = useStore()
    const location = useLocation()
    const [prestamos, setPrestamos] = useState([])
    const [cargando, setCargando] = useState(true)

    const [modalOpen, setModalOpen] = useState(false)
    const [prestamoImprimir, setPrestamoImprimir] = useState(null)
    const [detalleOpen, setDetalleOpen] = useState(false)
    const [prestamoDetalle, setPrestamoDetalle] = useState(null)
    const printRef = useRef()

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: 'Contrato_Prestamo',
    })

    const imprimirContrato = async (id) => {
        try {
            const res = await api.get(`/prestamos/${id}`)
            setPrestamoImprimir(res.data.prestamo)
            // Pequeño timeout para asegurar que el componente se renderiza con los datos antes de imprimir
            setTimeout(() => {
                handlePrint()
            }, 500)
        } catch (e) {
            console.error(e)
            toast.error("Error al cargar el contrato para imprimir")
        }
    }

    const abrirDetalle = async (id) => {
        try {
            const res = await api.get(`/prestamos/${id}`)
            setPrestamoDetalle(res.data.prestamo)
            setDetalleOpen(true)
        } catch (e) {
            console.error(e)
            toast.error("Error al cargar detalle")
        }
    }

    const cargar = async () => {
        try {
            const res = await api.get('/prestamos')
            setPrestamos(res.data?.prestamos || [])
        } catch (e) {
            console.error(e)
            setPrestamos([])
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => { cargar() }, [])

    useEffect(() => {
        if (location.state?.personaId || location.state?.openModal) {
            setModalOpen(true)
        }
    }, [location.state])


    const [busqueda, setBusqueda] = useState('')
    const [filtroEstado, setFiltroEstado] = useState('todos')

    const estadosFiltro = [
        { key: 'todos', label: 'Todos' },
        { key: 'activo', label: 'Activo' },
        { key: 'en_mora', label: 'En Mora' },
        { key: 'pagado', label: 'Pagado' },
    ]

    const prestamosFiltrados = prestamos.filter(p => {
        const nombre = `${p.persona?.primer_nombre || ''} ${p.persona?.primer_apellido || ''}`.toLowerCase()
        const codigo = (p.codigo || p.id || '').toLowerCase()
        const matchBusqueda = nombre.includes(busqueda.toLowerCase()) || codigo.includes(busqueda.toLowerCase())
        const matchEstado = filtroEstado === 'todos' || p.estado === filtroEstado
        return matchBusqueda && matchEstado
    })

    const totalCartera = prestamos.filter(p => p.estado === 'activo').reduce((s, p) => s + (p.monto_otorgado || 0), 0)

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--texto-1)] tracking-wide">Gestión de Préstamos</h1>
                        <p className="text-[var(--texto-3)] text-sm mt-1">Simulación, aprobación y seguimiento de cartera activa.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {totalCartera > 0 && (
                            <div className={`hidden sm:flex items-center gap-2 border rounded-xl px-4 py-2 ${
                                vistaPremium ? 'bg-[#4FD1C5]/5 border-[#4FD1C5]/20' : 'bg-teal-50 border-teal-100'
                            }`}>
                                <span className="text-[10px] text-[var(--texto-3)] uppercase font-bold tracking-wider">Cartera Activa</span>
                                <span className={vistaPremium ? 'text-sm text-[#4FD1C5] font-black number-font' : 'text-sm text-teal-600 font-black number-font'}>{formatCOPCorto(totalCartera)}</span>
                            </div>
                        )}
                        <button
                            onClick={() => setModalOpen(true)}
                            className="cyber-button px-6 py-3 rounded-xl flex items-center gap-2 group"
                        >
                            <Calculator size={20} className="group-hover:scale-110 transition-transform" />
                            <span className="tracking-tight">Nuevo Préstamo</span>
                        </button>
                    </div>
                </div>

                {/* Search + Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                        <input
                            type="text"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar por nombre, cédula o código..."
                            className="w-full bg-[var(--fondo-card)] border border-[var(--borde)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--texto-1)] focus:outline-none focus:border-[#4FD1C5] transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {estadosFiltro.map(f => {
                            const count = f.key === 'todos' ? prestamos.length : prestamos.filter(p => p.estado === f.key).length
                            return (
                                <button
                                    key={f.key}
                                    onClick={() => setFiltroEstado(f.key)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border ${
                                        filtroEstado === f.key
                                            ? (vistaPremium ? 'bg-[#4FD1C5] text-white border-[#4FD1C5]' : 'bg-[#4FD1C5] text-white border-[#4FD1C5] shadow-lg shadow-teal-500/20')
                                            : 'bg-[var(--fondo-card)] text-[var(--texto-3)] border-[var(--borde)] hover:text-[var(--texto-1)]'
                                    }`}
                                >
                                    {f.label}
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                                        filtroEstado === f.key ? 'bg-white/20 text-white' : 'bg-white/5 text-[var(--texto-3)]'
                                    }`}>{count}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--borde)] bg-[rgba(255,255,255,0.01)]">
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">ID / Ref</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Cliente</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Tipo Línea</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider text-right">Capital Otorgado</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider text-right">Total a Pagar</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider">Estado</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-[var(--texto-3)] uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cargando ? (
                                    <tr><td colSpan="7" className="py-12 text-center text-[var(--texto-3)]">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-[#4FD1C5]/30 border-t-[#4FD1C5] rounded-full animate-spin" />
                                            Cargando préstamos...
                                        </div>
                                    </td></tr>
                                ) : prestamosFiltrados.length === 0 ? (
                                    <tr><td colSpan="7" className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Search size={36} className="text-[var(--texto-3)] opacity-30" />
                                            <p className="text-[var(--texto-3)] text-sm font-medium">
                                                {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay préstamos con este filtro.'}
                                            </p>
                                            {busqueda && (
                                                <button onClick={() => setBusqueda('')} className="text-[#4FD1C5] text-xs font-bold hover:underline">Limpiar búsqueda</button>
                                            )}
                                        </div>
                                    </td></tr>
                                ) : (
                                    prestamosFiltrados.map((p) => (
                                        <tr key={p.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                        vistaPremium ? 'bg-[#4FD1C5]/10' : 'bg-[#4FD1C5]/10'
                                                    }`}>
                                                        <span className={`text-[10px] font-black ${vistaPremium ? 'text-[#4FD1C5]' : 'text-[#4FD1C5]'}`}>{p.persona?.primer_nombre?.[0]}{p.persona?.primer_apellido?.[0]}</span>
                                                    </div>
                                                    <span className={`text-sm font-mono font-semibold ${vistaPremium ? 'text-[#4FD1C5]' : 'text-[#38B2AC]'}`}>{p.codigo || `#${p.id.slice(0, 8)}`}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-sm text-[var(--texto-1)] font-medium">{p.persona?.primer_nombre} {p.persona?.primer_apellido}</td>
                                            <td className="py-3.5 px-4 text-sm text-[var(--texto-2)]">{p.tipo?.nombre}</td>
                                            <td className="py-3.5 px-4 text-sm text-white text-right font-medium">{formatCOP(p.monto_otorgado)}</td>
                                            <td className="py-3.5 px-4 text-sm text-[#4FD1C5] text-right font-black number-font">{formatCOP(p.total_a_pagar)}</td>
                                            <td className="py-3.5 px-4 text-sm"><BadgeEstado estado={p.estado} /></td>
                                            <td className="py-3.5 px-4 text-sm text-right flex justify-end gap-2">
                                                <button
                                                    onClick={() => imprimirContrato(p.id)}
                                                    className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors"
                                                    title="Imprimir Contrato"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                                <button
                                                    onClick={() => abrirDetalle(p.id)}
                                                    className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors" title="Detalle">
                                                    <Eye size={16} />
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

            {/* Componente Invisible para PDF - Offscreen para permitir renderizado */}
            <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', opacity: 0, pointerEvents: 'none' }}>
                <PrestamoPDF ref={printRef} prestamo={prestamoImprimir} />
            </div>

            {/* MODALS RENDERED OUTSIDE CONTENT ANIMATION TO AVOID TRANSFORM CONTEXT BUGS */}
            {modalOpen && (
                <ModalSimulador
                    initialPersonaId={location.state?.personaId}
                    onClose={() => { setModalOpen(false); cargar(); }}
                    onPrintSuccess={(id) => imprimirContrato(id)}
                />
            )}

            {detalleOpen && prestamoDetalle && (
                <ModalDetalle prestamo={prestamoDetalle} onClose={() => setDetalleOpen(false)} />
            )}
        </>
    )
}

function ModalSimulador({ onClose, onPrintSuccess, initialPersonaId }) {

    const [paso, setPaso] = useState(1) // 1: Datos, 2: Amortizacion
    const [personas, setPersonas] = useState([])
    const [tipos, setTipos] = useState([])
    const [mostrarModalPersona, setMostrarModalPersona] = useState(false)

    const [formData, setFormData] = useState({
        persona_id: initialPersonaId || '',
        tipo_id: '',
        monto: '',
        cuotas: '12',
        fechaPrimerPago: new Date().toISOString().split('T')[0],
        metodo_amortizacion: 'lineal',
        diferir_cargos: true
    })


    const [tasasActivas, setTasasActivas] = useState([])
    const [calculo, setCalculo] = useState(null)
    const [loadingObj, setLoadingObj] = useState(false)
    const [cargandoDatos, setCargandoDatos] = useState(true)
    // Autocomplete para personas
    const [busquedaPersona, setBusquedaPersona] = useState('')
    const [mostrarListaPersonas, setMostrarListaPersonas] = useState(false)
    const [personaSeleccionada, setPersonaSeleccionada] = useState(null)
    const autocompleteRef = React.useRef(null)

    const personasFiltradas = personas.filter(p => {
        const texto = `${p.primer_nombre} ${p.primer_apellido} ${p.cedula}`.toLowerCase()
        return texto.includes(busquedaPersona.toLowerCase())
    }).slice(0, 10)

    const tasaInteres = tasasActivas.find(t => t.es_interes_principal) || tasasActivas.find(t => {
        const name = (t.nombre ?? '').toLowerCase()
        return (name.includes('interés') || name.includes('interes') || name.includes('tasa')) && !t.es_tasa_mora
    })

    const tasaEstudio = tasasActivas.find(t => {
        const name = (t.nombre ?? '').toLowerCase()
        return name.includes('estudio')
    })

    const tasaPoliza = tasasActivas.find(t => {
        const name = (t.nombre ?? '').toLowerCase()
        return name.includes('póliza') || name.includes('poliza') || name.includes('seguro')
    })

    const otrasTasas = tasasActivas.filter(t => t.id !== tasaInteres?.id && t.id !== tasaEstudio?.id && t.id !== tasaPoliza?.id)


    // Cerrar dropdown al hacer clic fuera
    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
                setMostrarListaPersonas(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const cargarPersonas = async () => {
        try {
            const res = await api.get('/personas')
            setPersonas(res.data.personas || [])
        } catch (error) {
            console.error('Error cargando personas:', error)
            toast.error('No se pudieron cargar los clientes')
        }
    }

    const cargarTipos = async () => {
        try {
            const res = await api.get('/tipos-prestamo')
            setTipos(res.data.tipos || [])
        } catch (error) {
            console.error('Error cargando líneas:', error)
            toast.error('No se pudieron cargar las líneas de crédito')
        }
    }

    useEffect(() => {
        const fetchInicial = async () => {
            setCargandoDatos(true)
            await Promise.all([cargarPersonas(), cargarTipos()])
            setCargandoDatos(false)
        }
        fetchInicial()
    }, [])

    useEffect(() => {
        if (initialPersonaId && personas.length > 0) {
            const p = personas.find(x => x.id === initialPersonaId)
            if (p) {
                setPersonaSeleccionada(p)
                if (p.monto_requerido && p.monto_requerido > 0) {
                    setFormData(prev => ({
                        ...prev,
                        persona_id: p.id,
                        monto: String(p.monto_requerido)
                    }))
                }
            }
        }
    }, [initialPersonaId, personas])

    useEffect(() => {
        // Si elige tipo de prestamo, pre-cargar tasas, metodo y diferir cargos
        if (formData.tipo_id) {
            const elTipo = tipos.find(t => t.id === formData.tipo_id)
            if (elTipo) {
                // Inicializar tasasActivas basadas en las del tipo
                const initial = (elTipo.tasas || []).map(tRel => ({ ...tRel.tasa, activa: true }))
                setTasasActivas(initial)
                setFormData(prev => ({
                    ...prev,
                    metodo_amortizacion: elTipo.metodo_amortizacion || 'lineal',
                    diferir_cargos: elTipo.diferir_cargos !== undefined ? elTipo.diferir_cargos : true
                }))
            }
        }
    }, [formData.tipo_id, tipos])

    useEffect(() => {
        // Simulador hiper-rápido en frontend (cada keystroke)
        if (formData.monto && formData.cuotas) {
            const calc = calcularPrestamoSimulador({
                montoOtorgado: parseFloat(formData.monto),
                numeroCuotas: parseInt(formData.cuotas),
                fechaPrimerPago: formData.fechaPrimerPago,
                tasasAsignadas: tasasActivas,
                metodoAmortizacion: formData.metodo_amortizacion,
                diferirCargos: formData.diferir_cargos
            })
            setCalculo(calc)
            
            // Validación regulatoria de Usura
            const validation = validarTasaUsura(tasasActivas)
            if (validation.excede) {
                toast.error(validation.mensaje, { id: 'usura-warning', duration: 4000 })
            }
        } else {
            setCalculo(null)
        }
    }, [formData.monto, formData.cuotas, formData.fechaPrimerPago, tasasActivas, formData.metodo_amortizacion, formData.diferir_cargos])

    const handleTasaChange = (id, field, value) => {
        setTasasActivas(prev => prev.map(t => {
            if (t.id === id) {
                let updated = { ...t, [field]: value }
                
                // Si cambia tipo_calculo, sincronizar tipo_calculo_snapshot
                if (field === 'tipo_calculo') {
                    updated.tipo_calculo_snapshot = value
                    
                    // Al cambiar de tipo, propagar el valor actual a la propiedad base correspondiente
                    const currentValStr = String(updated.valor_snapshot ?? updated.valor_porcentaje ?? updated.valor_fijo ?? 0).replace(',', '.')
                    const currentVal = parseFloat(currentValStr) || 0
                    if (value === 'monto_fijo') {
                        updated.valor_fijo = currentVal
                    } else {
                        updated.valor_porcentaje = currentVal
                    }
                }
                
                // Si cambia valor_snapshot, propagar al campo base correspondiente según el tipo_calculo actual
                if (field === 'valor_snapshot') {
                    const cleanVal = typeof value === 'string' ? value.replace(',', '.') : value
                    const parsedNum = parseFloat(cleanVal) || 0
                    const currentTipo = updated.tipo_calculo_snapshot ?? updated.tipo_calculo
                    if (currentTipo === 'monto_fijo') {
                        updated.valor_fijo = parsedNum
                    } else {
                        updated.valor_porcentaje = parsedNum
                    }
                }
                
                return updated
            }
            return t;
        }))
    }

    const agregarTasaAdhoc = () => {
        const nueva = {
            id: `adhoc-${Date.now()}`,
            nombre: 'Nuevo Cargo/Interés',
            valor_snapshot: 0,
            tipo_calculo: 'porcentaje_periodico',
            es_cargo_unico: false,
            activa: true,
            es_adhoc: true
        }
        setTasasActivas([...tasasActivas, nueva])
    }

    const eliminarTasaAdhoc = (id) => {
        setTasasActivas(tasasActivas.filter(t => t.id !== id))
    }

    const guardarTasaGlobal = async (tasa) => {
        try {
            const res = await api.post('/tasas', {
                nombre: tasa.nombre,
                valor_porcentaje: tasa.tipo_calculo === 'porcentaje_periodico' ? parseFloat(tasa.valor_snapshot) : 0,
                valor_fijo: tasa.tipo_calculo === 'monto_fijo' ? parseFloat(tasa.valor_snapshot) : 0,
                tipo_calculo: tasa.tipo_calculo,
                es_cargo_unico: tasa.es_cargo_unico,
                aplica_sobre: 'capital_inicial'
            })

            // Actualizar la tasa local con la ID real de la DB
            setTasasActivas(prev => prev.map(t => {
                if (t.id === tasa.id) {
                    return { ...t, id: res.data.tasa.id, es_adhoc: false, guardado: true }
                }
                return t
            }))

            toast.success('¡Tasa guardada en el catálogo global!')
        } catch (e) {
            console.error(e)
            toast.error('Error al guardar la tasa permanentemente')
        }
    }

    const crearPrestamo = async () => {
        setLoadingObj(true)
        try {
            const res = await api.post('/prestamos', {
                ...formData,
                tasasPersonalizadas: tasasActivas // Pasamos el config overrides
            })
            toast.success('¡Préstamo registrado y activado con éxito!')
            onClose()
            if (res.data?.prestamo?.id) {
                onPrintSuccess(res.data.prestamo.id)
            }
        } catch (e) {
            toast.error(e.response?.data?.error || 'Error al procesar el préstamo')
        } finally {
            setLoadingObj(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(6,12,26,0.85)] backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
            {loadingObj && <Loader overlay message="Activando Crédito..." />}
            <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-6xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] flex flex-col md:flex-row overflow-hidden my-auto">

                {/* Lado izquierdo: Formulario de Simulación Constante */}
                <div className="w-full md:w-[400px] bg-[var(--fondo-card)] p-8 border-r border-[var(--borde)] flex-shrink-0 flex flex-col pt-12 relative overflow-y-auto max-h-[90vh]">
                    <button onClick={onClose} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white transition-colors bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                        <X size={20} />
                    </button>

                    <h2 className="text-2xl font-bold text-[var(--texto-1)] mb-6 font-syne flex items-center gap-3">
                        <CalcIcon className="text-[var(--cyan)]" />
                        Nuevo Préstamo
                    </h2>

                    <div className="space-y-5">
                        <div ref={autocompleteRef}>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider">Persona Solicitante</label>
                                <button
                                    type="button"
                                    onClick={() => setMostrarModalPersona(true)}
                                    className="text-[10px] text-[#4FD1C5] hover:underline uppercase font-bold"
                                >
                                    + Crear Nuevo Cliente
                                </button>
                            </div>
                            {/* Campo Autocomplete */}
                            <div className="relative">
                                <div className="flex items-center bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 gap-2 focus-within:border-[#1A6FFF] focus-within:shadow-[0_0_12px_rgba(26,111,255,0.2)] transition-all">
                                    <Search size={14} className="text-[var(--texto-3)] shrink-0" />
                                    <input
                                        type="text"
                                        placeholder={cargandoDatos ? 'Cargando clientes...' : 'Buscar por nombre o cédula...'}
                                        disabled={cargandoDatos}
                                        value={personaSeleccionada ? `${personaSeleccionada.primer_nombre} ${personaSeleccionada.primer_apellido}` : busquedaPersona}
                                        onChange={e => {
                                            setBusquedaPersona(e.target.value)
                                            setPersonaSeleccionada(null)
                                            setFormData(prev => ({ ...prev, persona_id: '' }))
                                            setMostrarListaPersonas(true)
                                        }}
                                        onFocus={() => setMostrarListaPersonas(true)}
                                        className="flex-1 bg-transparent text-[var(--texto-1)] text-sm focus:outline-none placeholder:text-[var(--texto-3)] disabled:opacity-50"
                                    />
                                    {personaSeleccionada && (
                                        <div className="w-6 h-6 rounded-full bg-[#10B981]/20 flex items-center justify-center shrink-0">
                                            <Check size={12} className="text-[#10B981]" />
                                        </div>
                                    )}
                                    {!personaSeleccionada && <ChevronDown size={14} className="text-[var(--texto-3)] shrink-0" />}
                                </div>

                                {/* Dropdown de resultados */}
                                {mostrarListaPersonas && !cargandoDatos && (
                                    <div className="absolute z-50 top-full mt-1 w-full bg-[#0d1526] border border-[var(--borde)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden max-h-[200px] overflow-y-auto">
                                        {personasFiltradas.length === 0 ? (
                                            <div className="py-4 px-4 text-center text-[var(--texto-3)] text-xs">
                                                {busquedaPersona ? `No se encontró: "${busquedaPersona}"` : 'Escribe para buscar clientes...'}
                                            </div>
                                        ) : (
                                            personasFiltradas.map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setPersonaSeleccionada(p)
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            persona_id: p.id,
                                                            monto: p.monto_requerido && p.monto_requerido > 0 ? String(p.monto_requerido) : prev.monto
                                                        }))
                                                        setBusquedaPersona('')
                                                        setMostrarListaPersonas(false)
                                                    }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1A6FFF]/10 transition-colors text-left border-b border-white/5 last:border-0"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-[var(--cyan)]/10 flex items-center justify-center text-[10px] font-black text-[var(--cyan)] shrink-0">
                                                        {p.primer_nombre?.[0]}{p.primer_apellido?.[0]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-[var(--texto-1)] font-semibold truncate">{p.primer_nombre} {p.primer_apellido}</p>
                                                        <p className="text-[10px] text-[var(--texto-3)]">{p.cedula} · {p.empresa?.nombre || 'Sin empresa'}</p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Línea de Crédito</label>
                            <select
                                disabled={cargandoDatos}
                                value={formData.tipo_id} onChange={e => setFormData({ ...formData, tipo_id: e.target.value })}
                                className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
                            >
                                <option value="">{cargandoDatos ? 'Cargando líneas...' : 'Seleccione línea...'}</option>
                                {!cargandoDatos && tipos.length === 0 && <option value="" disabled>No hay líneas de crédito configuradas</option>}
                                {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Capital Prestado ($)</label>
                                <input
                                    type="number" value={formData.monto} onChange={e => setFormData({ ...formData, monto: e.target.value })}
                                    className="w-full bg-[var(--cyan)]/5 border border-[var(--cyan)]/30 rounded-xl px-4 py-3 text-[var(--cyan)] font-bold text-lg focus:border-[var(--cyan)] focus:outline-none focus:shadow-[0_0_15px_rgba(79,209,197,0.2)]"
                                    placeholder="Ej: 2000000"
                                />
                            </div>
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Total Cuotas</label>
                                <input
                                    type="number" value={formData.cuotas} onChange={e => setFormData({ ...formData, cuotas: e.target.value })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] text-center font-bold focus:border-[var(--cyan)] focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">1er Pago Quincena</label>
                                <input
                                    type="date" value={formData.fechaPrimerPago} onChange={e => setFormData({ ...formData, fechaPrimerPago: e.target.value })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] text-sm focus:border-[var(--cyan)] focus:outline-none"
                                />
                            </div>
                        </div>

                        {formData.tipo_id && (
                            <div className="mt-6 pt-6 border-t border-[var(--borde)] space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[var(--texto-2)] text-[10px] font-bold uppercase tracking-wider mb-1.5">Método de Amortización</label>
                                        <select
                                            value={formData.metodo_amortizacion}
                                            onChange={e => setFormData({ ...formData, metodo_amortizacion: e.target.value })}
                                            className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-2.5 py-2.5 text-[var(--texto-1)] text-xs font-bold focus:border-[var(--cyan)] focus:outline-none"
                                        >
                                            <option value="lineal">Lineal (Capital Const.)</option>
                                            <option value="frances">Francesa (Cuota Fija)</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <label className="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors h-[42px]">
                                            <input
                                                type="checkbox"
                                                checked={formData.diferir_cargos}
                                                onChange={e => setFormData({ ...formData, diferir_cargos: e.target.checked })}
                                                className="accent-[var(--cyan)] w-3.5 h-3.5"
                                            />
                                            <span className="text-[9px] text-[var(--texto-1)] font-medium uppercase tracking-wide">Diferir cargos</span>
                                        </label>
                                    </div>
                                </div>

                                <h3 className="text-[var(--texto-1)] font-bold text-xs uppercase tracking-wider mb-2">Tasas y Cargos Aplicados</h3>
                                
                                {/* 1. Interés */}
                                {tasaInteres && (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2.5 text-sm text-[var(--texto-1)] font-bold cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={tasaInteres.activa}
                                                    onChange={(e) => handleTasaChange(tasaInteres.id, 'activa', e.target.checked)}
                                                    className="accent-[var(--cyan)] w-4 h-4 rounded border border-white/20 transition-all group-hover:scale-110"
                                                />
                                                <span className="tracking-tight">{tasaInteres.nombre}</span>
                                            </label>
                                        </div>
                                        {tasaInteres.activa && (
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={tasaInteres.tipo_calculo}
                                                    onChange={(e) => handleTasaChange(tasaInteres.id, 'tipo_calculo', e.target.value)}
                                                    className="bg-[var(--fondo-input)] border border-[var(--borde)] text-[var(--texto-1)] text-[11px] font-bold px-2 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)]"
                                                >
                                                    <option value="porcentaje_periodico">% Periódico (Interés)</option>
                                                    <option value="monto_fijo">$ Valor Fijo (Cargo)</option>
                                                </select>
                                                <div className="relative flex-1">
                                                    <input
                                                        type="number" step="0.0001"
                                                        value={tasaInteres.valor_snapshot ?? tasaInteres.valor_porcentaje ?? tasaInteres.valor_fijo}
                                                        onChange={(e) => handleTasaChange(tasaInteres.id, 'valor_snapshot', e.target.value)}
                                                        className="w-full bg-[var(--cyan)]/5 border border-[#4FD1C5]/30 text-[#4FD1C5] font-black text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)] text-right pr-7"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#4FD1C5] opacity-60">
                                                        {tasaInteres.tipo_calculo === 'porcentaje_periodico' ? '%' : '$'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 2. Estudio de Crédito */}
                                {tasaEstudio && (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2.5 text-sm text-[var(--texto-1)] font-bold cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={tasaEstudio.activa}
                                                    onChange={(e) => handleTasaChange(tasaEstudio.id, 'activa', e.target.checked)}
                                                    className="accent-[var(--cyan)] w-4 h-4 rounded border border-white/20 transition-all group-hover:scale-110"
                                                />
                                                <span className="tracking-tight">{tasaEstudio.nombre}</span>
                                            </label>
                                            {tasaEstudio.es_cargo_unico && <span className="text-[9px] text-[#FFB020] uppercase bg-[#FFB020]/10 px-2 py-0.5 rounded-full border border-[#FFB020]/20 font-black">Único</span>}
                                        </div>
                                        {tasaEstudio.activa && (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={tasaEstudio.tipo_calculo}
                                                        onChange={(e) => handleTasaChange(tasaEstudio.id, 'tipo_calculo', e.target.value)}
                                                        className="bg-[var(--fondo-input)] border border-[var(--borde)] text-[var(--texto-1)] text-[11px] font-bold px-2 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)]"
                                                    >
                                                        <option value="porcentaje_periodico">% Periódico (Interés)</option>
                                                        <option value="monto_fijo">$ Valor Fijo (Cargo)</option>
                                                    </select>
                                                    <div className="relative flex-1">
                                                        <input
                                                            type="number" step="0.0001"
                                                            value={tasaEstudio.valor_snapshot ?? tasaEstudio.valor_porcentaje ?? tasaEstudio.valor_fijo}
                                                            onChange={(e) => handleTasaChange(tasaEstudio.id, 'valor_snapshot', e.target.value)}
                                                            className="w-full bg-[var(--cyan)]/5 border border-[#4FD1C5]/30 text-[#4FD1C5] font-black text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)] text-right pr-7"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#4FD1C5] opacity-60">
                                                            {tasaEstudio.tipo_calculo === 'porcentaje_periodico' ? '%' : '$'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2 p-2 bg-black/5 rounded-xl border border-[var(--borde)] cursor-pointer hover:bg-black/10 transition-colors group">
                                                    <input
                                                        type="checkbox"
                                                        checked={tasaEstudio.es_cargo_unico}
                                                        onChange={(e) => handleTasaChange(tasaEstudio.id, 'es_cargo_unico', e.target.checked)}
                                                        className="accent-[var(--cyan)] w-3.5 h-3.5 rounded border border-white/20"
                                                    />
                                                    <span className="text-[9px] text-[var(--texto-2)] group-hover:text-[var(--texto-1)] font-bold uppercase tracking-wide">
                                                        ¿Cobrar solo una vez?
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 3. Póliza */}
                                {tasaPoliza && (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2.5 text-sm text-[var(--texto-1)] font-bold cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={tasaPoliza.activa}
                                                    onChange={(e) => handleTasaChange(tasaPoliza.id, 'activa', e.target.checked)}
                                                    className="accent-[var(--cyan)] w-4 h-4 rounded border border-white/20 transition-all group-hover:scale-110"
                                                />
                                                <span className="tracking-tight">{tasaPoliza.nombre}</span>
                                            </label>
                                            {tasaPoliza.es_cargo_unico && <span className="text-[9px] text-[#FFB020] uppercase bg-[#FFB020]/10 px-2 py-0.5 rounded-full border border-[#FFB020]/20 font-black">Único</span>}
                                        </div>
                                        {tasaPoliza.activa && (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={tasaPoliza.tipo_calculo}
                                                        onChange={(e) => handleTasaChange(tasaPoliza.id, 'tipo_calculo', e.target.value)}
                                                        className="bg-[var(--fondo-input)] border border-[var(--borde)] text-[var(--texto-1)] text-[11px] font-bold px-2 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)]"
                                                    >
                                                        <option value="porcentaje_periodico">% Periódico (Interés)</option>
                                                        <option value="monto_fijo">$ Valor Fijo (Cargo)</option>
                                                    </select>
                                                    <div className="relative flex-1">
                                                        <input
                                                            type="number" step="0.0001"
                                                            value={tasaPoliza.valor_snapshot ?? tasaPoliza.valor_porcentaje ?? tasaPoliza.valor_fijo}
                                                            onChange={(e) => handleTasaChange(tasaPoliza.id, 'valor_snapshot', e.target.value)}
                                                            className="w-full bg-[var(--cyan)]/5 border border-[#4FD1C5]/30 text-[#4FD1C5] font-black text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)] text-right pr-7"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#4FD1C5] opacity-60">
                                                            {tasaPoliza.tipo_calculo === 'porcentaje_periodico' ? '%' : '$'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2 p-2 bg-black/5 rounded-xl border border-[var(--borde)] cursor-pointer hover:bg-black/10 transition-colors group">
                                                    <input
                                                        type="checkbox"
                                                        checked={tasaPoliza.es_cargo_unico}
                                                        onChange={(e) => handleTasaChange(tasaPoliza.id, 'es_cargo_unico', e.target.checked)}
                                                        className="accent-[var(--cyan)] w-3.5 h-3.5 rounded border border-white/20"
                                                    />
                                                    <span className="text-[9px] text-[var(--texto-2)] group-hover:text-[var(--texto-1)] font-bold uppercase tracking-wide">
                                                        ¿Cobrar solo una vez?
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Adicionales */}
                                {otrasTasas.length > 0 && (
                                    <div className="space-y-3 pt-3 border-t border-white/5 animate-fade-in">
                                        <h4 className="text-[var(--texto-3)] font-bold text-[10px] uppercase tracking-wider">Cargos Adicionales</h4>
                                        {otrasTasas.map(tasa => (
                                            <div key={tasa.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                                                <div className="flex items-center justify-between">
                                                    {tasa.es_adhoc ? (
                                                        <div className="flex-1 mr-2">
                                                            <input
                                                                type="text"
                                                                value={tasa.nombre}
                                                                onChange={(e) => handleTasaChange(tasa.id, 'nombre', e.target.value)}
                                                                className="w-full bg-transparent border-b border-[var(--cyan)]/30 text-sm text-[var(--texto-1)] font-bold focus:outline-none focus:border-[var(--cyan)]"
                                                                placeholder="Título del cargo..."
                                                            />
                                                        </div>
                                                    ) : (
                                                        <label className="flex items-center gap-2.5 text-sm text-[var(--texto-1)] font-bold cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={tasa.activa}
                                                                onChange={(e) => handleTasaChange(tasa.id, 'activa', e.target.checked)}
                                                                className="accent-[var(--cyan)] w-4 h-4 rounded border border-white/20 transition-all group-hover:scale-110"
                                                            />
                                                            <span className="tracking-tight">{tasa.nombre}</span>
                                                        </label>
                                                    )}
                                                    <div className="flex items-center gap-1">
                                                        {tasa.es_adhoc && !tasa.guardado && (
                                                            <button
                                                                onClick={() => guardarTasaGlobal(tasa)}
                                                                className="text-[var(--cyan)] hover:bg-[var(--cyan)]/10 p-1.5 rounded-lg transition-colors"
                                                                title="Guardar en catálogo"
                                                            >
                                                                <Save size={14} />
                                                            </button>
                                                        )}
                                                        {tasa.guardado && (
                                                            <div className="text-[#10B981] p-1.5" title="Guardado">
                                                                <Check size={14} />
                                                            </div>
                                                        )}
                                                        <button onClick={() => eliminarTasaAdhoc(tasa.id)} className="text-[#F43F5E] hover:bg-[#F43F5E]/10 p-1.5 rounded-lg transition-colors">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {tasa.activa && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={tasa.tipo_calculo}
                                                                onChange={(e) => handleTasaChange(tasa.id, 'tipo_calculo', e.target.value)}
                                                                className="bg-[var(--fondo-input)] border border-[var(--borde)] text-[var(--texto-1)] text-[11px] font-bold px-2 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)]"
                                                            >
                                                                <option value="porcentaje_periodico">% Periódico (Interés)</option>
                                                                <option value="monto_fijo">$ Valor Fijo (Cargo)</option>
                                                            </select>
                                                            <div className="relative flex-1">
                                                                <input
                                                                    type="number" step="0.0001"
                                                                    value={tasa.valor_snapshot ?? tasa.valor_porcentaje ?? tasa.valor_fijo}
                                                                    onChange={(e) => handleTasaChange(tasa.id, 'valor_snapshot', e.target.value)}
                                                                    className="w-full bg-[var(--cyan)]/5 border border-[#4FD1C5]/30 text-[#4FD1C5] font-black text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[var(--cyan)] text-right pr-7"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#4FD1C5] opacity-60">
                                                                    {tasa.tipo_calculo === 'porcentaje_periodico' ? '%' : '$'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <label className="flex items-center gap-2 p-2 bg-black/5 rounded-xl border border-[var(--borde)] cursor-pointer hover:bg-black/10 transition-colors group">
                                                            <input
                                                                type="checkbox"
                                                                checked={tasa.es_cargo_unico}
                                                                onChange={(e) => handleTasaChange(tasa.id, 'es_cargo_unico', e.target.checked)}
                                                                className="accent-[var(--cyan)] w-3.5 h-3.5 rounded border border-white/20"
                                                            />
                                                            <span className="text-[9px] text-[var(--texto-2)] group-hover:text-[var(--texto-1)] font-bold uppercase tracking-wide">
                                                                ¿Cobrar solo una vez?
                                                            </span>
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    onClick={agregarTasaAdhoc}
                                    type="button"
                                    className="w-full py-2.5 border border-dashed border-[var(--cyan)]/40 rounded-xl text-[var(--cyan)] text-xs font-bold uppercase hover:bg-[var(--cyan)]/5 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} /> Agregar Cargo Personalizado
                                </button>
                            </div>
                        )
}

                        {/* Botón de Guardado Permanente en la columna de datos */}
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <button
                                onClick={crearPrestamo}
                                disabled={loadingObj || !formData.persona_id || !formData.tipo_id || !calculo}
                                className={`w-full font-bold py-5 px-6 rounded-2xl transition-all uppercase tracking-widest text-sm flex flex-col items-center justify-center gap-1 shadow-2xl relative overflow-hidden group ${(loadingObj || !formData.persona_id || !formData.tipo_id || !calculo)
                                    ? "bg-white/5 text-[var(--texto-3)] border border-white/10 opacity-40 cursor-not-allowed"
                                    : "bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white animate-ready-pulse glow-green scale-[1.02] border-t border-white/30"
                                    }`}
                            >
                                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none"></div>
                                <span className="flex items-center gap-2 relative z-10">
                                    {loadingObj ? 'Procesando...' : 'ACTIVAR CRÉDITO AHORA'}
                                </span>
                                {(!formData.persona_id || !formData.tipo_id) && !loadingObj && <span className="text-[9px] font-medium opacity-60 normal-case tracking-normal relative z-10">Seleccione cliente y línea para continuar</span>}
                                {calculo && !loadingObj && formData.persona_id && formData.tipo_id && (
                                    <div className="flex items-center gap-1.5 relative z-10">
                                        <span className="size-1.5 rounded-full bg-white animate-ping"></span>
                                        <span className="text-[9px] font-bold uppercase tracking-[0.1em]">¡Motor Listo para Activación!</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Lado derecho: Visualización y Tabla */}
                <div className="flex-1 bg-[var(--fondo-base)] p-8 overflow-y-auto max-h-[90vh]">
                    {!calculo ? (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                            <Calculator size={64} className="text-[#1A6FFF] mb-4 blur-[2px]" />
                            <p className="text-xl font-syne text-[var(--texto-2)]">Ingresa los parámetros para activar<br />el Motor Financiero en Tiempo Real.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in pb-10">
                            {/* Encabezado Resultados */}
                            <div className="bg-gradient-to-br from-[rgba(26,111,255,0.1)] to-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.3)] rounded-2xl p-6 shadow-[0_0_30px_rgba(0,212,255,0.1)]">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold font-syne text-white tracking-wide">Resumen Proyección</h3>
                                    <div className="px-3 py-1 bg-[rgba(16,185,129,0.15)] text-[#10B981] border border-[#10B981]/30 rounded-full text-xs font-bold uppercase tracking-widest">
                                        Cálculo Exacto Activo
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Monto Entregado</p>
                                        <p className="text-2xl font-bold text-[var(--texto-1)] font-mono">{formatCOPCorto(calculo.montoOtorgado)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider mb-1">Costo Financiero</p>
                                        <p className="text-xl font-bold text-[#F43F5E] font-mono">{formatCOPCorto(calculo.costoFinanciero)}</p>
                                        <p className="text-[10px] text-[var(--texto-3)]">E.A: {calculo.tasaEfectiva}%</p>
                                    </div>
                                    <div className="bg-[var(--cyan)]/10 p-3 rounded-xl border border-[var(--cyan)]/20 lg:col-span-2">
                                        <p className="text-[var(--cyan)] text-xs font-bold uppercase tracking-wider mb-1">Cuota Estándar Quincenal</p>
                                        <p className="text-3xl font-bold text-[var(--texto-1)] font-mono">{formatCOPCorto(calculo.cuotaEstandar)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Tabla de Amortización Full */}
                            <div>
                                <h3 className="text-lg font-bold text-[var(--texto-1)] mb-4">Tabla de Amortización (Proyección Exacta)</h3>
                                <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl overflow-hidden shadow-xl">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)]">
                                                <th className="py-3 px-4 text-center font-bold text-[var(--texto-2)] uppercase">N°</th>
                                                <th className="py-3 px-4 font-bold text-[var(--texto-2)] uppercase">Vencimiento</th>
                                                <th className="py-3 px-4 font-bold text-[var(--texto-2)] uppercase text-right">Saldo Inicial</th>
                                                <th className="py-3 px-4 font-bold text-[var(--texto-2)] uppercase text-right">Abono Capital</th>
                                                <th className="py-3 px-4 font-bold text-[#F43F5E] uppercase text-right">Intereses</th>
                                                <th className="py-3 px-4 font-bold text-[#FFB020] uppercase text-right">Cargos Ú.</th>
                                                <th className="py-3 px-4 font-bold text-[var(--cyan)] uppercase text-right">Cuota Total</th>
                                                <th className="py-3 px-4 font-bold text-[var(--texto-1)] uppercase text-right">Saldo Final</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono">
                                            {calculo.tablaCuotas.map(c => (
                                                <tr key={c.numeroCuota} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(26,111,255,0.05)] transition-colors">
                                                    <td className="py-3 px-4 text-center text-[var(--texto-3)]">{String(c.numeroCuota).padStart(2, '0')}</td>
                                                    <td className="py-3 px-4 text-[var(--texto-1)]">{formatFechaCorta(c.fechaPago)}</td>
                                                    <td className="py-3 px-4 text-right text-[var(--texto-2)]">{formatCOPCorto(c.saldoInicio)}</td>
                                                    <td className="py-3 px-4 text-right text-[var(--texto-1)]">{formatCOPCorto(c.capitalAbonado)}</td>
                                                    <td className="py-3 px-4 text-right text-[#F43F5E]">{formatCOPCorto(c.interesesCobrados)}</td>
                                                    <td className="py-3 px-4 text-right text-[#FFB020]">{c.cargosUnicos > 0 ? formatCOPCorto(c.cargosUnicos) : '-'}</td>
                                                    <td className="py-3 px-4 text-right text-[var(--cyan)] font-bold">{formatCOPCorto(c.cuotaTotal)}</td>
                                                    <td className={`py-3 px-4 text-right font-bold ${c.saldoFinal === 0 ? 'text-[#10B981]' : 'text-[var(--texto-1)]'}`}>
                                                        {formatCOPCorto(c.saldoFinal)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t-2 border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] font-mono font-bold">
                                            <tr>
                                                <td colSpan="3" className="py-4 px-4 text-right text-[var(--texto-2)] uppercase text-xs">Totales Exactos:</td>
                                                <td className="py-4 px-4 text-right text-[var(--texto-1)]">{formatCOPCorto(calculo.totalCapital)}</td>
                                                <td className="py-4 px-4 text-right text-[#F43F5E]">{formatCOPCorto(calculo.totalIntereses)}</td>
                                                <td className="py-4 px-4 text-right text-[#FFB020]">{formatCOPCorto(calculo.totalCargosUnicos)}</td>
                                                <td className="py-4 px-4 text-right text-[var(--cyan)] text-lg">{formatCOPCorto(calculo.totalPagado)}</td>
                                                <td className="py-4 px-4 text-right text-[var(--texto-1)]">-</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {mostrarModalPersona && (
                    <ModalPersona
                        onClose={(id) => {
                            setMostrarModalPersona(false)
                            if (id) {
                                cargarPersonas()
                                setFormData(prev => ({ ...prev, persona_id: id }))
                            }
                        }}
                    />
                )}

            </div>
        </div>
    )
}

function ModalDetalle({ prestamo, onClose }) {
    if (!prestamo) return null;
    const { persona, cuotas, tipo } = prestamo;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(6,12,26,0.85)] backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
            <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-4xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] my-auto p-4 md:p-8 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-[var(--texto-1)] transition-colors bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                    <X size={18} />
                </button>
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--cyan)]/10 flex items-center justify-center text-[var(--cyan)] font-bold text-xl uppercase">
                        {persona?.primer_nombre?.[0]}{persona?.primer_apellido?.[0]}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--texto-1)] uppercase">{persona?.primer_nombre} {persona?.primer_apellido}</h2>
                        <p className="text-sm text-[var(--cyan)] font-mono font-bold tracking-widest">{prestamo.codigo || '#SIN_CODIGO'}</p>
                    </div>
                    <div className="ml-auto">
                        <BadgeEstado estado={prestamo.estado} />
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-[var(--fondo-card-alt)] rounded-2xl p-4 border border-[var(--borde)]">
                        <p className="text-[var(--texto-3)] text-[10px] uppercase font-bold tracking-wider mb-1">Monto Otorgado</p>
                        <p className="text-[var(--texto-1)] text-lg font-bold font-syne">{formatCOP(prestamo.monto_otorgado)}</p>
                    </div>
                    <div className="bg-[var(--cyan)]/10 rounded-2xl p-4 border border-[var(--cyan)]/20">
                        <p className="text-[var(--texto-3)] text-[10px] uppercase font-bold tracking-wider mb-1">Total a Pagar</p>
                        <p className="text-[var(--cyan)] text-lg font-bold font-syne">{formatCOP(prestamo.total_a_pagar)}</p>
                    </div>
                    <div className="bg-[var(--fondo-card-alt)] rounded-2xl p-4 border border-[var(--borde)]">
                        <p className="text-[var(--texto-3)] text-[10px] uppercase font-bold tracking-wider mb-1">Cuotas</p>
                        <p className="text-[var(--texto-1)] text-lg font-bold font-syne">{prestamo.numero_cuotas}</p>
                    </div>
                    <div className="bg-[var(--fondo-card-alt)] rounded-2xl p-4 border border-[var(--borde)]">
                        <p className="text-[var(--texto-3)] text-[10px] uppercase font-bold tracking-wider mb-1">Línea</p>
                        <p className="text-[var(--texto-1)] text-sm font-bold uppercase">{tipo?.nombre}</p>
                    </div>
                </div>

                <h3 className="text-sm font-bold text-[var(--texto-1)] uppercase tracking-widest mb-4 flex items-center gap-2">
                    Plan de pagos y amortización
                </h3>
                <div className="overflow-hidden rounded-2xl border border-[var(--borde)] bg-[var(--fondo-card)] max-h-[400px] overflow-y-auto shadow-inner">
                    <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="sticky top-0 bg-[var(--fondo-card-alt)] border-b border-[var(--borde)] z-10">
                            <tr>
                                <th className="py-2.5 px-4 font-bold text-[var(--texto-3)] uppercase">N°</th>
                                <th className="py-2.5 px-4 font-bold text-[var(--texto-3)] uppercase">Fecha</th>
                                <th className="py-2.5 px-4 font-bold text-[var(--texto-3)] uppercase text-right">Cuota</th>
                                <th className="py-2.5 px-4 font-bold text-[var(--texto-3)] uppercase text-right">Saldo</th>
                                <th className="py-2.5 px-4 font-bold text-[var(--texto-3)] uppercase text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono divide-y divide-[var(--borde)] cursor-default">
                            {cuotas?.map(c => (
                                <tr key={c.id} className="hover:bg-[var(--cyan)]/5 transition-colors">
                                    <td className="py-2 px-4 text-[var(--texto-3)]">{String(c.numero_cuota).padStart(2, '0')}</td>
                                    <td className="py-2 px-4 text-[var(--texto-1)]">{formatFechaCorta(c.fecha_programada)}</td>
                                    <td className="py-2 px-4 text-right text-[var(--texto-1)] font-bold">{formatCOPCorto(c.cuota_total)}</td>
                                    <td className="py-2 px-4 text-right text-[var(--texto-2)]">{formatCOPCorto(c.saldo_final)}</td>
                                    <td className="py-2 px-4 text-center">
                                        <BadgeEstado estado={c.estado} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

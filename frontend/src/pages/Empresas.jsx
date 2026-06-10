import React, { useEffect, useState, useRef } from 'react'
import { Building2, Plus, X, Pencil, Trash2, Printer } from 'lucide-react'
import api from '../utils/api'
import { useReactToPrint } from 'react-to-print'
import { EmpresaEmpleadosPDF } from '../components/empresas/EmpresaEmpleadosPDF'
import toast from 'react-hot-toast'
import { Loader } from '../components/ui/Loader'

export function Empresas() {
    const [empresas, setEmpresas] = useState([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [empresaEditar, setEmpresaEditar] = useState(null)
    const [nombre, setNombre] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [empresaImprimir, setEmpresaImprimir] = useState(null)
    const [empleadosImprimir, setEmpleadosImprimir] = useState([])
    const [modalQuincenaOpen, setModalQuincenaOpen] = useState(false)
    const [quincenaConfig, setQuincenaConfig] = useState({
        anio: new Date().getFullYear(),
        mes: new Date().getMonth(),
        quincena: new Date().getDate() <= 15 ? 'Q1' : 'Q2'
    })
    const [periodoImprimir, setPeriodoImprimir] = useState(null)
    const printRef = useRef()

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: 'Reporte_Empresa',
    })

    const abrirSelectorQuincena = (emp) => {
        setEmpresaImprimir(emp)
        const hoy = new Date()
        setQuincenaConfig({
            anio: hoy.getFullYear(),
            mes: hoy.getMonth(),
            quincena: hoy.getDate() <= 15 ? 'Q1' : 'Q2'
        })
        setModalQuincenaOpen(true)
    }

    const generarReporteQuincena = async () => {
        setModalQuincenaOpen(false)
        setPeriodoImprimir(quincenaConfig)
        try {
            const res = await api.get('/personas', { params: { empresa_id: empresaImprimir.id } })
            setEmpleadosImprimir(res.data.personas || [])
            setTimeout(() => handlePrint(), 500)
        } catch (e) { console.error(e) }
    }

    const cargar = async () => {
        setLoading(true)
        try {
            const res = await api.get('/empresas')
            setEmpresas(res.data.empresas || [])
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    useEffect(() => { cargar() }, [])

    const abrirModal = (empresa = null) => {
        setEmpresaEditar(empresa)
        setNombre(empresa?.nombre || '')
        setModalOpen(true)
    }

    const guardar = async (e) => {
        e.preventDefault()
        if (!nombre.trim()) return
        setGuardando(true)
        try {
            if (empresaEditar) {
                await api.put(`/empresas/${empresaEditar.id}`, { nombre })
            } else {
                await api.post('/empresas', { nombre })
            }
            setModalOpen(false)
            cargar()
            toast.success('Empresa guardada con éxito')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Error al guardar empresa')
        } finally {
            setGuardando(false)
        }
    }

    const [confirmEliminarId, setConfirmEliminarId] = useState(null)

    const eliminar = async (id) => {
        try {
            await api.delete(`/empresas/${id}`)
            setConfirmEliminarId(null)
            cargar()
            toast.success('Empresa eliminada')
        } catch (e) {
            toast.error(e.response?.data?.error || 'Error al eliminar empresa')
        }
    }

    return (
        <div className="space-y-6">
            {guardando && <Loader overlay message="Procesando Empresa..." />}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
                        <Building2 className="text-[var(--cyan)]" />
                        Gestión de Empresas
                    </h1>
                    <p className="text-[var(--texto-3)] text-sm mt-1">Organizaciones y empleadores asociados a clientes.</p>
                </div>
                <button
                    onClick={() => abrirModal()}
                    className="bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-[0_0_15px_rgba(79,209,197,0.3)] flex items-center gap-2"
                >
                    <Plus size={18} /> Nueva Empresa
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <p className="text-[var(--texto-3)] col-span-3 text-center py-10">Cargando empresas...</p>
                ) : empresas.length === 0 ? (
                    <div className="col-span-3 flex flex-col items-center justify-center py-20 text-center">
                        <Building2 size={48} className="text-white/20 mb-3" />
                        <p className="text-[var(--texto-3)] text-sm">No hay empresas registradas.</p>
                        <button onClick={() => abrirModal()} className="mt-4 text-[#4FD1C5] text-sm hover:underline font-bold">+ Agregar primera empresa</button>
                    </div>
                ) : (
                    empresas.map(emp => (
                        <div key={emp.id} className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-5 hover:border-[#4FD1C5]/40 transition-all group">
                            <div className="flex justify-between items-start mb-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4FD1C5] to-[#38B2AC] flex items-center justify-center text-white font-bold text-lg">
                                    {emp.nombre?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => abrirSelectorQuincena(emp)} className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors" title="Imprimir Reporte Quincenal">
                                        <Printer size={15} />
                                    </button>
                                    <button onClick={() => abrirModal(emp)} className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors">
                                        <Pencil size={15} />
                                    </button>
                                    <button onClick={() => setConfirmEliminarId(emp.id)} className="p-1.5 text-[var(--texto-3)] hover:text-[#F43F5E] hover:bg-[rgba(244,63,94,0.1)] rounded-lg transition-colors">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-white font-bold uppercase">{emp.nombre}</h3>
                            <p className="text-xs text-[var(--texto-3)] mt-1 font-mono">{emp.id.slice(0, 12)}...</p>
                        </div>
                    ))
                )}
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,32,0.8)] backdrop-blur-sm p-4">
                    <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-sm rounded-3xl p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.6)]">
                        <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                            <X size={18} />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6">{empresaEditar ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
                        <form onSubmit={guardar}>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Nombre de la Empresa *</label>
                            <input
                                autoFocus
                                required
                                value={nombre}
                                onChange={e => setNombre(e.target.value)}
                                placeholder="Ej: Cooperativa Coraza CTA"
                                className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none mb-6"
                            />
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-bold transition-all">Cancelar</button>
                                <button type="submit" disabled={guardando} className="flex-1 bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                    {guardando ? 'Guardando...' : 'GUARDAR'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmEliminarId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--fondo-base)] border border-[var(--borde)] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={24} className="text-red-500" />
                        </div>
                        <h3 className="text-white font-bold text-lg text-center mb-2">¿Eliminar empresa?</h3>
                        <p className="text-[var(--texto-3)] text-sm text-center mb-6">Solo si no tiene personas asociadas. Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmEliminarId(null)} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all">Cancelar</button>
                            <button onClick={() => eliminar(confirmEliminarId)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

            {modalQuincenaOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,32,0.8)] backdrop-blur-sm p-4">
                    <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-sm rounded-3xl p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.6)]">
                        <button onClick={() => setModalQuincenaOpen(false)} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                            <X size={18} />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6 flex flex-col">
                            <span>Reporte de Cobro</span>
                            <span className="text-sm font-normal text-[var(--cyan)] uppercase tracking-wider mt-1">{empresaImprimir?.nombre}</span>
                        </h2>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Año</label>
                                <select 
                                    value={quincenaConfig.anio} 
                                    onChange={e => setQuincenaConfig({ ...quincenaConfig, anio: parseInt(e.target.value) })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none"
                                >
                                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Mes</label>
                                <select 
                                    value={quincenaConfig.mes} 
                                    onChange={e => setQuincenaConfig({ ...quincenaConfig, mes: parseInt(e.target.value) })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none"
                                >
                                    {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, idx) => (
                                        <option key={idx} value={idx}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Quincena de Nómina</label>
                                <select 
                                    value={quincenaConfig.quincena} 
                                    onChange={e => setQuincenaConfig({ ...quincenaConfig, quincena: e.target.value })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none"
                                >
                                    <option value="Q1">Primera Quincena (Días 1 a 15)</option>
                                    <option value="Q2">Segunda Quincena (Días 16 a Fin de Mes)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button type="button" onClick={() => setModalQuincenaOpen(false)} className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-bold transition-all">Cancelar</button>
                            <button 
                                onClick={generarReporteQuincena}
                                className="flex-1 bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white font-bold py-3 rounded-xl shadow-lg transition-all"
                            >
                                GENERAR PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Componente Invisible para PDF - Offscreen para permitir renderizado */}
            <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', opacity: 0, pointerEvents: 'none' }}>
                <EmpresaEmpleadosPDF ref={printRef} empresa={empresaImprimir} empleados={empleadosImprimir} periodo={periodoImprimir} />
            </div>
        </div>
    )
}

import React, { useEffect, useState } from 'react'
import { Layers, Plus, X, Pencil, Trash2, Printer } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { QuickPrint } from '../components/ui/QuickPrint'
import { GenericReportPDF } from '../components/ui/GenericReportPDF'

export function TiposPrestamo() {
    const [tipos, setTipos] = useState([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [tipoEditar, setTipoEditar] = useState(null)
    const [formData, setFormData] = useState({
        nombre: '',
        cuotas_maximas: 12,
        interes_corriente: 0,
        interes_mora: 0,
        monto_minimo: 0,
        monto_maximo: 0,
        descripcion: '',
        metodo_amortizacion: 'lineal',
        diferir_cargos: true
    })
    const [tasasDisponibles, setTasasDisponibles] = useState([])
    const [selectedTasas, setSelectedTasas] = useState([])
    const [guardando, setGuardando] = useState(false)

    const cargar = async () => {
        setLoading(true)
        try {
            const res = await api.get('/tipos-prestamo')
            setTipos(res.data.tipos || [])
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const cargarTasas = async () => {
        try {
            const res = await api.get('/tasas')
            setTasasDisponibles(res.data.tasas || [])
        } catch (e) { console.error(e) }
    }

    useEffect(() => {
        cargar()
        cargarTasas()
    }, [])

    const abrirModal = (tipo = null) => {
        setTipoEditar(tipo)
        setFormData({
            nombre: tipo?.nombre || '',
            cuotas_maximas: tipo?.cuotas_maximas || 12,
            interes_corriente: tipo?.interes_corriente || 0,
            interes_mora: tipo?.interes_mora || 0,
            monto_minimo: tipo?.monto_minimo || 0,
            monto_maximo: tipo?.monto_maximo || 0,
            descripcion: tipo?.descripcion || '',
            metodo_amortizacion: tipo?.metodo_amortizacion || 'lineal',
            diferir_cargos: tipo?.diferir_cargos !== undefined ? tipo.diferir_cargos : true
        })
        setSelectedTasas(tipo?.tasas?.map(t => t.tasa_id) || [])
        setModalOpen(true)
    }

    const guardar = async (e) => {
        e.preventDefault()
        setGuardando(true)
        try {
            const payload = { ...formData, tasasIds: selectedTasas }
            if (tipoEditar) {
                await api.put(`/tipos-prestamo/${tipoEditar.id}`, payload)
            } else {
                await api.post('/tipos-prestamo', payload)
            }
            setModalOpen(false)
            cargar()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Error al guardar tipo de préstamo')
        } finally {
            setGuardando(false)
        }
    }

    const [confirmEliminarId, setConfirmEliminarId] = useState(null)

    const eliminar = async (id) => {
        try {
            await api.delete(`/tipos-prestamo/${id}`)
            setConfirmEliminarId(null)
            cargar()
        } catch (e) {
            toast.error(e.response?.data?.error || 'Error al eliminar')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
                        <Layers className="text-[var(--cyan)]" />
                        Tipologías de Crédito
                    </h1>
                    <p className="text-[var(--texto-3)] text-sm mt-1">Configuración de tasas de interés y límites por tipo de servicio.</p>
                </div>
                <div className="flex items-center gap-3">
                    <QuickPrint
                        component={GenericReportPDF}
                        props={{
                            title: "Catálogo de Productos de Crédito",
                            subtitle: "Configuración vigente de tipologías YAP (CRÉDITOS POR LIBRANZA)",
                            infoRows: [
                                { label: "Total Tipologías", value: tipos.length },
                                { label: "Entidad", value: "YAP (CRÉDITOS POR LIBRANZA)" }
                            ],
                            tableHeaders: [
                                { label: "Producto" },
                                { label: "Int. Corriente", align: "text-center" },
                                { label: "Int. Mora", align: "text-center" },
                                { label: "Rango Monto", align: "text-center" }
                            ],
                            tableRows: tipos.map(t => [
                                { value: t.nombre },
                                { value: `${t.interes_corriente}%` },
                                { value: `${t.interes_mora}%` },
                                { value: `$${t.monto_minimo.toLocaleString()} - $${t.monto_maximo.toLocaleString()}` }
                            ]),
                            footerText: "ESTAS TASAS ESTÁN SUJETAS A CAMBIO SEGÚN POLÍTICA INTERNA."
                        }}
                    />
                    <button
                        onClick={() => abrirModal()}
                        className="bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-[0_0_15px_rgba(79,209,197,0.3)] flex items-center gap-2"
                    >
                        <Plus size={18} /> Nueva Tipología
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <p className="text-[var(--texto-3)] col-span-3 text-center py-10">Cargando...</p>
                ) : tipos.length === 0 ? (
                    <div className="col-span-3 text-center py-20 opacity-40">
                        <Layers size={48} className="mx-auto mb-3" />
                        <p>No hay tipologías configuradas.</p>
                    </div>
                ) : (
                    tipos.map(t => (
                        <div key={t.id} className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-6 hover:border-[var(--cyan)]/40 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--cyan)]/5 blur-3xl rounded-full"></div>
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <h3 className="text-lg font-bold text-white uppercase">{t.nombre}</h3>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => abrirModal(t)} className="p-1.5 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors">
                                        <Pencil size={15} />
                                    </button>
                                    <button onClick={() => setConfirmEliminarId(t.id)} className="p-1.5 text-[var(--texto-3)] hover:text-[#F43F5E] hover:bg-[rgba(244,63,94,0.1)] rounded-lg transition-colors">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-3 relative z-10">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--texto-3)]">Int. Mensual</span>
                                    <span className="text-white font-bold">{t.interes_corriente}%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--texto-3)]">Método</span>
                                    <span className="text-[var(--cyan)] font-bold capitalize">{t.metodo_amortizacion === 'frances' ? 'Francesa' : 'Lineal'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--texto-3)]">Cargos Únicos</span>
                                    <span className="text-white font-bold">{t.diferir_cargos ? 'Diferidos' : 'En 1ra cuota'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--texto-3)]">Cuotas Máx.</span>
                                    <span className="text-white font-bold">{t.cuotas_maximas} Cuotas</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--texto-3)]">Mora</span>
                                    <span className="text-[#F43F5E] font-bold">{t.interes_mora}%</span>
                                </div>
                                <div className="pt-3 border-t border-white/5">
                                    <p className="text-[10px] text-[var(--texto-3)] uppercase font-bold mb-1">Rango de Monto</p>
                                    <p className="text-sm text-[var(--cyan)] font-bold">
                                        ${Number(t.monto_minimo).toLocaleString()} - ${Number(t.monto_maximo).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,32,0.8)] backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-lg rounded-3xl p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.6)] my-auto">
                        <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                            <X size={18} />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6">Configurar Tipología</h2>
                        <form onSubmit={guardar} className="space-y-4">
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Nombre del Producto</label>
                                <input required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                    placeholder="Ej: Microcrédito Express" className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Cuotas Máximas</label>
                                    <input type="number" value={formData.cuotas_maximas} onChange={e => setFormData({ ...formData, cuotas_maximas: parseInt(e.target.value) })}
                                        className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Interés Corriente (%)</label>
                                    <input type="number" step="0.01" value={formData.interes_corriente} onChange={e => setFormData({ ...formData, interes_corriente: parseFloat(e.target.value) })}
                                        className="w-full bg-[rgba(79,209,197,0.05)] border border-[#4FD1C5]/30 rounded-xl px-4 py-3 text-[#4FD1C5] font-bold focus:border-[#4FD1C5] focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Interés Mora (%)</label>
                                    <input type="number" step="0.01" value={formData.interes_mora} onChange={e => setFormData({ ...formData, interes_mora: parseFloat(e.target.value) })}
                                        className="w-full bg-[rgba(244,63,94,0.05)] border border-[#F43F5E]/30 rounded-xl px-4 py-3 text-[#F43F5E] font-bold focus:border-[#F43F5E] focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Monto Mínimo</label>
                                    <input type="number" value={formData.monto_minimo} onChange={e => setFormData({ ...formData, monto_minimo: parseFloat(e.target.value) })}
                                        className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Monto Máximo</label>
                                <input type="number" value={formData.monto_maximo} onChange={e => setFormData({ ...formData, monto_maximo: parseFloat(e.target.value) })}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Método Amortización</label>
                                    <select
                                        value={formData.metodo_amortizacion}
                                        onChange={e => setFormData({ ...formData, metodo_amortizacion: e.target.value })}
                                        className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5] focus:outline-none"
                                    >
                                        <option value="lineal">Lineal (Capital Const.)</option>
                                        <option value="frances">Francesa (Cuota Fija)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col justify-end">
                                    <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors h-[50px]">
                                        <input
                                            type="checkbox"
                                            checked={formData.diferir_cargos}
                                            onChange={e => setFormData({ ...formData, diferir_cargos: e.target.checked })}
                                            className="accent-[#4FD1C5] w-4 h-4"
                                        />
                                        <span className="text-xs text-[var(--texto-1)] font-medium">Diferir cargos únicos</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Tasas e Intereses Aplicables</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto p-4 bg-white/5 rounded-xl border border-white/5">
                                    {tasasDisponibles.map(t => (
                                        <label key={t.id} className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-1 rounded transition-all">
                                            <input
                                                type="checkbox"
                                                className="accent-[#4FD1C5]"
                                                checked={selectedTasas.includes(t.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedTasas([...selectedTasas, t.id])
                                                    else setSelectedTasas(selectedTasas.filter(id => id !== t.id))
                                                }}
                                            />
                                            <span className="text-sm text-white font-medium">{t.nombre}</span>
                                            <span className="text-[10px] text-[var(--texto-3)] ml-auto">
                                                {t.tipo_calculo === 'monto_fijo' ? `$${t.valor_fijo}` : `${t.valor_porcentaje}%`}
                                            </span>
                                        </label>
                                    ))}
                                    {tasasDisponibles.length === 0 && <p className="text-[var(--texto-3)] text-xs italic">Crea tasas en 'Tasas de Interés' primero.</p>}
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
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
                        <h3 className="text-white font-bold text-lg text-center mb-2">¿Eliminar tipología?</h3>
                        <p className="text-[var(--texto-3)] text-sm text-center mb-6">Solo si no hay préstamos activos de este tipo. Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmEliminarId(null)} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all">Cancelar</button>
                            <button onClick={() => eliminar(confirmEliminarId)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

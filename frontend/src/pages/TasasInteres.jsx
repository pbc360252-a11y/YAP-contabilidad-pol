import React, { useEffect, useState } from 'react'
import { Plus, GripVertical, Save, Trash2 } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export function TasasInteres() {
    const [tasas, setTasas] = useState([])
    const [cargando, setCargando] = useState(true)

    // Guardamos las creadas/editadas para simplificar
    // Para el drag and drop se requerirá una librería como dnd-kit o simple html5, 
    // por ahora implementaremos el listado con reorden visual básico vía botones o index.

    const cargar = async () => {
        try {
            const res = await api.get('/tasas')
            setTasas(res.data?.tasas || [])
        } catch (e) { console.error(e); setTasas([]) }
        finally { setCargando(false) }
    }

    useEffect(() => { cargar() }, [])

    const moveUp = async (index) => {
        if (index === 0) return
        const arr = [...tasas]
        const temp = arr[index - 1]
        arr[index - 1] = arr[index]
        arr[index] = temp
        setTasas(arr)
        await resyncOrder(arr)
    }

    const moveDown = async (index) => {
        if (index === tasas.length - 1) return
        const arr = [...tasas]
        const temp = arr[index + 1]
        arr[index + 1] = arr[index]
        arr[index] = temp
        setTasas(arr)
        await resyncOrder(arr)
    }

    const resyncOrder = async (arr) => {
        try {
            const data = arr.map((t, idx) => ({ id: t.id, orden_en_tabla: idx + 1 }))
            await api.post('/tasas/reordenar', data)
        } catch (e) { console.error('Error reordenando', e) }
    }

    const [modalOpen, setModalOpen] = useState(false)
    const [tasaEditar, setTasaEditar] = useState(null)

    const saveTasa = async (data) => {
        try {
            if (tasaEditar) {
                await api.put(`/tasas/${tasaEditar.id}`, data)
            } else {
                await api.post('/tasas', data)
            }
            setModalOpen(false)
            setTasaEditar(null)
            cargar()
        } catch (e) {
            toast.error(e.response?.data?.error || 'Error al guardar')
        }
    }

    const [confirmEliminarId, setConfirmEliminarId] = useState(null)

    const deleteTasa = async (id) => {
        try {
            await api.delete(`/tasas/${id}`)
            setConfirmEliminarId(null)
            cargar()
        } catch (e) {
            toast.error(e.response?.data?.error || 'Error al eliminar')
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-wide">Creador Libre de Tasas</h1>
                    <p className="text-[var(--texto-3)] text-sm mt-1">Configura conceptos, porcentajes exactos y su aplicación.</p>
                </div>
                <button
                    onClick={() => { setTasaEditar(null); setModalOpen(true); }}
                    className="bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-[0_0_15px_rgba(79,209,197,0.3)] flex items-center gap-2"
                >
                    <Plus size={18} />
                    <span>Nueva Tasa Libre</span>
                </button>
            </div>

            <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-6 shadow-xl">
                <div className="space-y-3">
                    {cargando ? <p className="text-[var(--texto-3)]">Cargando tasas...</p> :
                        tasas.length === 0 ? <p className="text-[var(--texto-3)]">No hay tasas creadas.</p> :
                            tasas.map((t, index) => (
                                <div key={t.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(79,209,197,0.05)] hover:border-[rgba(79,209,197,0.2)] transition-all group">

                                    <div className="flex items-center gap-4 mb-4 md:mb-0">
                                        <div className="flex flex-col gap-1 text-[var(--texto-3)]">
                                            <button onClick={() => moveUp(index)} className="hover:text-white disabled:opacity-30" disabled={index === 0}>▲</button>
                                            <button onClick={() => moveDown(index)} className="hover:text-white disabled:opacity-30" disabled={index === tasas.length - 1}>▼</button>
                                        </div>

                                        <div>
                                            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-3">
                                                {t.nombre}
                                                {t.es_cargo_unico && <span className="text-[10px] bg-[rgba(255,176,32,0.15)] text-[#FFB020] px-2 py-0.5 rounded border border-[#FFB020]/30 uppercase tracking-wider">Cargo Único</span>}
                                                {t.es_tasa_mora && <span className="text-[10px] bg-[rgba(244,63,94,0.15)] text-[#F43F5E] px-2 py-0.5 rounded border border-[#F43F5E]/30 uppercase tracking-wider">Mora</span>}
                                            </h3>
                                            <div className="flex items-center gap-4 text-xs text-[var(--texto-3)] font-mono">
                                                <span>Cálculo: <b className="text-[#4FD1C5]">{t.tipo_calculo.replace(/_/g, ' ')}</b></span>
                                                <span>•</span>
                                                <span>Aplica sobre: <b className="text-[var(--texto-2)]">{t.aplica_sobre.replace(/_/g, ' ')}</b></span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-6 border-t border-[rgba(255,255,255,0.05)] md:border-transparent pt-4 md:pt-0">
                                        <div className="text-right">
                                            <p className="text-[var(--texto-3)] text-xs uppercase tracking-wider">Valor exacto</p>
                                            <p className="text-xl font-bold text-[#4FD1C5]">
                                                {t.tipo_calculo === 'monto_fijo' ? `$${Number(t.valor_fijo).toLocaleString()}` : `${Number(t.valor_porcentaje).toFixed(4)}%`}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setTasaEditar(t); setModalOpen(true); }} className="p-2 text-[var(--texto-3)] hover:text-[#4FD1C5] hover:bg-[rgba(79,209,197,0.1)] rounded-lg transition-colors">
                                                <Save size={18} />
                                            </button>
                                            <button onClick={() => setConfirmEliminarId(t.id)} className="p-2 text-[var(--texto-3)] hover:text-[#F43F5E] hover:bg-[rgba(244,63,94,0.1)] rounded-lg transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                </div>
                            ))}
                </div>
            </div>

            {modalOpen && (
                <ModalTasa
                    tasa={tasaEditar}
                    onClose={() => setModalOpen(false)}
                    onSave={saveTasa}
                />
            )}

            {confirmEliminarId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={24} className="text-red-500" />
                        </div>
                        <h3 className="text-white font-bold text-lg text-center mb-2">¿Eliminar tasa?</h3>
                        <p className="text-[var(--texto-3)] text-sm text-center mb-6">Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmEliminarId(null)} className="flex-1 py-2.5 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all">Cancelar</button>
                            <button onClick={() => deleteTasa(confirmEliminarId)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ModalTasa({ tasa, onClose, onSave }) {
    const [formData, setFormData] = useState({
        nombre: tasa?.nombre || '',
        descripcion: tasa?.descripcion || '',
        tipo_calculo: tasa?.tipo_calculo || 'porcentaje_periodico',
        valor_porcentaje: tasa?.valor_porcentaje || 0,
        valor_fijo: tasa?.valor_fijo || 0,
        aplica_sobre: tasa?.aplica_sobre || 'capital_inicial',
        es_cargo_unico: tasa?.es_cargo_unico || false,
        es_tasa_mora: tasa?.es_tasa_mora || false,
        se_incluye_en_cuota: tasa?.se_incluye_en_cuota !== false
    })

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,32,0.8)] backdrop-blur-sm p-4">
            <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-lg rounded-3xl p-8 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white">✕</button>
                <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-widest">{tasa ? 'Editar Tasa' : 'Nueva Tasa'}</h2>

                <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4">
                    <div>
                        <label className="block text-[var(--texto-2)] text-xs font-bold uppercase mb-2">Nombre de la Tasa</label>
                        <input name="nombre" required value={formData.nombre} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white focus:border-[#4FD1C5]" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase mb-2">Tipo de Cálculo</label>
                            <select name="tipo_calculo" value={formData.tipo_calculo} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white">
                                <option value="porcentaje_periodico">Porcentaje Periódico</option>
                                <option value="monto_fijo">Monto Fijo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase mb-2">Aplica Sobre</label>
                            <select name="aplica_sobre" value={formData.aplica_sobre} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-white">
                                <option value="capital_inicial">Capital Inicial</option>
                                <option value="saldo_pendiente">Saldo Pendiente</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[var(--texto-2)] text-xs font-bold uppercase mb-2">
                            {formData.tipo_calculo === 'monto_fijo' ? 'Valor Fijo ($)' : 'Valor Porcentaje (%)'}
                        </label>
                        <input
                            type="number"
                            step="0.0001"
                            name={formData.tipo_calculo === 'monto_fijo' ? 'valor_fijo' : 'valor_porcentaje'}
                            value={formData.tipo_calculo === 'monto_fijo' ? formData.valor_fijo : formData.valor_porcentaje}
                            onChange={handleChange}
                            className="w-full bg-[rgba(79,209,197,0.05)] border border-[#4FD1C5]/30 rounded-xl px-4 py-3 text-[#4FD1C5] font-bold"
                        />
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" name="es_cargo_unico" checked={formData.es_cargo_unico} onChange={handleChange} />
                            <span className="text-sm text-white">Es Cargo Único (Solo una vez)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" name="es_tasa_mora" checked={formData.es_tasa_mora} onChange={handleChange} />
                            <span className="text-sm text-white">Es Tasa de Mora</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button type="button" onClick={onClose} className="px-6 py-2 text-[var(--texto-3)]">Cancelar</button>
                        <button type="submit" className="bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] text-white font-bold py-2 px-8 rounded-xl shadow-lg hover:from-[#38B2AC] hover:to-[#2C7A7B] transition-all">GUARDAR</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

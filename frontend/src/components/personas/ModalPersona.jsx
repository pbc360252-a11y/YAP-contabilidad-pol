import React, { useEffect, useState } from 'react'
import { Edit2, X } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Loader } from '../ui/Loader'

export function ModalPersona({ persona, onClose, onNewLoan }) {
    const [empresas, setEmpresas] = useState([])
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        primer_nombre: persona?.primer_nombre || '',
        segundo_nombre: persona?.segundo_nombre || '',
        primer_apellido: persona?.primer_apellido || '',
        segundo_apellido: persona?.segundo_apellido || '',
        cedula: persona?.cedula || '',
        telefono: persona?.telefono || '',
        telefono2: persona?.telefono2 || '',
        celular: persona?.celular || '',
        correo: persona?.correo || '',
        empresa_id: persona?.empresa_id || '',
        nueva_empresa_nombre: '',
        cargo: persona?.cargo || '',
        monto_requerido: persona?.monto_requerido || '',
        observaciones: persona?.observaciones || ''
    })
    const [esEmpresaManual, setEsEmpresaManual] = useState(false)

    const [createdPersona, setCreatedPersona] = useState(null)

    useEffect(() => {
        api.get('/empresas')
            .then(res => setEmpresas(res.data.empresas || []))
            .catch(console.error)
    }, [])

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const guardar = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            let empresaIdFinal = formData.empresa_id

            if (esEmpresaManual && formData.nueva_empresa_nombre) {
                const resEmp = await api.post('/empresas', { nombre: formData.nueva_empresa_nombre })
                empresaIdFinal = resEmp.data.empresa.id
            }

            const validFields = [
                'primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido',
                'cedula', 'telefono', 'telefono2', 'celular', 'correo', 'cargo', 'monto_requerido', 'observaciones'
            ]

            const prunedPayload = {
                empresa_id: empresaIdFinal
            }

            validFields.forEach(field => {
                if (formData[field] !== undefined && formData[field] !== '') {
                    if (field === 'monto_requerido') {
                        prunedPayload[field] = parseFloat(formData[field])
                    } else {
                        prunedPayload[field] = formData[field]
                    }
                }
            })

            if (persona) {
                await api.put(`/personas/${persona.id}`, prunedPayload)
                toast.success('Información actualizada correctamente')
                onClose()
            } else {
                const resPers = await api.post('/personas', prunedPayload)
                const newPersona = resPers.data.persona
                setCreatedPersona(newPersona)
            }
        } catch (error) {
            console.error(error)
            toast.error(error.response?.data?.error || 'Error al guardar el registro')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(6,12,26,0.85)] backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
            {loading && <Loader overlay message="Guardando Persona..." />}
            
            {createdPersona && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="bg-[var(--fondo-card)] border border-[var(--borde)] rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl text-center relative">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-500">
                            ✓
                        </div>
                        <h3 className="text-white font-bold text-xl mb-2">Persona creada exitosamente</h3>
                        <p className="text-[var(--texto-3)] text-sm mb-6">¿Desea continuar con el préstamo para <strong className="text-white">{createdPersona.primer_nombre} {createdPersona.primer_apellido}</strong>?</p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => {
                                onClose(createdPersona.id)
                            }} className="flex-1 py-3 border border-[var(--borde)] text-[var(--texto-3)] hover:text-white rounded-xl font-bold transition-all text-sm uppercase tracking-wider">No, salir</button>
                            <button type="button" onClick={() => {
                                onClose(createdPersona.id)
                                if (onNewLoan) onNewLoan(createdPersona.id)
                            }} className="flex-1 py-3 bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] text-white rounded-xl font-bold transition-all shadow-lg text-sm uppercase tracking-wider">Sí, continuar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[var(--fondo-base)] border border-[var(--borde)] w-full max-w-3xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col my-auto relative p-8">
                <button onClick={() => onClose()} className="absolute top-4 right-4 text-[var(--texto-3)] hover:text-white transition-colors bg-[rgba(255,255,255,0.05)] p-2 rounded-full">
                    <X size={18} />
                </button>
                <h2 className="text-2xl font-bold text-[var(--texto-1)] mb-6 font-syne flex items-center gap-3">
                    <Edit2 className="text-[#00D4FF]" />
                    {persona ? 'Editar Persona' : 'Nueva Persona'}
                </h2>

                <form onSubmit={guardar} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Primer Nombre *</label>
                            <input name="primer_nombre" required value={formData.primer_nombre} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Segundo Nombre</label>
                            <input name="segundo_nombre" value={formData.segundo_nombre} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Primer Apellido *</label>
                            <input name="primer_apellido" required value={formData.primer_apellido} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Segundo Apellido</label>
                            <input name="segundo_apellido" value={formData.segundo_apellido} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Cédula *</label>
                            <input name="cedula" required value={formData.cedula} onChange={handleChange} className="w-full bg-[rgba(26,111,255,0.05)] border border-[#1A6FFF]/30 rounded-xl px-4 py-3 text-[#00D4FF] font-bold focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Celular *</label>
                            <input name="celular" required value={formData.celular} onChange={handleChange} className="w-full bg-[rgba(0,212,255,0.05)] border border-[#00D4FF]/30 rounded-xl px-4 py-3 text-[#00D4FF] font-bold focus:border-[#00D4FF] focus:outline-none" placeholder="Ej: 3001234567" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Teléfono Principal</label>
                            <input name="telefono" value={formData.telefono} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Monto Requerido ($) *</label>
                            <input type="number" step="0.01" name="monto_requerido" required value={formData.monto_requerido} onChange={handleChange} className="w-full bg-[rgba(16,185,129,0.05)] border border-[#10B981]/30 rounded-xl px-4 py-3 text-[#10B981] font-bold focus:border-[#10B981] focus:outline-none" placeholder="Ej: 1500000" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider">Empresa *</label>
                                <button
                                    type="button"
                                    onClick={() => setEsEmpresaManual(!esEmpresaManual)}
                                    className="text-[10px] text-[#00D4FF] hover:underline uppercase font-bold"
                                >
                                    {esEmpresaManual ? 'Ver Lista' : '+ Nueva'}
                                </button>
                            </div>

                            {esEmpresaManual ? (
                                <input
                                    name="nueva_empresa_nombre"
                                    required
                                    placeholder="Nombre de la nueva empresa..."
                                    value={formData.nueva_empresa_nombre}
                                    onChange={handleChange}
                                    className="w-full bg-[rgba(0,212,255,0.05)] border border-[#00D4FF]/30 rounded-xl px-4 py-3 text-[#00D4FF] font-bold focus:border-[#00D4FF] focus:outline-none"
                                />
                            ) : (
                                <select
                                    name="empresa_id"
                                    required
                                    value={formData.empresa_id}
                                    onChange={handleChange}
                                    className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none"
                                >
                                    <option value="">Seleccione empresa...</option>
                                    {empresas.map(e => <option key={e.id} value={e.id} className="text-black">{e.nombre}</option>)}
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Cargo</label>
                            <input name="cargo" value={formData.cargo} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Correo Electrónico</label>
                            <input name="correo" type="email" value={formData.correo} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[var(--texto-2)] text-xs font-bold uppercase tracking-wider mb-2">Observaciones</label>
                            <textarea name="observaciones" rows="1" value={formData.observaciones} onChange={handleChange} className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl px-4 py-3 text-[var(--texto-1)] focus:border-[#1A6FFF] focus:outline-none"></textarea>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-4 pt-6 border-t border-[var(--borde)]">
                        <button type="button" onClick={() => onClose()} className="px-6 py-3 rounded-xl border border-[var(--borde)] hover:bg-[var(--fondo-card-alt)] text-[var(--texto-2)] font-bold transition-all">Cancelar</button>
                        <button type="submit" disabled={loading} className="bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] disabled:opacity-50 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30_rgba(16,185,129,0.6)] uppercase tracking-widest text-sm">
                            {loading ? 'Guardando...' : 'GUARDAR REGISTRO'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

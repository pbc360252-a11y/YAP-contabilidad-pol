import React, { useState, useEffect } from 'react'
import { FileText, Download, Search, Printer, Loader2, FileSpreadsheet } from 'lucide-react'
import api from '../utils/api'
import { formatCOP, formatCOPCorto } from '../utils/formatCOP'
import { QuickPrint } from '../components/ui/QuickPrint'
import { GenericReportPDF } from '../components/ui/GenericReportPDF'
import { formatFechaCorta } from '../utils/formatFecha'
import { exportToExcel } from '../utils/exportExcel'
import toast from 'react-hot-toast'

export function Informes() {
    const [prestamos, setPrestamos] = useState([])
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState('')
    const [prestamoFull, setPrestamoFull] = useState(null)
    const [filtro, setFiltro] = useState('')
    const [loading, setLoading] = useState(false)
    const [cargandoLista, setCargandoLista] = useState(true)
    const [cargandoFull, setCargandoFull] = useState(false)

    useEffect(() => {
        if (prestamoSeleccionado) {
            setCargandoFull(true)
            api.get(`/prestamos/${prestamoSeleccionado}`)
                .then(res => setPrestamoFull(res.data.prestamo))
                .catch(console.error)
                .finally(() => setCargandoFull(false))
        } else {
            setPrestamoFull(null)
        }
    }, [prestamoSeleccionado])

    useEffect(() => {
        api.get('/prestamos')
            .then(res => setPrestamos(res.data.prestamos || []))
            .catch(console.error)
            .finally(() => setCargandoLista(false))
    }, [])

    const prestamosFiltrados = prestamos.filter(p => {
        const nombre = `${p.persona?.primer_nombre} ${p.persona?.primer_apellido}`.toLowerCase()
        const cedula = p.persona?.cedula || ''
        const tipo = p.tipo?.nombre?.toLowerCase() || ''
        return nombre.includes(filtro.toLowerCase()) || cedula.includes(filtro) || tipo.includes(filtro.toLowerCase())
    })

    const generar = async () => {
        if (!prestamoSeleccionado) return
        setLoading(true)
        try {
            const res = await api.post(`/informes/generar-extracto/${prestamoSeleccionado}`)
            const { htmlContent, correo, url } = res.data

            // Si el backend devuelve el HTML, abrirlo en nueva pestaña para imprimir
            if (htmlContent) {
                const ventana = window.open('', '_blank')
                if (ventana) {
                    ventana.document.write(htmlContent)
                    ventana.document.close()
                } else {
                    toast.error('⚠️ El navegador bloqueó la apertura de la ventana. Permite pop-ups para este sitio.')
                }
            } else if (url) {
                window.open(url, '_blank')
            }

            // Mostrar estado del correo con toast suave
            const msgCorreo = correo === 'Enviado al cliente'
                ? '✅ Correo enviado al cliente'
                : correo?.includes('Sin correo') ? '⚠️ El cliente no tiene correo registrado' : `📋 ${correo}`
            if (import.meta.env.DEV) console.log('[Informes]', msgCorreo)
            if (msgCorreo.startsWith('✅')) {
                toast.success(msgCorreo.replace('✅ ', ''))
            } else if (msgCorreo.startsWith('⚠️')) {
                toast(msgCorreo.replace('⚠️ ', ''), { icon: '⚠️' })
            } else {
                toast(msgCorreo)
            }
        } catch (e) {
            toast.error('Error generando extracto: ' + (e.response?.data?.error || e.message))
        } finally {
            setLoading(false)
        }
    }

    const prestSelec = prestamos.find(p => p.id === prestamoSeleccionado)

    return (
        <div className="space-y-6">
            {loading && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0b1120] border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                        <Loader2 className="animate-spin text-[#4FD1C5]" size={40} />
                        <p className="text-white font-bold text-sm uppercase tracking-widest">Generando Extracto...</p>
                    </div>
                </div>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3 tracking-wide">
                        <FileText className="text-[var(--cyan)]" /> Generación de Extractos y PDFs
                    </h1>
                    <p className="text-[var(--texto-3)] text-sm mt-1">Selecciona un préstamo para generar el estado de cuenta. Se abre en nueva pestaña listo para imprimir o guardar como PDF.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel de Selección */}
                <div className="bg-[var(--fondo-card)] p-6 rounded-2xl border border-[var(--borde)] shadow-xl">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">1. Seleccionar Préstamo</h2>

                    <div className="relative mb-4">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
                        <input
                            value={filtro}
                            onChange={e => setFiltro(e.target.value)}
                            placeholder="Buscar por nombre, cédula o tipo..."
                            className="w-full bg-[var(--fondo-input)] border border-[var(--borde)] rounded-xl py-2 pl-9 pr-4 text-sm text-[var(--texto-1)] focus:border-[var(--cyan)] focus:outline-none"
                        />
                    </div>

                    {cargandoLista ? (
                        <p className="text-[var(--texto-3)] text-sm text-center py-4 italic animate-pulse">Cargando préstamos...</p>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                            {prestamosFiltrados.length === 0 ? (
                                <p className="text-[var(--texto-3)] text-sm text-center py-4">No se encontraron préstamos.</p>
                            ) : (
                                prestamosFiltrados.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setPrestamoSeleccionado(p.id)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all ${prestamoSeleccionado === p.id
                                            ? 'border-[#4FD1C5] bg-[rgba(79,209,197,0.08)] shadow-[0_0_12px_rgba(79,209,197,0.2)]'
                                            : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-sm font-bold text-white">{p.persona?.primer_nombre} {p.persona?.primer_apellido}</p>
                                                <p className="text-xs text-[var(--texto-3)]">{p.tipo?.nombre} · CC: {p.persona?.cedula}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-[#4FD1C5]">{formatCOPCorto(p.total_a_pagar)}</p>
                                                <div className="mt-1">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.estado === 'activo' ? 'bg-green-500/20 text-green-400' : p.estado === 'en_mora' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                        {p.estado}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Panel de Acción */}
                <div className="bg-[var(--fondo-card)] p-6 rounded-2xl border border-[var(--borde)] shadow-xl flex flex-col min-h-[400px]">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">2. Generar Extracto — PDF o Excel</h2>

                    {!prestSelec ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                            <FileText size={48} className="text-[var(--cyan)] mb-3" />
                            <p className="text-[var(--texto-2)] text-sm">Selecciona un préstamo de la lista para continuar</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col">
                            <div className="bg-gradient-to-br from-[rgba(0,212,255,0.05)] to-[rgba(26,111,255,0.05)] border border-[#00D4FF]/20 rounded-xl p-5 mb-6">
                                <p className="text-xs text-[var(--texto-3)] uppercase tracking-wider mb-1">Préstamo seleccionado</p>
                                <p className="text-lg font-bold text-white">{prestSelec?.persona?.primer_nombre} {prestSelec?.persona?.primer_apellido}</p>
                                <p className="text-sm text-[var(--texto-2)] mt-1">{prestSelec?.tipo?.nombre}</p>
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <p className="text-xs text-[var(--texto-3)]">Capital</p>
                                        <p className="text-sm font-bold text-white">{formatCOP(prestSelec?.monto_otorgado || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--texto-3)]">Total a Pagar</p>
                                        <p className="text-sm font-bold text-[#4FD1C5]">{formatCOP(prestSelec?.total_a_pagar || 0)}</p>
                                    </div>
                                </div>
                            </div>
                            {/* ── Botones de acción ─────────────────────────── */}
                            <div className="grid grid-cols-1 gap-3 mt-auto">

                                {/* Fila 1: Guardar en sistema */}
                                <button
                                    onClick={generar}
                                    disabled={loading}
                                    className="bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] hover:from-[#38B2AC] hover:to-[#2C7A7B] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(79,209,197,0.3)] flex items-center justify-center gap-2 transition-all text-xs"
                                >
                                    <Printer size={16} />
                                    <span>{loading ? 'Generando...' : '📄 Abrir Extracto (Imprimir / PDF)'}</span>
                                </button>

                                {/* Fila 2: PDF + Excel */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Imprimir PDF */}
                                    <QuickPrint
                                        component={GenericReportPDF}
                                        props={{
                                            title: "Extracto de Cuenta YAP",
                                            subtitle: `Estado de cuenta de ${prestSelec?.persona?.primer_nombre || ''} ${prestSelec?.persona?.primer_apellido || ''}`,
                                            infoRows: [
                                                { label: "Cédula", value: prestSelec?.persona?.cedula || 'N/A' },
                                                { label: "Monto Otorgado", value: formatCOP(prestSelec?.monto_otorgado || 0) },
                                                { label: "Total Proyectado", value: formatCOP(prestSelec?.total_a_pagar || 0) },
                                                { label: "Estado Actual", value: (prestSelec?.estado || "N/A").toUpperCase() }
                                            ],
                                            tableHeaders: [
                                                { label: "N° Cuota", align: "text-center" },
                                                { label: "Vencimiento", align: "text-center" },
                                                { label: "Valor Cuota", align: "text-right" }
                                            ],
                                            tableRows: (prestamoFull?.cuotas || []).map(c => [
                                                { value: c.numero_cuota },
                                                { value: formatFechaCorta(c.fecha_programada) },
                                                { value: formatCOP(c.cuota_total) }
                                            ]),
                                            footerText: cargandoFull ? "CARGANDO DATOS..." : (prestamoFull ? "HISTORIAL DE MOVIMIENTOS Y SALDOS YAP." : "SIN DATOS DE AMORTIZACIÓN")
                                        }}
                                        className="h-full w-full py-3 text-xs"
                                        trigger={
                                            <button
                                                disabled={cargandoFull || !prestamoFull}
                                                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl border border-white/20 transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50 w-full"
                                            >
                                                <Printer size={16} />
                                                <span>{cargandoFull ? 'Cargando...' : 'Imprimir PDF'}</span>
                                            </button>
                                        }
                                    />

                                    {/* Exportar Excel */}
                                    <button
                                        disabled={cargandoFull || !prestamoFull}
                                        onClick={() => exportToExcel({
                                            title: 'Extracto de Cuenta YAP',
                                            subtitle: `Estado de cuenta de ${prestSelec?.persona?.primer_nombre || ''} ${prestSelec?.persona?.primer_apellido || ''}`,
                                            infoRows: [
                                                { label: 'Cédula', value: prestSelec?.persona?.cedula || 'N/A' },
                                                { label: 'Monto Otorgado', value: formatCOP(prestSelec?.monto_otorgado || 0) },
                                                { label: 'Total Proyectado', value: formatCOP(prestSelec?.total_a_pagar || 0) },
                                                { label: 'Estado Actual', value: (prestSelec?.estado || 'N/A').toUpperCase() }
                                            ],
                                            tableHeaders: [
                                                { label: 'N° Cuota' },
                                                { label: 'Vencimiento' },
                                                { label: 'Valor Cuota' }
                                            ],
                                            tableRows: (prestamoFull?.cuotas || []).map(c => [
                                                { value: c.numero_cuota },
                                                { value: formatFechaCorta(c.fecha_programada) },
                                                { value: formatCOP(c.cuota_total) }
                                            ]),
                                            footerText: prestamoFull ? 'HISTORIAL DE MOVIMIENTOS Y SALDOS YAP.' : 'SIN DATOS DE AMORTIZACIÓN',
                                            fileName: `extracto_${prestSelec?.persona?.primer_apellido || 'cliente'}_${prestSelec?.persona?.cedula || ''}`
                                        })}
                                        className="bg-gradient-to-r from-[#22a85a] to-[#1a8c48] hover:from-[#1a8c48] hover:to-[#14703a] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(34,168,90,0.3)] flex items-center justify-center gap-2 transition-all text-xs"
                                    >
                                        <FileSpreadsheet size={16} />
                                        <span>{cargandoFull ? 'Cargando...' : 'Exportar Excel'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

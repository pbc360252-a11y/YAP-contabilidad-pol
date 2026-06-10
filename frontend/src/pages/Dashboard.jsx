import React, { useEffect, useState } from 'react'
import { KPICard } from '../components/ui/KPICard'
import { BadgeEstado } from '../components/ui/BadgeEstado'
import { Users, Briefcase, TrendingUp, ChevronRight, Printer, FileSpreadsheet } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { formatCOP, formatCOPCorto } from '../utils/formatCOP'
import { formatFechaCorta } from '../utils/formatFecha'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { RadialGaugeChart } from '../components/charts/RadialGaugeChart'
import { RadarMetrics } from '../components/charts/RadarMetrics'
import { useNavigate } from 'react-router-dom'
import { QuickPrint } from '../components/ui/QuickPrint'
import { GenericReportPDF } from '../components/ui/GenericReportPDF'
import { AmortizacionPDF } from '../components/prestamos/AmortizacionPDF'
import { AmortizacionMasivaPDF } from '../components/prestamos/AmortizacionMasivaPDF'
import { useRef, useMemo } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useStore } from '../store/useStore'
import { exportToExcel } from '../utils/exportExcel'

export function Dashboard() {
    const { vistaPremium, usuario } = useStore()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        usuarios: 0, prestamosActivos: 0, totalCartera: 0, cuotasEnMora: 0, totalRecuperado: 0
    })
    const [ultimosPrestamos, setUltimosPrestamos] = useState([])
    const [todosLosPrestamos, setTodosLosPrestamos] = useState([])
    const [proximasCuotas, setProximasCuotas] = useState([])
    const [dataEvolucion, setDataEvolucion] = useState([])
    const [dataRadar, setDataRadar] = useState([])
    const [prestamoParaAmortizar, setPrestamoParaAmortizar] = useState(null)
    const [loadingPrint, setLoadingPrint] = useState(false)
    const [prestamosMasivos, setPrestamosMasivos] = useState([])
    const amortizacionPrintRef = useRef()
    const amortizacionMasivaPrintRef = useRef()

    const handlePrintAmortizacion = useReactToPrint({
        contentRef: amortizacionPrintRef,
        documentTitle: `AMORT-${prestamoParaAmortizar?.id?.slice(0, 8) || 'DOC'}`,
    })

    const handlePrintMasiva = useReactToPrint({
        contentRef: amortizacionMasivaPrintRef,
        documentTitle: `REPORTE-MASIVO-CARTERA`,
        onAfterPrint: () => { setLoadingPrint(false) },
        onBeforeGetContent: () => {
            return new Promise((resolve) => setTimeout(resolve, 500));
        }
    })

    const pctSalud = (stats.totalRecuperado + stats.totalCartera) > 0
        ? Math.round((stats.totalRecuperado / (stats.totalRecuperado + stats.totalCartera)) * 100)
        : 0;

    const pdfConsolidadoProps = useMemo(() => ({
        title: "Resumen Ejecutivo de Cartera",
        subtitle: "Métricas Consolidadas de Gestión YAP",
        infoRows: [
            { label: "Cartera Pendiente", value: formatCOP(stats.totalCartera) },
            { label: "Total Recuperado", value: formatCOP(stats.totalRecuperado) },
            { label: "Clientes Activos", value: stats.usuarios },
            { label: "Cuotas en Mora", value: stats.cuotasEnMora }
        ],
        tableHeaders: [
            { label: "OBLIGACIÓN", align: "text-left" },
            { label: "CLIENTE", align: "text-left" },
            { label: "CÉDULA" },
            { label: "LÍNEA CRÉDITO" },
            { label: "TASA E.A." },
            { label: "DÍAS M." },
            { label: "MONTO CRÉDITO", align: "text-right" },
            { label: "SALDO CAPITAL", align: "text-right" },
            { label: "TOTAL PAGARE", align: "text-right" },
            { label: "ESTADO" }
        ],
        tableRows: (todosLosPrestamos || []).map((p) => {
            const tasaNominal = (p.tasas_aplicadas?.find(t => t.nombre_snapshot.toLowerCase().includes('interés'))?.valor_snapshot || 0).toFixed(2);
            return [
                { value: p?.codigo || '-', style: 'font-mono' },
                { value: `${p?.persona?.primer_nombre || ''} ${p?.persona?.primer_apellido || ''}`.trim().toUpperCase().substring(0, 18) || 'S/N', align: "text-left" },
                { value: p?.persona?.cedula || 'N/A', style: 'font-mono' },
                { value: p?.tipo?.nombre?.substring(0, 12)?.toUpperCase() || 'CONSUMO' },
                { value: `${p?.tasa_efectiva_total || 0}%`, style: 'font-mono' },
                { value: p?.dias_mora > 0 ? p.dias_mora : 0, textStyle: p?.dias_mora > 0 ? "text-red-700 font-bold" : "" },
                { value: formatCOP(p?.monto_otorgado), style: 'font-mono' },
                { value: formatCOP(p?.total_capital), style: 'font-mono text-green-700' },
                { value: formatCOP(p?.total_a_pagar), style: 'font-mono text-blue-800 font-bold' },
                { value: (p?.estado || '').toUpperCase(), textStyle: p?.estado === 'cancelado' ? 'text-gray-400' : 'text-black' }
            ]
        }),
        footerText: `SALUD FINANCIERA DEL SISTEMA: ${pctSalud || 0}%`
    }), [stats, todosLosPrestamos, pctSalud])

    const imprimirAmortizacion = async (prestamoId) => {
        try {
            const res = await api.get(`/prestamos/${prestamoId}`)
            setPrestamoParaAmortizar(res.data.prestamo)
            setTimeout(() => {
                handlePrintAmortizacion()
            }, 500)
        } catch (error) {
            console.error(error)
            toast.error("Error al cargar datos de amortización")
        }
    }

    const imprimirMasivo = async () => {
        try {
            setLoadingPrint(true)
            toast.loading("Generando y recopilando reporte masivo (esto puede tardar unos segundos)...", { id: 'print-masivo' })
            const res = await api.get('/prestamos/todos/detallados')
            setPrestamosMasivos(res.data.prestamos)
            setTimeout(() => {
                toast.dismiss('print-masivo')
                handlePrintMasiva()
            }, 1000)
        } catch (error) {
            console.error(error)
            toast.error("Error al generar el PDF masivo", { id: 'print-masivo' })
            setLoadingPrint(false)
        }
    }

    const [loadingExcel, setLoadingExcel] = useState(false)

    const exportarMasivoExcel = async () => {
        try {
            setLoadingExcel(true)
            toast.loading("Generando y descargando reporte de Excel...", { id: 'export-excel' })
            
            // 1. Obtener todos los préstamos detallados
            const res = await api.get('/prestamos/todos/detallados')
            const prestamosList = res.data?.prestamos || []

            if (prestamosList.length === 0) {
                toast.dismiss('export-excel')
                toast.error("No hay préstamos para exportar")
                setLoadingExcel(false)
                return
            }

            // 2. Mapear al mismo formato usado en pdfConsolidadoProps
            const headers = pdfConsolidadoProps.tableHeaders
            const rows = prestamosList.map((p) => {
                return [
                    { value: p?.codigo || '-' },
                    { value: `${p?.persona?.primer_nombre || ''} ${p?.persona?.primer_apellido || ''}`.trim().toUpperCase() || 'S/N' },
                    { value: p?.persona?.cedula || 'N/A' },
                    { value: p?.tipo?.nombre?.toUpperCase() || 'CONSUMO' },
                    { value: `${p?.tasa_efectiva_total || 0}%` },
                    { value: p?.dias_mora > 0 ? p.dias_mora : 0 },
                    { value: formatCOP(p?.monto_otorgado) },
                    { value: formatCOP(p?.total_capital) },
                    { value: formatCOP(p?.total_a_pagar) },
                    { value: (p?.estado || '').toUpperCase() }
                ]
            })

            // 3. Invocar exportToExcel
            exportToExcel({
                title: pdfConsolidadoProps.title,
                subtitle: pdfConsolidadoProps.subtitle,
                infoRows: pdfConsolidadoProps.infoRows,
                tableHeaders: headers,
                tableRows: rows,
                footerText: pdfConsolidadoProps.footerText,
                fileName: `YAP-Consolidado-Cartera-${new Date().toISOString().split('T')[0]}`
            })

            toast.success("Excel descargado correctamente", { id: 'export-excel' })
        } catch (error) {
            console.error(error)
            toast.error("Error al exportar a Excel", { id: 'export-excel' })
        } finally {
            setLoadingExcel(false)
        }
    }

    const cargar = async (isSilent = false) => {
        if (!isSilent) setLoading(true)
        try {
            const [statsRes, prestamosRes, cuotasRes] = await Promise.all([
                api.get('/stats'),
                api.get('/prestamos'),
                api.get('/cuotas/proximas')
            ])

            const realStats = statsRes?.data?.stats || { usuarios: 0, prestamosActivos: 0, totalCartera: 0, cuotasEnMora: 0, totalRecuperado: 0 }
            const realEvo = statsRes?.data?.dataEvolucion || []
            const realRadar = statsRes?.data?.dataRadar || []
            const prestamos = prestamosRes?.data?.prestamos || []
            const cuotas = cuotasRes?.data?.cuotas || []

            setStats(realStats)
            setUltimosPrestamos(prestamos.slice(0, 5))
            setTodosLosPrestamos(prestamos)
            setProximasCuotas(cuotas.slice(0, 5))
            setDataEvolucion(realEvo)
            setDataRadar(realRadar)
        } catch (error) {
            console.error("Error cargando dashboard", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        cargar()
        const interval = setInterval(() => cargar(true), 30000) // Poll every 30s
        return () => clearInterval(interval)
    }, [usuario])

    const predominancia = (dataRadar || []).length > 0
        ? (dataRadar.reduce((prev, current) => ((prev?.A || 0) > (current?.A || 0)) ? prev : current)?.subject || '...')
        : '...';

    const healthData = [
        { name: 'Rendimiento', value: pctSalud > 0 ? pctSalud : 0, fill: '#00D4FF' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-[var(--borde)] rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-[#4FD1C5] border-t-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="w-2 h-2 bg-[#4FD1C5] rounded-full animate-ping"></span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-fade-in relative pb-10">

            {/* Background Orbs */}
            <div className={`fixed top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full -z-10 animate-pulse-glow ${vistaPremium ? 'bg-[#1A6FFF]/5' : 'bg-[#4FD1C5]/10'}`}></div>
            <div className={`fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full -z-10 animate-pulse-glow ${vistaPremium ? 'bg-[#00D4FF]/5' : 'bg-[#4FD1C5]/5'}`} style={{ animationDelay: '1.5s' }}></div>

            {/* Top Stat Bar - Pill shaped */}
            <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-col">
                    <h1 className="text-4xl font-black text-[var(--texto-1)] font-syne tracking-tighter neural-glow uppercase">YAP Intelligence Dashboard</h1>
                    <div className="mt-1 flex items-center gap-4">
                        <p className="text-[10px] text-[var(--texto-3)] uppercase tracking-[0.25em] font-black tactical-badge">
                            Status: Sistema Operativo
                        </p>
                        <div className="h-1 w-1 rounded-full bg-[var(--texto-3)]/30"></div>
                        <p className="text-[10px] text-[var(--cyan)] uppercase tracking-[0.25em] font-black animate-pulse">
                            Telemetría en tiempo real v2.5
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className={`rounded-full px-6 py-2 flex items-center gap-6 justify-center border ${
                        vistaPremium ? 'premium-glass border-white/10' : 'bg-white border-[var(--borde)] shadow-sm'
                    }`}>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-widest text-[var(--texto-3)] font-bold">Cartera</span>
                            <span className="font-syne text-sm font-bold text-[var(--texto-1)]">{formatCOPCorto(stats.totalCartera)}</span>
                        </div>
                        <div className="h-6 w-px bg-[var(--borde)]"></div>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-widest text-[#4FD1C5] font-bold">Recuperado</span>
                            <span className="font-syne text-sm font-bold text-[#4FD1C5]">{formatCOPCorto(stats.totalRecuperado)}</span>
                        </div>
                    </div>

                    <button
                        onClick={exportarMasivoExcel}
                        disabled={loadingExcel}
                        className={`h-[42px] px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            vistaPremium 
                            ? 'text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/35 shadow-lg shadow-emerald-500/10' 
                            : 'text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20'
                        }`}
                    >
                        <FileSpreadsheet size={16} />
                        {loadingExcel ? "EXPORTANDO..." : "EXPORTAR EXCEL"}
                    </button>

                    <button
                        onClick={imprimirMasivo}
                        disabled={loadingPrint}
                        className={`h-[42px] px-6 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            vistaPremium 
                            ? 'text-black bg-[#00D4FF] hover:bg-white' 
                            : 'text-white bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-500/20'
                        }`}
                    >
                        <Printer size={16} />
                        {loadingPrint ? "PROCESANDO..." : "REPORTES"}
                    </button>
                </div>
            </div>

            {/* Hero Section (Radar + Gauge + Kpis) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[480px]">

                {/* Left: Radar */}
                <div className={`lg:col-span-3 rounded-[40px] p-8 relative overflow-hidden flex flex-col items-center group transition-all duration-500 hover:shadow-xl ${
                    vistaPremium ? 'premium-glass border-white/5' : 'bg-white border-[var(--borde)] shadow-sm'
                }`}>
                    <h3 className="text-[10px] uppercase tracking-[0.3em] text-[var(--texto-3)] font-black absolute top-8 left-8 z-10 transition-colors group-hover:text-[var(--texto-1)]">Tipos de Cartera</h3>
                    <div className="w-full h-full transform transition-transform duration-700 group-hover:scale-110">
                        <RadarMetrics data={dataRadar} />
                    </div>
                    <div className={`absolute bottom-8 left-8 right-8 text-center backdrop-blur-md rounded-2xl py-3 border ${
                        vistaPremium ? 'bg-white/5 border-white/5' : 'bg-slate-50/50 border-[var(--borde)]'
                    }`}>
                        <p className="text-[9px] text-[var(--texto-3)] uppercase tracking-widest mb-1">Concentración Principal</p>
                        <p className="text-[#4FD1C5] font-black text-sm uppercase font-syne group-hover:scale-105 transition-transform">{predominancia}</p>
                    </div>
                </div>

                {/* Center: Massive Gauge */}
                <div className={`lg:col-span-6 rounded-[40px] p-8 flex flex-col relative overflow-hidden group transition-all duration-500 hover:shadow-2xl ${
                    vistaPremium ? 'premium-glass border-white/5' : 'bg-white border-[var(--borde)] shadow-sm'
                }`}>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] h-[40%] bg-[#4FD1C5]/5 blur-[120px] rounded-full pointer-events-none group-hover:bg-[#4FD1C5]/10 transition-colors"></div>

                    <div className="text-center z-10 mb-[-60px] relative">
                        <h2 className="text-sm font-black uppercase tracking-[0.4em] text-[var(--texto-3)] group-hover:text-[var(--texto-1)] transition-colors duration-500">Salud Financiera</h2>
                        <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-[#00D4FF]/30 to-transparent mx-auto mt-2"></div>
                    </div>

                    <div className="flex-1 w-full h-full min-h-[350px] relative z-0 mt-8">
                        <RadialGaugeChart data={healthData} title="Índice de Retorno" />
                    </div>

                    <button
                        onClick={() => navigate('/informes')}
                        className={`group/btn relative w-[60%] mx-auto mt-[-20px] z-20 py-4 rounded-full border transition-all duration-500 overflow-hidden ${
                            vistaPremium ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#00D4FF]/40' : 'bg-slate-50 border-[var(--borde)] hover:bg-white hover:border-[#4FD1C5]/40 hover:shadow-lg'
                        }`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#4FD1C5]/10 to-transparent translate-x-[-200%] group-hover/btn:translate-x-[200%] transition-transform duration-1000"></div>
                        <span className="relative text-[10px] font-black uppercase tracking-[0.3em] text-[var(--texto-3)] group-hover/btn:text-[#4FD1C5] flex items-center justify-center gap-3">
                            Ver Análisis Detallado <ChevronRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                        </span>
                    </button>
                </div>

                {/* Right: Evolucion y KPIS */}
                <div className="lg:col-span-3 flex flex-col gap-6 h-full">
                    <div className={`rounded-[40px] p-8 flex-1 relative group overflow-hidden transition-all duration-500 hover:shadow-xl ${
                        vistaPremium ? 'premium-glass border-white/5' : 'bg-white border-[var(--borde)] shadow-sm'
                    }`}>
                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <h3 className="text-[10px] uppercase tracking-[0.3em] text-[var(--texto-3)] font-black group-hover:text-[var(--texto-1)] transition-colors">Crecimiento</h3>
                            <span className="text-[9px] font-black text-[var(--cyan)] bg-[var(--cyan)]/10 px-3 py-1 rounded-full uppercase tracking-widest border border-[var(--cyan)]/20">↑ Trending</span>
                        </div>
                        <div className="h-[140px] w-full absolute bottom-4 left-0 right-0 px-2 transition-all duration-700 group-hover:translate-y-[-10px] group-hover:scale-105">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dataEvolucion}>
                                    <defs>
                                        <linearGradient id="colorEvo" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={vistaPremium ? '#1A6FFF' : '#4FD1C5'} stopOpacity={0.6} />
                                            <stop offset="95%" stopColor={vistaPremium ? '#1A6FFF' : '#4FD1C5'} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="capital" stroke={vistaPremium ? '#1A6FFF' : '#4FD1C5'} strokeWidth={3} fillOpacity={1} fill="url(#colorEvo)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <KPICard title="Clientes" value={stats.usuarios} icon={Users} color="blue" />
                        <div className="relative group">
                            <div className="absolute inset-0 bg-[#F43F5E]/10 blur-[20px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <KPICard title="Alertas" value={stats.cuotasEnMora} icon={AlertTriangle} color="rose" />
                        </div>
                    </div>
                </div>

            </div>

            {/* Bottom 3-Column Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Cuotas list (Immunity style) */}
                <div className={`rounded-[40px] p-8 md:col-span-1 relative group transition-all duration-500 hover:shadow-xl ${
                    vistaPremium ? 'premium-glass border-white/5' : 'bg-white border-[var(--borde)] shadow-sm'
                }`}>
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xs font-black text-[var(--texto-1)] uppercase tracking-[0.3em]">Operaciones Próximas</h3>
                        <div className={`w-2 h-2 rounded-full glow-blue animate-pulse ${vistaPremium ? 'bg-[#1A6FFF]' : 'bg-[#4FD1C5]'}`}></div>
                    </div>
                    <div className="space-y-4">
                        {proximasCuotas.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center opacity-40">
                                <Briefcase className="w-8 h-8 mb-2 text-[var(--texto-3)]" />
                                <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--texto-2)]">Cola vacía</p>
                            </div>
                        ) : (
                            proximasCuotas.map(cuota => (
                                <div key={cuota.id} className={`group/item flex justify-between items-center p-4 rounded-2xl border transition-all cursor-pointer ${
                                    vistaPremium ? 'bg-white/5 border-white/5 hover:bg-[#1A6FFF]/10 hover:border-[#1A6FFF]/30' : 'bg-slate-50 border-[var(--borde)] hover:bg-[#4FD1C5]/10 hover:border-[#4FD1C5]/30'
                                }`}>
                                    <div>
                                        <h4 className="text-xs font-black text-[var(--texto-1)] group-hover/item:text-[#4FD1C5] transition-colors">{cuota.persona?.primer_nombre} {cuota.persona?.primer_apellido}</h4>
                                        <p className="text-[9px] text-[var(--texto-3)] uppercase mt-1 tracking-widest">Expiration: {formatFechaCorta(cuota.fecha_programada)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-[var(--texto-1)] font-syne">{formatCOPCorto(cuota.cuota_total)}</p>
                                        <div className="mt-2 scale-75 origin-right"><BadgeEstado estado={cuota.estado} /></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Ultimos Prestamos Table */}
                <div className={`rounded-[40px] p-8 md:col-span-2 overflow-hidden flex flex-col group transition-all duration-500 hover:shadow-xl ${
                    vistaPremium ? 'premium-glass border-white/5' : 'bg-white border-[var(--borde)] shadow-sm'
                }`}>
                    <div className="flex justify-between items-center mb-8 px-2">
                        <h3 className="text-xs font-black text-[var(--texto-1)] uppercase tracking-[0.3em]">Flujo de Capital Reciente</h3>
                        <button
                            onClick={() => navigate('/prestamos')}
                            className="text-[9px] font-black text-[#4FD1C5] bg-[#4FD1C5]/5 px-4 py-1.5 rounded-full border border-[#4FD1C5]/20 cursor-pointer hover:bg-[#4FD1C5] hover:text-white transition-all duration-300 uppercase tracking-widest"
                        >
                            Ver Global
                        </button>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-separate border-spacing-y-2">
                            <thead className={`${vistaPremium ? 'bg-white/5 text-slate-400' : 'bg-slate-200/80 text-slate-900'} text-[10px] uppercase font-black tracking-widest`}>
                                <tr>
                                    <th className="py-3 px-4 rounded-l-2xl">Código Ref</th>
                                    <th className="py-3 px-4 text-center">Cliente / Perfil</th>
                                    <th className="py-3 px-4 text-center">Fecha Registro</th>
                                    <th className="py-3 px-4 text-right">Monto</th>
                                    <th className="py-3 px-4 text-right">Estatus</th>
                                    <th className="py-3 px-4 text-right rounded-r-2xl">PDF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ultimosPrestamos.map(p => (
                                    <tr key={p.id} className={`group/row transition-all duration-300 cursor-pointer ${
                                        vistaPremium ? 'bg-white/[0.02] hover:bg-white/[0.08]' : 'bg-white hover:bg-slate-50 border border-[var(--borde)]'
                                    }`}>
                                        <td className="py-4 px-4 text-[10px] text-[var(--texto-3)] font-mono rounded-l-2xl border-l border-y border-[var(--borde)] shadow-sm">#{p.id.slice(0, 8).toUpperCase()}</td>
                                        <td className="py-4 px-4 text-xs text-[var(--texto-1)] font-black">{p.persona?.primer_nombre} {p.persona?.primer_apellido}</td>
                                        <td className="py-4 px-4 text-[10px] text-[var(--texto-3)] font-bold">{formatFechaCorta(p.createdAt)}</td>
                                        <td className={`py-4 px-4 text-sm text-right font-black font-syne tracking-tighter ${vistaPremium ? 'text-[#00D4FF]' : 'text-[#4FD1C5]'}`}>{formatCOPCorto(p.monto_otorgado)}</td>
                                        <td className="py-4 px-4 text-right border-y border-[var(--borde)]"><div className="scale-90 origin-right transition-transform group-hover/row:scale-100"><BadgeEstado estado={p.estado} /></div></td>
                                        <td className="py-4 px-4 text-right rounded-r-2xl border-r border-y border-[var(--borde)]">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); imprimirAmortizacion(p.id); }}
                                                className={`p-2 rounded-xl transition-all ${
                                                    vistaPremium ? 'text-white/40 hover:text-[#00D4FF] hover:bg-white/5' : 'text-slate-400 hover:text-teal-700 hover:bg-slate-200'
                                                }`}
                                            >
                                                <Printer size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>



            {/* Hidden Print Containers */}
            <div style={{ position: 'absolute', top: '-9999px', opacity: 0, pointerEvents: 'none' }}>
                <AmortizacionPDF ref={amortizacionPrintRef} prestamo={prestamoParaAmortizar} />
                <AmortizacionMasivaPDF ref={amortizacionMasivaPrintRef} prestamos={prestamosMasivos} summaryProps={pdfConsolidadoProps} />
            </div>

        </div>
    )
}

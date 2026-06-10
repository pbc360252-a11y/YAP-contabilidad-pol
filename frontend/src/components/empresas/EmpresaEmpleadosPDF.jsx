import React, { forwardRef } from 'react';
import logoYap from '../../assets/logo_yap.png';
import { formatCOPCorto } from '../../utils/formatCOP';

export const EmpresaEmpleadosPDF = forwardRef(({ empresa, empleados, periodo }, ref) => {
    if (!empresa) return null;

    const fechaHoy = new Date().toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: '2-digit'
    }).toUpperCase();

    const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const periodoStr = periodo 
        ? `${MESES[periodo.mes]} ${periodo.quincena === 'Q1' ? '01-15' : '16-31'} DE ${periodo.anio}`
        : null;

    // Filtramos los empleados que tienen algún préstamo en curso o procesamos la información de créditos
    const empleadosConDatos = (empleados || []).map(e => {
        const prestamosActivos = e.prestamos || [];
        const montoSolicitado = prestamosActivos.reduce((acc, p) => acc + (p.monto_otorgado || 0), 0);
        
        let cuotaPeriodo = 0;
        let tieneCuotaEnPeriodo = false;

        if (periodo) {
            // Buscamos si el préstamo tiene cuotas programadas en esta quincena
            cuotaPeriodo = prestamosActivos.reduce((acc, p) => {
                const cuotaCoincidente = (p.cuotas || []).find(c => {
                    const fecha = new Date(c.fecha_programada);
                    const a = fecha.getUTCFullYear();
                    const m = fecha.getUTCMonth();
                    const d = fecha.getUTCDate();
                    
                    const coincideAnio = a === periodo.anio;
                    const coincideMes = m === periodo.mes;
                    const coincideDia = periodo.quincena === 'Q1' 
                        ? (d >= 1 && d <= 15) 
                        : (d >= 16 && d <= 31);
                        
                    return coincideAnio && coincideMes && coincideDia;
                });
                
                if (cuotaCoincidente) {
                    tieneCuotaEnPeriodo = true;
                    return acc + (cuotaCoincidente.cuota_total || 0);
                }
                return acc;
            }, 0);
        } else {
            // Fallback original si no hay periodo seleccionado
            cuotaPeriodo = prestamosActivos.reduce((acc, p) => {
                const nextCuota = p.cuotas && p.cuotas[0];
                return acc + (nextCuota ? (nextCuota.cuota_total || 0) : 0);
            }, 0);
            tieneCuotaEnPeriodo = prestamosActivos.length > 0;
        }

        const estados = prestamosActivos.map(p => {
            if (p.estado === 'activo') return 'ACTIVO';
            if (p.estado === 'en_mora') return 'EN MORA';
            return p.estado.toUpperCase();
        }).join(', ') || 'SIN CRÉDITO';

        return {
            ...e,
            montoSolicitado,
            cuotaPeriodo,
            estados,
            tieneCredito: prestamosActivos.length > 0,
            tieneCuotaEnPeriodo
        };
    });

    // Para reporte quincenal, mostrar solo los empleados que tienen cuotas por cobrar en esa quincena
    const empleadosFiltrados = periodo 
        ? empleadosConDatos.filter(e => e.cuotaPeriodo > 0)
        : empleadosConDatos;

    // Totales generales para el informe
    const totalEmpleadosConCredito = empleadosFiltrados.filter(e => e.tieneCredito).length;
    const granTotalMonto = empleadosFiltrados.reduce((acc, e) => acc + e.montoSolicitado, 0);
    const granTotalCuotas = empleadosFiltrados.reduce((acc, e) => acc + e.cuotaPeriodo, 0);

    return (
        <div ref={ref} className="p-10 bg-white text-black font-serif text-[12px]" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div className="flex flex-col">
                    <img src={logoYap} alt="YAP" className="w-20 h-20 object-contain" />
                    <p className="font-bold text-lg mt-1">YAP (CRÉDITOS POR LIBRANZA)</p>
                </div>
                <div className="text-right">
                    <h1 className="font-bold text-xl uppercase text-blue-900">Facturación y Novedades de Libranza</h1>
                    <p className="text-sm font-bold uppercase text-gray-600 italic">{empresa.nombre}</p>
                    {periodoStr && <p className="text-xs font-black text-emerald-700 mt-1 uppercase">PERÍODO: {periodoStr}</p>}
                    <p className="text-[10px] mt-2">FECHA DE EMISIÓN: {fechaHoy}</p>
                </div>
            </div>

            {/* Resumen de Facturación */}
            <div className="mb-6 bg-gray-50 p-4 border border-black/10 grid grid-cols-3 gap-4">
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Empresa Convenio</p>
                    <p className="font-bold text-sm uppercase">{empresa.nombre}</p>
                </div>
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Deudores Activos</p>
                    <p className="font-bold text-sm">{totalEmpleadosConCredito} de {empleados?.length || 0} empleados</p>
                </div>
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Total a Descontar este Período</p>
                    <p className="font-bold text-sm text-green-700">{formatCOPCorto(granTotalCuotas)}</p>
                </div>
            </div>

            {/* Instrucción de Cobro */}
            <p className="mb-4 text-[10px] text-justify leading-relaxed">
                Señor Director de Nómina / Talento Humano: Agradecemos realizar el descuento por concepto de libranza a los empleados relacionados a continuación por los valores indicados bajo la casilla <strong>CUOTA A DESCONTAR</strong> correspondientes al período de nómina <strong>{periodoStr || 'del presente mes/período de nómina'}</strong>, y transferirlos a la cuenta bancaria autorizada de YAP.
            </p>

            {/* Table */}
            <table className="w-full border-collapse border border-black text-left">
                <thead>
                    <tr className="bg-gray-100 uppercase text-[9px]">
                        <th className="border border-black p-2 text-center" style={{ width: '4%' }}>N°</th>
                        <th className="border border-black p-2" style={{ width: '13%' }}>Cédula</th>
                        <th className="border border-black p-2" style={{ width: '30%' }}>Nombre Completo</th>
                        <th className="border border-black p-2" style={{ width: '15%' }}>Cargo</th>
                        <th className="border border-black p-2 text-right" style={{ width: '15%' }}>Monto Solicitado</th>
                        <th className="border border-black p-2 text-right" style={{ width: '13%' }}>Cuota a Descontar</th>
                        <th className="border border-black p-2 text-center" style={{ width: '10%' }}>Estado</th>
                    </tr>
                </thead>
                <tbody className="uppercase text-[10px]">
                    {empleadosFiltrados && empleadosFiltrados.length > 0 ? (
                        empleadosFiltrados.map((e, index) => (
                            <tr key={e.id} className={e.tieneCredito ? '' : 'text-gray-400'}>
                                <td className="border border-black p-2 text-center font-mono">{index + 1}</td>
                                <td className="border border-black p-2 font-mono">{e.cedula}</td>
                                <td className="border border-black p-2 font-bold">{e.primer_nombre} {e.segundo_nombre || ''} {e.primer_apellido} {e.segundo_apellido || ''}</td>
                                <td className="border border-black p-2 italic">{e.cargo || '-'}</td>
                                <td className="border border-black p-2 text-right font-mono">{e.tieneCredito ? formatCOPCorto(e.montoSolicitado) : '-'}</td>
                                <td className="border border-black p-2 text-right font-bold font-mono text-green-800">{e.tieneCredito ? formatCOPCorto(e.cuotaPeriodo) : '-'}</td>
                                <td className="border border-black p-2 text-center text-[9px] font-bold">{e.estados}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="7" className="border border-black p-10 text-center font-bold text-gray-400">
                                {periodo ? "No hay cuotas programadas para descuento en esta quincena" : "No hay empleados registrados para esta empresa"}
                            </td>
                        </tr>
                    )}
                </tbody>
                {empleadosFiltrados && empleadosFiltrados.length > 0 && (
                    <tfoot>
                        <tr className="bg-gray-50 font-bold uppercase text-[10px]">
                            <td colSpan="4" className="border border-black p-2 text-right">TOTAL GENERAL FACTURADO:</td>
                            <td className="border border-black p-2 text-right font-mono">{formatCOPCorto(granTotalMonto)}</td>
                            <td className="border border-black p-2 text-right font-mono text-green-800">{formatCOPCorto(granTotalCuotas)}</td>
                            <td className="border border-black p-2"></td>
                        </tr>
                    </tfoot>
                )}
            </table>

            {/* Footer Signatures */}
            <div className="mt-20 flex justify-between px-10">
                <div className="flex flex-col items-center">
                    <div className="w-48 border-b border-black mb-1"></div>
                    <p className="text-[10px] font-bold uppercase">Firma Autorizada YAP</p>
                    <span className="text-[8px] text-gray-500">CONTROL DE CARTERA</span>
                </div>
                <div className="flex flex-col items-center">
                    <div className="w-48 border-b border-black mb-1"></div>
                    <p className="text-[10px] font-bold uppercase">Recibido Convenio / Sello</p>
                    <span className="text-[8px] text-gray-500">DEPARTAMENTO DE NÓMINA</span>
                </div>
            </div>

            <div className="mt-16 pt-4 border-t border-gray-200 text-center text-[8px] uppercase text-gray-400 leading-normal">
                Este documento constituye un soporte formal de cobro de libranza según convenio vigente.<br />
                YAP Financial · v2.5
            </div>
        </div>
    );
});

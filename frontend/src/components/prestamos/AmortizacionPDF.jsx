import React, { forwardRef } from 'react';
import logoYap from '../../assets/logo_yap.png';
import { formatCOP } from '../../utils/formatCOP';
import { formatFechaCorta } from '../../utils/formatFecha';

export const AmortizacionPDF = forwardRef(({ prestamo }, ref) => {
    if (!prestamo) return null;

    const { persona, cuotas, tipo, tasas_aplicadas } = prestamo;

    const formatCurrency = (val) => formatCOP(val || 0);

    // Cálculos y obtención de tasas específicas
    const tasaEA = prestamo.tasa_efectiva_total || 0;
    const interesTasa = tasas_aplicadas?.find(t => t.nombre_snapshot.toLowerCase().includes('interés') || t.nombre_snapshot.toLowerCase().includes('tasa')) || {};
    const tasaNominal = (interesTasa.valor_snapshot || 0).toFixed(2);

    // Buscar cargos específicos si existen para el desglose minucioso (búsqueda robusta)
    const seguroTasaRecord = tasas_aplicadas?.find(t => {
        const name = (t.nombre_snapshot || '').toLowerCase();
        return name.includes('seguro') || name.includes('poliza') || name.includes('póliza') || name.includes('aval') || name.includes('cargo') || name.includes('estudio') || name.includes('auxilio');
    });
    
    const ahorroTasaRecord = tasas_aplicadas?.find(t => {
        const name = (t.nombre_snapshot || '').toLowerCase();
        return name.includes('ahorro') || name.includes('social') || name.includes('solidario');
    });

    const formatTasaValor = (record) => {
        if (!record) return '$0';
        const tipo = record.tipo_calculo_snapshot || record.tipo_calculo;
        const val = record.valor_snapshot;
        if (tipo === 'monto_fijo') {
            return formatCurrency(val);
        }
        return `${Number(val).toFixed(2)}%`;
    };

    const seguroTasaStr = formatTasaValor(seguroTasaRecord);
    const ahorroTasaStr = formatTasaValor(ahorroTasaRecord);

    // Totales de pie de tabla
    const totalCapital = cuotas?.reduce((acc, c) => acc + (c.capital_cuota || 0), 0) || 0;
    const totalIntereses = cuotas?.reduce((acc, c) => acc + (c.intereses_cuota || 0), 0) || 0;
    const totalCargos = cuotas?.reduce((acc, c) => acc + (c.cargos_unicos || 0), 0) || 0;
    const totalGeneral = cuotas?.reduce((acc, c) => acc + (c.cuota_total || 0), 0) || 0;

    return (
        <div ref={ref} className="p-8 bg-white text-black font-sans text-xs leading-none" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
            {/* Header section mimics the photo structure */}
            <div className="border border-black mb-1">
                <div className="grid grid-cols-[1fr_8fr_4fr] divide-x divide-black border-b border-black">
                    <div className="p-2 flex items-center justify-center">
                        <img src={logoYap} alt="" className="w-12 h-12 object-contain" />
                    </div>
                    <div className="p-2 flex flex-col justify-center gap-1 font-bold text-sm">
                        <h1 className="text-blue-900 font-black">YAP (CRÉDITOS POR LIBRANZA)</h1>
                        <p className="text-[10px] text-gray-600 font-normal">SISTEMA ADMINISTRATIVO DE CARTERA</p>
                    </div>
                    <div className="p-2 flex flex-col justify-center bg-gray-50">
                        <p className="font-bold text-[10px]">TABLA DE AMORTIZACIÓN</p>
                        <p className="text-blue-800 font-black text-xs mt-1">{prestamo.codigo || 'S/N'}</p>
                    </div>
                </div>

                {/* Info block 1 */}
                <div className="grid grid-cols-6 divide-x divide-black border-b border-black font-bold text-[9px] uppercase">
                    <div className="p-1.5 px-2 flex items-center bg-gray-200">CLIENTE:</div>
                    <div className="p-1.5 px-2 flex items-center col-span-2 text-black bg-white">{persona?.primer_nombre} {persona?.segundo_nombre || ''} {persona?.primer_apellido} {persona?.segundo_apellido || ''}</div>
                    <div className="p-1.5 px-2 flex items-center bg-gray-200">NIT / C.C:</div>
                    <div className="p-1.5 px-2 flex items-center col-span-2 text-black bg-white">{persona?.cedula?.toLocaleString()}</div>
                </div>

                {/* Info block 2 */}
                <div className="grid grid-cols-6 divide-x divide-black border-b border-black font-bold text-[9px] uppercase">
                    <div className="p-1.5 px-2 flex items-center bg-gray-200">DIRECCIÓN:</div>
                    <div className="p-1.5 px-2 flex items-center col-span-2 text-black bg-white">{persona?.direccion || 'NO REGISTRADA'}</div>
                    <div className="p-1.5 px-2 flex items-center bg-gray-200">TELÉFONO:</div>
                    <div className="p-1.5 px-2 flex items-center col-span-2 text-black bg-white">{persona?.telefono || '-'}</div>
                </div>

                <div className="bg-blue-900 text-white font-bold text-center py-1 text-[10px] uppercase border-b border-black tracking-[0.2em]">DATOS TÉCNICOS DE LA OBLIGACIÓN</div>

                <div className="grid grid-cols-6 divide-x divide-black border-b border-black bg-gray-200 font-bold text-[8px] text-center uppercase">
                    <div className="p-1.5">No. OBLIGACIÓN</div>
                    <div className="p-1.5">FECHA INICIO</div>
                    <div className="p-1.5">FECHA FINAL</div>
                    <div className="p-1.5">LÍNEA CRÉDITO</div>
                    <div className="p-1.5">CLASE</div>
                    <div className="p-1.5">FORMA PAGO</div>
                </div>
                <div className="grid grid-cols-6 divide-x divide-black border-b border-black text-center text-[9px] font-bold bg-white uppercase">
                    <div className="p-1.5">{prestamo.codigo || '-'}</div>
                    <div className="p-1.5">{formatFechaCorta(prestamo.createdAt)}</div>
                    <div className="p-1.5">{formatFechaCorta(prestamo.fecha_ultimo_pago)}</div>
                    <div className="p-1.5">{tipo?.nombre}</div>
                    <div className="p-1.5 text-blue-800">CONSUMO</div>
                    <div className="p-1.5">LIBRANZA</div>
                </div>

                <div className="grid grid-cols-6 divide-x divide-black border-b border-black bg-gray-200 font-bold text-[8px] text-center uppercase">
                    <div className="p-1.5">MONTO TOTAL</div>
                    <div className="p-1.5">No. CUOTAS</div>
                    <div className="p-1.5">TIPO AMORT.</div>
                    <div className="p-1.5">PERIODICIDAD</div>
                    <div className="p-1.5">TIPO TASA</div>
                    <div className="p-1.5">TASA E.A.</div>
                </div>
                <div className="grid grid-cols-6 divide-x divide-black border-b border-black text-center text-[9px] font-bold bg-white uppercase">
                    <div className="p-1.5 text-blue-900">{formatCurrency(prestamo.monto_otorgado)}</div>
                    <div className="p-1.5">{prestamo.numero_cuotas}</div>
                    <div className="p-1.5">{prestamo.metodo_amortizacion === 'frances' ? 'CUOTA FIJA' : 'CAPITAL CONSTANTE'}</div>
                    <div className="p-1.5">QUINCENAL</div>
                    <div className="p-1.5">COBRO ASISTIDO</div>
                    <div className="p-1.5">{tasaEA}%</div>
                </div>

                <div className="grid grid-cols-6 divide-x divide-black bg-gray-100 font-bold text-[8px] text-center uppercase">
                    <div className="p-1">Tasa E.A.</div>
                    <div className="p-1">Tasa Nom.</div>
                    <div className="p-1">Periodo</div>
                    <div className="p-1">Gracia Int/Cap</div>
                    <div className="p-1">Seguro/Otros</div>
                    <div className="p-1">Capital Social</div>
                </div>
                <div className="grid grid-cols-6 divide-x divide-black text-center text-[9px] font-bold border-t border-black">
                    <div className="p-1">{tasaEA}%</div>
                    <div className="p-1">{tasaNominal}%</div>
                    <div className="p-1">QUINCENAL</div>
                    <div className="p-1">0 / 0</div>
                    <div className="p-1 text-red-600">{seguroTasaStr}</div>
                    <div className="p-1">{ahorroTasaStr}</div>
                </div>
            </div>

            {/* Amortization Table */}
            <table className="w-full border-collapse border border-black text-[8px]">
                <thead className="bg-gray-200 font-bold uppercase text-center">
                    <tr className="divide-x divide-black">
                        <th className="p-1 w-6">#</th>
                        <th className="p-1">Fecha Pag</th>
                        <th className="p-1">Saldo Cap.</th>
                        <th className="p-1">Capital</th>
                        <th className="p-1">Interes</th>
                        <th className="p-1">Cargos</th>
                        <th className="p-1">Cuota</th>
                        <th className="p-1 w-20">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-black/20 font-bold">
                    {cuotas?.map((c) => (
                        <tr key={c.id} className="divide-x divide-black text-center uppercase">
                            <td className="p-1">{c.numero_cuota}</td>
                            <td className="p-1">{formatFechaCorta(c.fecha_programada)}</td>
                            <td className="p-1 text-right">{formatCurrency(c.saldo_inicio)}</td>
                            <td className="p-1 text-right">{formatCurrency(c.capital_cuota)}</td>
                            <td className="p-1 text-right text-red-700">{formatCurrency(c.intereses_cuota)}</td>
                            <td className="p-1 text-right text-yellow-700">{formatCurrency(c.cargos_unicos)}</td>
                            <td className="p-1 text-right bg-blue-50/30">{formatCurrency(c.cuota_total)}</td>
                            <td className="p-1 text-[7px]">{c.estado}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-gray-100 font-black border-t border-black uppercase text-center text-[9px]">
                    <tr className="divide-x divide-black">
                        <td colSpan="3" className="p-2 text-right pr-4">TOTALES DEL CRÉDITO:</td>
                        <td className="p-2 text-right">{formatCurrency(totalCapital)}</td>
                        <td className="p-2 text-right">{formatCurrency(totalIntereses)}</td>
                        <td className="p-2 text-right">{formatCurrency(totalCargos)}</td>
                        <td className="p-2 text-right text-blue-900 bg-blue-100/50">{formatCurrency(totalGeneral)}</td>
                        <td className="p-2">PROYECTADO</td>
                    </tr>
                </tfoot>
            </table>

            {/* Footer legal text */}
            <div className="mt-8 grid grid-cols-2 gap-20 px-8">
                <div className="border-t border-black pt-2 text-center flex flex-col items-center">
                    <p className="font-bold uppercase mb-4">Firma del Cliente</p>
                    <div className="w-16 h-16 border border-gray-300 opacity-20 flex items-center justify-center text-[7px]">HUELLA</div>
                    <p className="text-[8px] mt-2">C.C. {persona?.cedula}</p>
                </div>
                <div className="border-t border-black pt-2 text-center">
                    <p className="font-bold uppercase">Aprobación YAP</p>
                    <p className="text-[7px] text-gray-500 mt-8">CONTROL INTERNO - YAP (CRÉDITOS POR LIBRANZA)</p>
                </div>
            </div>

            <div className="mt-10 pt-4 border-t border-gray-100 text-center text-[7px] text-gray-400 uppercase italic">
                Este documento es una proyección de amortización y no constituye un estado de cuenta final.
                Los valores pueden variar según la puntualidad de los pagos y tasas vigentes.
            </div>
        </div>
    );
});

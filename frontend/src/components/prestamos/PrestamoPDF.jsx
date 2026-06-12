import React, { forwardRef } from 'react';
import logoYap from '../../assets/logo_yap.png';

export const PrestamoPDF = forwardRef(({ prestamo }, ref) => {
    if (!prestamo) return null;

    const { persona, cuotas } = prestamo;
    const empresaNombre = persona?.empresa?.nombre || "YAP (CRÉDITOS POR LIBRANZA)";
    const codigoFormato = prestamo.codigo || (prestamo.numero_prestamo ? `LYAP${String(prestamo.numero_prestamo).padStart(5, '0')}` : (prestamo.id ? `LYAP${prestamo.id.slice(-5).toUpperCase()}` : "LYAP00944"));
    const valorCredito = prestamo.monto_otorgado || 0;

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(val || 0);
    };

    const formatDate = (dateString, simple = false) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (simple) return date.toLocaleDateString('es-CO').toUpperCase();
        return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: '2-digit' }).toUpperCase();
    };

    return (
        <div ref={ref} className="p-10 bg-white text-black font-serif text-[11px] leading-tight" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
            <div className="border-[1.5px] border-black">
                {/* Header Section */}
                <div className="grid grid-cols-[1.5fr_2fr_1fr] border-b-[1.5px] border-black h-24">
                    <div className="flex flex-col items-center justify-center border-r-[1.5px] border-black p-2">
                        <img src={logoYap} alt="YAP" className="w-16 h-16 object-contain" />
                        <p className="text-[9px] font-bold mt-1">YAP</p>
                        <p className="text-[7px]">CREDITO POR LIBRANZA</p>
                    </div>
                    <div className="flex flex-col items-center justify-center border-r-[1.5px] border-black">
                        <p className="font-bold text-sm tracking-widest">TELEFONO: 312 307 3156</p>
                    </div>
                    <div className="flex flex-col bg-gray-50 uppercase">
                        <div className="h-1/2 border-b-[1.5px] border-black flex items-center justify-center font-bold">CODIGO</div>
                        <div className="h-1/2 flex items-center justify-center font-bold text-sm tracking-wider">{codigoFormato}</div>
                    </div>
                </div>

                {/* Info Rows */}
                <div className="grid grid-cols-[1.2fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black uppercase">
                    <div className="p-1 bg-gray-50 font-bold text-center flex items-center justify-center">NOMBRE CLIENTE</div>
                    <div className="p-1 pl-4 flex items-center font-bold">{persona?.primer_nombre} {persona?.segundo_nombre || ''} {persona?.primer_apellido} {persona?.segundo_apellido || ''}</div>
                </div>
                <div className="grid grid-cols-[1.2fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black uppercase">
                    <div className="p-1 bg-gray-50 font-bold text-center flex items-center justify-center">NIT/CC CLIENTE</div>
                    <div className="p-1 pl-4 flex items-center font-bold">{persona?.cedula}</div>
                </div>
                <div className="grid grid-cols-[1.2fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black uppercase">
                    <div className="p-1 bg-gray-50 font-bold text-center flex items-center justify-center">CELULAR</div>
                    <div className="p-1 pl-4 flex items-center font-bold">{persona?.telefono || '-'}</div>
                </div>
                <div className="grid grid-cols-[1.2fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black uppercase">
                    <div className="p-1 bg-gray-50 font-bold text-center flex items-center justify-center leading-none">EMPRESA QUE RESPALDA</div>
                    <div className="p-1 pl-4 flex items-center font-bold text-[10px]">{empresaNombre}</div>
                </div>
                <div className="grid grid-cols-[1.2fr_3fr] border-b-[2px] border-black divide-x-[1.5px] divide-black uppercase">
                    <div className="p-1 bg-gray-50 font-bold text-center flex items-center justify-center">VALOR DEL CREDITO</div>
                    <div className="p-2 pl-4 flex items-center font-bold text-lg">{formatCurrency(valorCredito)}</div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[0.8fr_1.5fr_2fr] border-b-[2px] border-black divide-x-[1.5px] divide-black bg-gray-100 uppercase font-extrabold text-[10px] text-center">
                    <div className="p-1 flex flex-col justify-center">Nº DE<br />CUOTAS</div>
                    <div className="p-1 flex flex-col justify-center">
                        {prestamo.metodo_amortizacion === 'frances' ? (
                            <>VALOR CUOTA FIJA<br />QUINCENAL</>
                        ) : (
                            <>VALOR CUOTA<br />QUINCENAL</>
                        )}
                    </div>
                    <div className="p-1 flex items-center justify-center">FECHA DE PAGO</div>
                </div>

                {/* Table Rows */}
                {cuotas && cuotas.map((c, i) => (
                    <div key={i} className="grid grid-cols-[0.8fr_1.5fr_2fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black uppercase">
                        <div className="p-1 pl-2 font-bold bg-gray-50 text-[10px]">CUOTA {c.numero_cuota}</div>
                        <div className="p-1 pr-6 flex items-center justify-end font-bold text-sm tracking-tighter">{formatCurrency(c.cuota_total)}</div>
                        <div className="p-1 flex items-center justify-center font-bold text-[10px]">{formatDate(c.fecha_programada)}</div>
                    </div>
                ))}
            </div>

            {/* Signature & Fingerprint Section */}
            <div className="border-x-[1.5px] border-b-[1.5px] border-black grid grid-cols-[3fr_1fr] h-28">
                <div className="flex flex-col h-full">
                    <div className="flex-1 flex px-4 pt-4 divide-x-[1.5px] divide-black">
                        <div className="w-1/2 flex flex-col justify-between pb-2 border-r-[1.5px] border-black">
                            <span className="font-bold">FIRMA DEL DEUDOR</span>
                            <div className="w-[80%] border-b border-black"></div>
                        </div>
                        <div className="w-1/2"></div>
                    </div>
                    <div className="h-10 border-t-[1.5px] border-black grid grid-cols-[1.2fr_2fr] uppercase">
                        <div className="flex items-center justify-center bg-gray-50 font-bold text-[10px] border-r-[1.5px] border-black text-center">CEDULA DEL DEUDOR</div>
                        <div className="flex items-center pl-4 font-bold text-sm">{persona?.cedula}</div>
                    </div>
                </div>
                <div className="flex flex-col border-l-[1.5px] border-black h-full">
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-16 h-20 border border-black/40 bg-gray-50/50"></div>
                    </div>
                    <p className="text-[7px] font-bold text-center pb-1">HUELLA</p>
                </div>
            </div>

            {/* Codeudor Section */}
            <div className="border-x-[1.5px] border-b-[1.5px] border-black uppercase text-[10px]">
                <div className="grid grid-cols-[1.5fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black">
                    <div className="bg-gray-50 p-2 font-bold text-center flex items-center justify-center">REQUIERE CODEUDOR</div>
                    <div className="flex items-center pl-8 gap-12 font-bold">
                        <span className="flex items-center gap-2">SI <div className="w-4 h-4 border border-black bg-white"></div></span>
                        <span className="flex items-center gap-2">NO <div className="w-4 h-4 border border-black bg-black flex items-center justify-center text-white text-[10px]">✕</div></span>
                    </div>
                </div>
                <div className="grid grid-cols-[1.5fr_3fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black h-16">
                    <div className="bg-white p-2 font-bold text-center flex items-center justify-center leading-tight">NOMBRE DEL CODEUDOR<br />/<br />CEDULA</div>
                    <div className="flex flex-col justify-center gap-4 px-4">
                        <div className="w-[90%] border-b border-black h-2"></div>
                        <div className="w-[90%] border-b border-black h-2"></div>
                    </div>
                </div>
                <div className="grid grid-cols-[1.5fr_3fr] divide-x-[1.5px] divide-black h-12">
                    <div className="bg-gray-50 p-2 font-bold text-center flex items-center justify-center uppercase">FIRMA DE CODEUDOR</div>
                    <div className="flex items-center px-4">
                        <div className="w-[90%] border-b border-black"></div>
                    </div>
                </div>
            </div>

            {/* Bank Info Section */}
            <div className="border-x-[1.5px] border-b-[1.5px] border-black uppercase text-[10px]">
                <div className="grid grid-cols-[1fr_3.5fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black">
                    <div className="p-1 px-4 font-bold flex items-center bg-gray-100">ENTIDAD BANCARIA:</div>
                    <div className="flex items-center gap-10 px-8 font-bold">
                        <span className="flex items-center gap-2">AHORRO <div className="w-5 h-5 border border-black bg-white flex items-center justify-center">X</div></span>
                        <span className="flex items-center gap-2">CREDITO <div className="w-5 h-5 border border-black bg-white"></div></span>
                    </div>
                </div>
                <div className="grid grid-cols-[1fr_1.5fr_1.5fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black h-10">
                    <div className="p-1 px-4 font-bold flex items-center">DAVIVIENDA</div>
                    <div className="flex items-center justify-center"><div className="w-5 h-5 border border-black bg-white"></div></div>
                    <div className="flex items-center gap-2 px-2 font-bold">Nº. <div className="flex-1 border-b border-black h-2"></div></div>
                </div>
                <div className="grid grid-cols-[1fr_1.5fr_1.5fr] border-b-[1.5px] border-black divide-x-[1.5px] divide-black h-10">
                    <div className="p-1 px-4 font-bold flex items-center">DAVIPLATA</div>
                    <div className="flex items-center justify-center"><div className="w-5 h-5 border border-black bg-white"></div></div>
                    <div className="flex items-center gap-2 px-2 font-bold">Nº. <div className="flex-1 border-b border-black h-2"></div></div>
                </div>
                <div className="bg-gray-200 p-2 text-center text-[9px] font-bold">
                    NOTA: SE FIRMAN 2 COPIAS, UNA QUE REGRESA A LA ENTIDAD Y OTRA PARA QUE LA EMPRESA APLIQUE LA DEDUCCIÓN
                </div>
            </div>
        </div>
    );
});

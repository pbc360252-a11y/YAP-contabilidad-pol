import * as XLSXModule from 'xlsx-js-style';
const XLSX = XLSXModule.default || XLSXModule;

/**
 * Genera y descarga un archivo Excel (.xlsx) premium con estilos visuales completos.
 */
export function exportToExcel({
    title = 'Reporte',
    subtitle = '',
    infoRows = [],
    tableHeaders = [],
    tableRows = [],
    footerText = '',
    fileName = 'reporte_yap',
}) {
    // ── Helpers ──────────────────────────────────────────────────────────────────
    const cleanNumber = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const cleaned = val.replace(/[^\d.-]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
        return null;
    };

    const border = (style, color = 'B0BEC5') => ({ style, color: { rgb: color } });
    const thinBorder  = border('thin');
    const thickBorder = border('medium', '1A6FFF');
    const noBorder    = { style: 'none' };
    const noBorders   = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
    const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    const font = (opts) => ({ name: 'Calibri', size: 11, ...opts });

    const cell = (v, s) => ({ v, s });

    // ── Rastreo de filas ──────────────────────────────────────────────────────────
    let R = 0;
    const ROW = {
        brand:      R++,
        title:      R++,
        subtitle:   subtitle ? R++ : -1,
        date:       (subtitle ? null : null, R++),
        spacer1:    R++,
    };
    if (!subtitle) { ROW.subtitle = -1; }

    // Recalcular porque subtitle puede no existir
    R = 0;
    ROW.brand    = R++;
    ROW.title    = R++;
    if (subtitle) { ROW.subtitle = R++; } else { ROW.subtitle = -1; }
    ROW.date     = R++;
    ROW.spacer1  = R++;

    if (infoRows.length > 0) {
        ROW.kpiHeader  = R++;
        ROW.kpiLabels  = R++;
        ROW.kpiValues  = R++;
        ROW.spacer2    = R++;
    } else {
        ROW.kpiHeader = ROW.kpiLabels = ROW.kpiValues = ROW.spacer2 = -1;
    }

    ROW.tableTitle  = R++;
    ROW.tableHeader = R++;
    ROW.dataStart   = R;
    R += tableRows.length;
    ROW.dataEnd     = R - 1;
    ROW.spacer3     = R++;

    if (footerText) {
        ROW.footer  = R++;
        ROW.spacer4 = R++;
    } else {
        ROW.footer = ROW.spacer4 = -1;
    }
    ROW.disclaimer = R++;

    // ── Construir filas de datos ──────────────────────────────────────────────────
    const ws_data = [];
    const fechaHoy = new Date().toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: '2-digit',
    }).toUpperCase();

    // Encabezado de marca
    ws_data.push(['YAP — SISTEMA DE GESTIÓN DE CRÉDITOS POR LIBRANZA']);
    ws_data.push([title.toUpperCase()]);
    if (subtitle) ws_data.push([subtitle.toUpperCase()]);
    ws_data.push(['FECHA DE EMISIÓN:  ' + fechaHoy]);
    ws_data.push([]);

    // KPIs
    if (infoRows.length > 0) {
        ws_data.push(['INDICADORES CLAVE DE GESTIÓN']);
        ws_data.push(infoRows.map(r => (r.label ?? '').toUpperCase()));
        ws_data.push(infoRows.map(r => r.value ?? ''));
        ws_data.push([]);
    }

    // Tabla
    ws_data.push(['DETALLE CONSOLIDADO DE OBLIGACIONES']);
    if (tableHeaders.length > 0) {
        ws_data.push(tableHeaders.map(h => (h.label ?? '').toUpperCase()));
    }
    tableRows.forEach(row => {
        ws_data.push(row.map(c => {
            const v = c.value ?? '';
            if (typeof v === 'string' && v.includes('$')) {
                const n = cleanNumber(v);
                return n !== null ? n : v;
            }
            return v;
        }));
    });
    ws_data.push([]);

    // Footer
    if (footerText) { ws_data.push([footerText.toUpperCase()]); ws_data.push([]); }
    ws_data.push(['Documento generado electrónicamente por el Sistema YAP  •  Confidencial']);

    // ── Crear hoja ────────────────────────────────────────────────────────────────
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // ── Aplicar estilos celda por celda ──────────────────────────────────────────
    for (const addr in ws) {
        if (addr.startsWith('!')) continue;
        const c = ws[addr];
        const { r, col } = (() => {
            const d = XLSX.utils.decode_cell(addr);
            return { r: d.r, col: d.c };
        })();

        // Convertir strings monetarios a número para formato nativo
        if (typeof c.v === 'number' && c.v >= 1000) {
            c.t = 'n';
            c.z = '"$"#,##0';
        }

        // ── Estilos por fila ──
        if (r === ROW.brand) {
            c.s = {
                font: font({ size: 13, bold: true, color: { rgb: '0D47A1' } }),
                fill: { fgColor: { rgb: 'E3F2FD' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: noBorders,
            };
        } else if (r === ROW.title) {
            c.s = {
                font: font({ size: 16, bold: true, color: { rgb: '1A237E' } }),
                fill: { fgColor: { rgb: 'FFFFFF' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: noBorders,
            };
        } else if (r === ROW.subtitle || r === ROW.date) {
            c.s = {
                font: font({ size: 10, italic: true, color: { rgb: '546E7A' } }),
                fill: { fgColor: { rgb: 'FFFFFF' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: noBorders,
            };
        } else if (r === ROW.kpiHeader) {
            c.s = {
                font: font({ size: 11, bold: true, color: { rgb: 'FFFFFF' } }),
                fill: { fgColor: { rgb: '1565C0' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: thinBorders,
            };
        } else if (r === ROW.kpiLabels) {
            c.s = {
                font: font({ size: 9, bold: true, color: { rgb: 'FFFFFF' } }),
                fill: { fgColor: { rgb: '263238' } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: thinBorders,
            };
        } else if (r === ROW.kpiValues) {
            c.s = {
                font: font({ size: 13, bold: true, color: { rgb: '00695C' } }),
                fill: { fgColor: { rgb: 'E8F5E9' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: thinBorders,
            };
        } else if (r === ROW.tableTitle) {
            c.s = {
                font: font({ size: 11, bold: true, color: { rgb: 'FFFFFF' } }),
                fill: { fgColor: { rgb: '0D47A1' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
            };
        } else if (r === ROW.tableHeader) {
            c.s = {
                font: font({ size: 9, bold: true, color: { rgb: 'FFFFFF' } }),
                fill: { fgColor: { rgb: '1565C0' } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: thinBorders,
            };
        } else if (r >= ROW.dataStart && r <= ROW.dataEnd) {
            const isEven = (r - ROW.dataStart) % 2 === 0;
            const bgColor = isEven ? 'FFFFFF' : 'EFF3FB';

            // Color especial para días mora > 0
            const isMoraCol = col === 5;
            const moraVal = isMoraCol ? (parseInt(c.v) || 0) : 0;
            const isMora = isMoraCol && moraVal > 0;

            let textColor = '263238';
            let fontOpts = { size: 9, color: { rgb: textColor } };

            if (col === 0) {
                // Código obligación — estilo monoespaciado azul
                fontOpts = { size: 9, bold: true, color: { rgb: '1565C0' }, name: 'Consolas' };
            } else if (isMora) {
                fontOpts = { size: 9, bold: true, color: { rgb: 'B71C1C' } };
            } else if (col === 6 || col === 7 || col === 8) {
                fontOpts = { size: 9, color: { rgb: '1B5E20' } };
            }

            let align = { horizontal: 'left', vertical: 'center' };
            if (col === 0 || col === 2 || col === 3 || col === 4 || col === 5 || col === 9) {
                align = { horizontal: 'center', vertical: 'center' };
            } else if (col === 6 || col === 7 || col === 8) {
                align = { horizontal: 'right', vertical: 'center' };
            }

            c.s = {
                font: { name: fontOpts.name || 'Calibri', size: fontOpts.size, bold: fontOpts.bold || false, color: fontOpts.color },
                fill: { fgColor: { rgb: isMora ? 'FFF3F3' : bgColor } },
                alignment: align,
                border: {
                    top: border('hair'),
                    bottom: border('hair'),
                    left: border('hair'),
                    right: border('hair'),
                },
            };
        } else if (r === ROW.footer) {
            c.s = {
                font: font({ size: 11, bold: true, color: { rgb: '1A237E' } }),
                fill: { fgColor: { rgb: 'BBDEFB' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
            };
        } else if (r === ROW.disclaimer) {
            c.s = {
                font: font({ size: 8, italic: true, color: { rgb: '90A4AE' } }),
                fill: { fgColor: { rgb: 'FFFFFF' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: noBorders,
            };
        } else {
            c.s = {
                font: font({ size: 9, color: { rgb: '607D8B' } }),
                fill: { fgColor: { rgb: 'FFFFFF' } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: noBorders,
            };
        }
    }

    // ── Ancho dinámico de columnas ────────────────────────────────────────────────
    const maxCols = ws_data.reduce((acc, row) => Math.max(acc, row.length), 0);
    const colWidths = Array.from({ length: maxCols }, () => ({ wch: 14 }));

    ws_data.forEach(row => {
        if (row.length <= 2) return;
        row.forEach((val, ci) => {
            if (val !== null && val !== undefined && val !== '') {
                const len = String(val).length;
                if (ci < colWidths.length && len > colWidths[ci].wch) {
                    colWidths[ci].wch = Math.min(50, len + 3);
                }
            }
        });
    });
    ws['!cols'] = colWidths;

    // ── Altura de filas especiales ────────────────────────────────────────────────
    const rowHeights = {};
    rowHeights[ROW.brand]       = { hpx: 28 };
    rowHeights[ROW.title]       = { hpx: 36 };
    rowHeights[ROW.tableTitle]  = { hpx: 26 };
    rowHeights[ROW.tableHeader] = { hpx: 30 };
    if (ROW.kpiLabels  >= 0) rowHeights[ROW.kpiLabels]  = { hpx: 24 };
    if (ROW.kpiValues  >= 0) rowHeights[ROW.kpiValues]  = { hpx: 30 };
    if (ROW.footer     >= 0) rowHeights[ROW.footer]      = { hpx: 26 };

    ws['!rows'] = Array.from({ length: R + 2 }, (_, i) => rowHeights[i] || { hpx: 18 });

    // ── Exportar ──────────────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte YAP');

    const safeFileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(wb, `${safeFileName}.xlsx`);
}

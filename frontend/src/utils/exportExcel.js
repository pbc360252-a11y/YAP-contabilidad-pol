import * as XLSXModule from 'xlsx-js-style';
const XLSX = XLSXModule.default || XLSXModule;

/**
 * Genera y descarga un archivo Excel (.xlsx) premium con estilos visuales completos.
 *
 * @param {object} params
 * @param {string} params.title          - Título del reporte
 * @param {string} params.subtitle       - Subtítulo
 * @param {Array}  params.infoRows       - [{label, value}] — fila de metadatos (KPIs)
 * @param {Array}  params.tableHeaders   - [{label}]        — cabeceras de la tabla
 * @param {Array}  params.tableRows      - [[{value},...]]  — filas de datos
 * @param {string} params.footerText     - Texto del pie de reporte
 * @param {string} params.fileName       - Nombre del archivo (sin extensión)
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
    const wb = XLSX.utils.book_new();
    const ws_data = [];

    // Auxiliar para limpiar y parsear valores numéricos a tipo número nativo en Excel
    const cleanNumber = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            // Elimina símbolos de pesos, puntos de miles y espacios
            const cleaned = val.replace(/[^\d-]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
        return null;
    };

    // ── Mapeo y rastreo de filas para el estilador dinámico ────────────────────
    let currentRow = 0;
    
    const titleRow = currentRow++;
    const mainTitleRow = currentRow++;
    let subtitleRow = -1;
    if (subtitle) {
        subtitleRow = currentRow++;
    }
    const dateRow = currentRow++;
    currentRow++; // Fila vacía de separación (después del header)

    // KPIs
    let kpiTitleRow = -1;
    let kpiLabelsRow = -1;
    let kpiValuesRow = -1;
    if (infoRows.length > 0) {
        kpiTitleRow = currentRow++;
        kpiLabelsRow = currentRow++;
        kpiValuesRow = currentRow++;
        currentRow++; // Fila vacía de separación
    }

    // Tabla de Datos
    const tableTitleRow = currentRow++;
    const tableHeaderRow = currentRow++;
    const tableDataStartRow = currentRow;
    currentRow += tableRows.length;
    const tableDataEndRow = currentRow - 1;
    currentRow++; // Fila vacía de separación

    // Footer / Totales
    let footerRow = -1;
    if (footerText) {
        footerRow = currentRow++;
        currentRow++; // Fila vacía
    }
    const disclaimerRow = currentRow++;

    // ── Llenado de ws_data ─────────────────────────────────────────────────────
    const fechaHoy = new Date().toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
    }).toUpperCase();

    // Cabecera principal
    ws_data.push(['YAP — SISTEMA DE GESTIÓN DE CRÉDITOS POR LIBRANZA']);
    ws_data.push([title.toUpperCase()]);
    if (subtitle) {
        ws_data.push([subtitle.toUpperCase()]);
    }
    ws_data.push(['FECHA DE EMISIÓN:', fechaHoy]);
    ws_data.push([]); // Espacio

    // KPIs
    if (infoRows.length > 0) {
        ws_data.push(['INDICADORES CLAVE DE GESTIÓN (KPIs)']);
        ws_data.push(infoRows.map(row => (row.label ?? '').toUpperCase()));
        ws_data.push(infoRows.map(row => row.value ?? ''));
        ws_data.push([]); // Espacio
    }

    // Tabla de obligaciones
    ws_data.push(['DETALLE CONSOLIDADO DE OBLIGACIONES']);
    if (tableHeaders.length > 0) {
        ws_data.push(tableHeaders.map(h => (h.label ?? '').toUpperCase()));
    }
    
    tableRows.forEach(row => {
        ws_data.push(row.map(cell => cell.value ?? ''));
    });
    ws_data.push([]); // Espacio

    // Pie
    if (footerText) {
        ws_data.push([footerText.toUpperCase()]);
        ws_data.push([]);
    }
    ws_data.push(['Documento generado electrónicamente por el Sistema YAP.']);

    // ── Construcción y Estilado de la Hoja de Trabajo ──────────────────────────
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Definición de bordes limpios
    const thinBorder = { style: 'thin', color: { rgb: 'CBD5E1' } }; // Slate-300
    const noBorder = { style: 'none' };

    // Estilar cada celda de forma dinámica basándose en su ubicación
    for (const key in ws) {
        if (key.startsWith('!')) continue;
        const cell = ws[key];
        const { r, c } = XLSX.utils.decode_cell(key);

        // Estructura de estilo base
        let cellStyle = {
            font: { name: 'Segoe UI', size: 10, color: { rgb: '0F172A' } },
            fill: { fgColor: { rgb: 'FFFFFF' } },
            border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            alignment: { vertical: 'center', horizontal: 'left' }
        };

        // Si es una celda que contiene valores monetarios, convertir a número real en Excel y formatear
        if (typeof cell.v === 'string' && cell.v.includes('$')) {
            const num = cleanNumber(cell.v);
            if (num !== null) {
                cell.v = num;
                cell.t = 'n';
                cell.z = '$#,##0';
            }
        }

        // Asignación de estilos específicos según la fila
        if (r === titleRow) {
            cellStyle.font = { name: 'Segoe UI', size: 13, bold: true, color: { rgb: '1E293B' } };
            cellStyle.border = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        } else if (r === mainTitleRow) {
            cellStyle.font = { name: 'Segoe UI', size: 11, bold: true, color: { rgb: '1A6FFF' } };
            cellStyle.border = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        } else if (r === subtitleRow || r === dateRow) {
            cellStyle.font = { name: 'Segoe UI', size: 9, italic: true, color: { rgb: '64748B' } };
            cellStyle.border = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        } else if (r === kpiTitleRow || r === tableTitleRow) {
            cellStyle.font = { name: 'Segoe UI', size: 10, bold: true, color: { rgb: '1E293B' } };
            cellStyle.fill = { fgColor: { rgb: 'F1F5F9' } }; // Fondo gris suave de sección
            cellStyle.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        } else if (r === kpiLabelsRow) {
            cellStyle.font = { name: 'Segoe UI', size: 9, bold: true, color: { rgb: 'FFFFFF' } };
            cellStyle.fill = { fgColor: { rgb: '0F172A' } }; // Encabezado de KPIs oscuro
            cellStyle.alignment = { horizontal: 'center', vertical: 'center' };
        } else if (r === kpiValuesRow) {
            cellStyle.font = { name: 'Segoe UI', size: 12, bold: true, color: { rgb: '10B981' } }; // Verde cian para montos consolidados
            cellStyle.fill = { fgColor: { rgb: 'F8FAFC' } };
            cellStyle.alignment = { horizontal: 'center', vertical: 'center' };
        } else if (r === tableHeaderRow) {
            cellStyle.font = { name: 'Segoe UI', size: 9, bold: true, color: { rgb: 'FFFFFF' } };
            cellStyle.fill = { fgColor: { rgb: '1A6FFF' } }; // Azul primario de YAP
            cellStyle.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
        } else if (r >= tableDataStartRow && r <= tableDataEndRow) {
            // Zebra striping (filas impares con fondo slate-50)
            if (r % 2 === 1) {
                cellStyle.fill = { fgColor: { rgb: 'F8FAFC' } };
            }
            
            // Reglas de alineación por columna
            if (c === 0) { // Obligación / ID
                cellStyle.font = { name: 'Consolas', size: 9, bold: true, color: { rgb: '1A6FFF' } };
                cellStyle.alignment = { horizontal: 'center', vertical: 'center' };
            } else if (c === 2 || c === 3 || c === 4 || c === 9) { // Cédula, Línea, Tasa E.A, Estado
                cellStyle.alignment = { horizontal: 'center', vertical: 'center' };
            } else if (c === 5) { // Días Mora
                cellStyle.alignment = { horizontal: 'center', vertical: 'center' };
                const days = parseInt(cell.v) || 0;
                if (days > 0) {
                    cellStyle.font = { name: 'Segoe UI', size: 10, bold: true, color: { rgb: 'EF4444' } }; // Rojo para alertar mora
                }
            } else if (c === 6 || c === 7 || c === 8) { // Montos de dinero
                cellStyle.alignment = { horizontal: 'right', vertical: 'center' };
            }
        } else if (r === footerRow) {
            cellStyle.font = { name: 'Segoe UI', size: 11, bold: true, color: { rgb: '0F172A' } };
            cellStyle.fill = { fgColor: { rgb: 'F1F5F9' } };
            cellStyle.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        } else if (r === disclaimerRow) {
            cellStyle.font = { name: 'Segoe UI', size: 9, italic: true, color: { rgb: '94A3B8' } };
            cellStyle.border = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        }

        cell.s = cellStyle;
    }

    // ── Ancho Dinámico de Columnas (Excluyendo títulos largos) ──────────────────
    const colWidths = Array.from({ length: maxCols }, () => ({ wch: 12 }));

    ws_data.forEach(row => {
        // Omitir el largo de los títulos principales y de secciones
        if (row.length <= 2) return;

        row.forEach((val, colIdx) => {
            if (val !== null && val !== undefined && val !== '') {
                const len = String(val).length;
                if (len > colWidths[colIdx].wch) {
                    colWidths[colIdx].wch = Math.min(50, len + 3);
                }
            }
        });
    });

    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Reporte YAP');

    // ── Descarga del archivo ───────────────────────────────────────────────────
    const safeFileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(wb, `${safeFileName}.xlsx`);
}

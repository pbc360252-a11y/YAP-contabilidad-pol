import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'
import { guardarExtractoHTML } from '../services/pdf.service.js'
import { subirPDFInformes } from '../services/storage.service.js'
import { enviarCorreoReporte } from '../services/email.service.js'
import { descifrarPersona } from '../services/crypto.service.js'
import Decimal from 'decimal.js'

const formatCOPTmp = (n) => '$' + Number(n || 0).toLocaleString('es-CO')

const router = Router()

const addCodigo = (p) => {
  if (!p) return p
  const num = p.numero_prestamo || 0
  return { ...p, codigo: p.codigo || `LYAP${String(num).padStart(5, '0')}` }
}

// ============================================================
// Generar Estado de Cuenta (Extracto) — Sin Puppeteer
// Ahora devuelve el HTML y una URL local para que el frontend
// lo abra en una nueva pestaña e imprima directamente.
// ============================================================
router.post('/generar-extracto/:prestamo_id', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
  try {
    const { prestamo_id } = req.params
    const prestamoRaw = await prisma.prestamo.findUnique({
      where: { id: prestamo_id },
      include: {
        persona: { include: { empresa: true } },
        tipo: true,
        cuotas: { orderBy: { numero_cuota: 'asc' } },
        pagos: { orderBy: { fecha_pago: 'desc' } }
      }
    })

    if (!prestamoRaw) return res.status(404).json({ error: 'Préstamo no encontrado' })

    const prestamo = addCodigo(prestamoRaw)
    // Descifrar datos de persona antes de usar en el extracto
    const persona = descifrarPersona(prestamo.persona)

    // Calcular saldo real pendiente
    const cuotasPendientes = prestamo.cuotas.filter(c => c.estado !== 'pagada')
    const saldoRealPendiente = cuotasPendientes.reduce((acc, c) =>
      new Decimal(acc).plus(c.cuota_total).toNumber(), 0)
    const cuotasPagadas = prestamo.cuotas.filter(c => c.estado === 'pagada').length
    const totalCuotas = prestamo.cuotas.length

    // Obtener configuración de la empresa
    const configs = await prisma.configuracion.findMany()
    const config = {}
    configs.forEach(c => config[c.clave] = c.valor)

    const htmlTemplate = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Estado de Cuenta - ${prestamo.codigo}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              color: #1e293b; 
              line-height: 1.4;
              background: #fff;
              font-size: 11px;
            }
            @media print {
              body { padding: 20px; }
              .no-print { display: none !important; }
            }
            .print-btn {
              position: fixed;
              top: 20px; right: 20px;
              background: #1a6fff;
              color: white;
              border: none;
              padding: 10px 24px;
              border-radius: 8px;
              font-weight: 700;
              font-size: 13px;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(26,111,255,0.4);
              transition: all 0.2s;
            }
            .print-btn:hover { background: #0e4fd6; transform: translateY(-1px); }
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start;
              border-bottom: 3px solid #1a6fff; 
              padding-bottom: 20px; 
              margin-bottom: 24px; 
            }
            .brand h1 { font-size: 18px; color: #0f172a; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; }
            .brand p { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; }
            .meta { text-align: right; }
            .meta .badge { 
              display: inline-block;
              background: #1a6fff; color: white;
              padding: 4px 12px; border-radius: 20px;
              font-size: 9px; font-weight: 800; letter-spacing: 0.1em;
              text-transform: uppercase; margin-bottom: 6px;
            }
            .meta .codigo { font-size: 16px; font-weight: 900; color: #0f172a; }
            .meta .fecha { font-size: 10px; color: #64748b; margin-top: 2px; }
            
            .alert-saldo {
              background: linear-gradient(135deg, #fef2f2, #fff5f5);
              border: 2px solid #fecaca;
              border-radius: 12px;
              padding: 16px 20px;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .alert-saldo .label { font-size: 10px; color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
            .alert-saldo .value { font-size: 22px; font-weight: 900; color: #dc2626; }

            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
            .info-box { 
              background: #f8fafc; 
              padding: 14px 16px; 
              border: 1px solid #e2e8f0; 
              border-radius: 10px;
            }
            .info-box h4 { 
              font-size: 9px; font-weight: 800; color: #1a6fff; 
              text-transform: uppercase; letter-spacing: 0.1em;
              margin-bottom: 10px; padding-bottom: 6px;
              border-bottom: 1px solid #e2e8f0;
            }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 10px; }
            .info-label { color: #64748b; font-weight: 600; }
            .info-value { color: #0f172a; font-weight: 700; }
            
            .estado-badge {
              display: inline-block; padding: 2px 8px; border-radius: 20px;
              font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
            }
            .estado-activo { background: #dcfce7; color: #166534; }
            .estado-mora { background: #fef2f2; color: #991b1b; }
            .estado-cancelado { background: #f1f5f9; color: #475569; }

            .section-title { 
              font-size: 10px; 
              font-weight: 800; 
              color: #fff; 
              background: linear-gradient(135deg, #0f172a, #1e293b);
              padding: 8px 14px;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              border-radius: 8px 8px 0 0;
              margin-top: 20px;
            }

            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
            thead th { 
              background-color: #f1f5f9; color: #334155; 
              font-weight: 800; padding: 9px 8px; 
              text-align: left; border: 1px solid #cbd5e1; 
              text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;
            }
            tbody td { padding: 8px; border: 1px solid #e2e8f0; color: #334155; }
            tbody tr:nth-child(even) td { background: #f8fafc; }
            .text-right { text-align: right; }
            .bold { font-weight: 800; }
            tfoot td { 
              background: #0f172a; color: #fff;
              font-weight: 800; padding: 10px 8px;
              font-size: 11px;
            }

            .footer-legal { 
              margin-top: 32px; 
              padding: 16px; 
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              font-size: 9px; 
              color: #64748b; 
              text-align: center;
              line-height: 1.6;
            }
            .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding: 0 20px; }
            .firma-box { text-align: center; }
            .firma-line { border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 40px; }
            .firma-line p { font-size: 9px; font-weight: 700; text-transform: uppercase; }
            .firma-line span { font-size: 8px; color: #64748b; }
          </style>
        </head>
        <body>
          <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>

          <div class="header">
            <div class="brand">
              <h1>${config.nombre_empresa || 'YAP (CRÉDITOS POR LIBRANZA)'}</h1>
              <p><strong>CRÉDITO POR LIBRANZA</strong> · NIT: ${config.nit_empresa || '900.000.000-1'}</p>
              <p style="margin-top:4px; color:#94a3b8; font-size:9px">Sistema de Gestión de Cartera · YAP Financial</p>
            </div>
            <div class="meta">
              <div class="badge">Estado de Cuenta</div>
              <div class="codigo">${prestamo.codigo}</div>
              <div class="fecha">Generado: ${new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' })}</div>
            </div>
          </div>

          <div class="alert-saldo">
            <div>
              <div class="label">💰 Saldo Total Pendiente de Pago</div>
              <div style="font-size:11px; color:#ef4444; margin-top:2px">${cuotasPagadas} de ${totalCuotas} cuotas pagadas</div>
            </div>
            <div class="value">${formatCOPTmp(saldoRealPendiente)}</div>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <h4>📋 Información del Cliente</h4>
              <div class="info-row"><span class="info-label">Cliente:</span><span class="info-value">${persona.primer_nombre} ${persona.primer_apellido}</span></div>
              <div class="info-row"><span class="info-label">Identificación:</span><span class="info-value">${persona.cedula}</span></div>
              <div class="info-row"><span class="info-label">Empresa:</span><span class="info-value">${persona.empresa?.nombre || 'General'}</span></div>
              <div class="info-row"><span class="info-label">Cargo:</span><span class="info-value">${persona.cargo || 'N/A'}</span></div>
              ${persona.celular ? `<div class="info-row"><span class="info-label">Celular:</span><span class="info-value">${persona.celular}</span></div>` : ''}
            </div>
            <div class="info-box">
              <h4>🏦 Datos del Crédito</h4>
              <div class="info-row"><span class="info-label">Código:</span><span class="info-value">${prestamo.codigo}</span></div>
              <div class="info-row"><span class="info-label">Monto Otorgado:</span><span class="info-value bold" style="color:#1a6fff">${formatCOPTmp(prestamo.monto_otorgado)}</span></div>
              <div class="info-row"><span class="info-label">Total a Pagar:</span><span class="info-value">${formatCOPTmp(prestamo.total_a_pagar)}</span></div>
              <div class="info-row"><span class="info-label">Cuotas Pagadas:</span><span class="info-value">${cuotasPagadas} / ${totalCuotas}</span></div>
              <div class="info-row"><span class="info-label">Estado:</span><span class="info-value"><span class="estado-badge estado-${prestamo.estado}">${prestamo.estado.toUpperCase()}</span></span></div>
            </div>
          </div>

          <div class="section-title">📅 Historial de Pagos</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuota N°</th>
                <th>Comprobante</th>
                <th class="text-right">Abono Capital</th>
                <th class="text-right">Intereses</th>
                <th class="text-right">Total Pagado</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              ${prestamo.pagos.length === 0 
                ? '<tr><td colspan="7" style="text-align:center; padding:16px; color:#94a3b8; font-style:italic">No hay pagos registrados</td></tr>'
                : prestamo.pagos.map(p => {
                    const cuotaAsociada = prestamo.cuotas.find(c => c.numero_cuota === p.numero_cuota)
                    const capitalAbono = cuotaAsociada ? cuotaAsociada.capital_cuota : (p.monto_pagado - p.interes_mora_cobrado)
                    const interesesCobrados = cuotaAsociada ? (p.monto_pagado - cuotaAsociada.capital_cuota) : p.interes_mora_cobrado
                    return `
                    <tr>
                      <td>${new Date(p.fecha_pago).toLocaleDateString('es-CO')}</td>
                      <td style="text-align:center; font-weight:700">#${p.numero_cuota}</td>
                      <td style="font-size:9px; color:#64748b">${p.numero_comprobante || '-'}</td>
                      <td class="text-right">${formatCOPTmp(capitalAbono)}</td>
                      <td class="text-right" style="color:#dc2626">${formatCOPTmp(interesesCobrados)}</td>
                      <td class="text-right bold" style="color:#0f172a">${formatCOPTmp(p.monto_pagado)}</td>
                      <td style="font-size:9px">${p.metodo_pago || 'Transferencia'}</td>
                    </tr>
                    `
                  }).join('')
              }
            </tbody>
            ${prestamo.pagos.length > 0 ? `
            <tfoot>
              <tr>
                <td colspan="5" style="text-align:right">TOTAL RECAUDADO:</td>
                <td class="text-right">${formatCOPTmp(prestamo.pagos.reduce((acc, p) => acc + p.monto_pagado, 0))}</td>
                <td></td>
              </tr>
            </tfoot>` : ''}
          </table>

          <div class="section-title">🔮 Próximos Vencimientos</div>
          <table>
            <thead>
              <tr>
                <th>N° Cuota</th>
                <th>Fecha Vencimiento</th>
                <th class="text-right">Valor Cuota</th>
                <th class="text-right">Mora Estimada</th>
                <th class="text-right">Saldo Pendiente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${prestamo.cuotas.filter(c => c.estado !== 'pagada').slice(0, 8).map(c => `
                <tr>
                  <td style="text-align:center; font-weight:700">${c.numero_cuota}</td>
                  <td>${new Date(c.fecha_programada).toLocaleDateString('es-CO')}</td>
                  <td class="text-right bold">${formatCOPTmp(c.cuota_total)}</td>
                  <td class="text-right" style="color:#dc2626">${c.interes_mora > 0 ? formatCOPTmp(c.interes_mora) : '-'}</td>
                  <td class="text-right bold">${formatCOPTmp(c.saldo_final)}</td>
                  <td><span style="
                    background:${c.estado === 'vencida' ? '#fef2f2' : '#f0fdf4'};
                    color:${c.estado === 'vencida' ? '#dc2626' : '#166534'};
                    padding:2px 8px; border-radius:20px; font-size:8px; font-weight:800;
                  ">${c.estado.toUpperCase()}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="firmas">
            <div class="firma-box">
              <div class="firma-line">
                <p>Firma del Cliente</p>
                <span>C.C. ${persona.cedula}</span>
              </div>
            </div>
            <div class="firma-box">
              <div class="firma-line">
                <p>Aprobación YAP</p>
                <span>Control Interno · YAP Financial</span>
              </div>
            </div>
          </div>

          <div class="footer-legal">
            Este documento es una copia informativa del estado de su obligación financiera con YAP (Créditos por Libranza).<br>
            Los valores pueden variar según la puntualidad de los pagos y las tasas vigentes. Para más información, comuníquese con su asesor.<br>
            <strong>YAP Financial · Sistema de Gestión de Cartera v2.5</strong>
          </div>
        </body>
      </html>
    `

    const fileName = `Extracto_${persona.cedula}_${prestamo.codigo}`
    
    // Guardar HTML localmente (sin Puppeteer, sin consumir RAM)
    let localUrl = null
    try {
      const resultado = await guardarExtractoHTML(htmlTemplate, fileName + '.html')
      localUrl = resultado.localPath
    } catch (e) {
      console.log('[Informes] Error guardando extracto HTML:', e.message)
    }

    // Intentar subir a Supabase Storage si está configurado
    let publicUrl = localUrl
    try {
      const htmlBuffer = Buffer.from(htmlTemplate, 'utf-8')
      publicUrl = await subirPDFInformes(fileName + '.html', htmlBuffer) || localUrl
    } catch (e) {
      console.log('[Informes] Supabase Storage no disponible, usando ruta local:', e.message)
    }

    // Enviar correo si el cliente tiene correo registrado
    let correoEnviado = false
    if (persona.correo) {
      try {
        const htmlBuffer = Buffer.from(htmlTemplate, 'utf-8')
        await enviarCorreoReporte(persona.correo, persona.primer_nombre, htmlBuffer, fileName + '.html')
        correoEnviado = true
      } catch (e) {
        console.log('[Informes] Error enviando correo:', e.message)
      }
    }

    res.json({
      mensaje: 'Extracto generado correctamente',
      url: publicUrl,
      htmlContent: htmlTemplate,  // El frontend puede abrir esto en una nueva pestaña
      correo: correoEnviado ? 'Enviado al cliente' : (persona.correo ? 'Error al enviar correo' : 'Sin correo registrado')
    })
  } catch (error) {
    console.error('[Informes] Error generando extracto:', error)
    res.status(500).json({ error: 'Falla al generar el extracto' })
  }
})

export default router

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Resend } from 'resend'
import { prisma } from '../lib/prisma.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Obtiene la configuración del servicio de correo dinámicamente desde la base de datos,
 * cayendo a las variables de entorno como fallback secundario.
 */
async function obtenerConfiguracionEmail() {
    try {
        const configs = await prisma.configuracion.findMany({
            where: {
                clave: { in: ['email_resend_api_key', 'email_from', 'email_reply_to'] }
            }
        })
        const configMap = {}
        configs.forEach(c => configMap[c.clave] = c.valor)

        const apiKey = configMap['email_resend_api_key'] || process.env.RESEND_API_KEY
        const from = configMap['email_from'] || process.env.EMAIL_FROM || 'YAP Créditos <no-reply@yap.com.co>'
        const replyTo = configMap['email_reply_to'] || process.env.EMAIL_REPLY_TO || null

        const resendInstance = apiKey ? new Resend(apiKey) : null

        return {
            resend: resendInstance,
            EMAIL_FROM: from,
            EMAIL_REPLY_TO: replyTo,
            configurado: !!apiKey,
            apiKey: apiKey || ''
        }
    } catch (err) {
        console.error('[EmailService] Error al obtener configuración de base de datos:', err.message)
        const apiKey = process.env.RESEND_API_KEY
        return {
            resend: apiKey ? new Resend(apiKey) : null,
            EMAIL_FROM: process.env.EMAIL_FROM || 'YAP Créditos <no-reply@yap.com.co>',
            EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || null,
            configurado: !!apiKey,
            apiKey: apiKey || ''
        }
    }
}

/**
 * Función de reintento con backoff exponencial para envíos de correo.
 * @param {Function} fn - Función async a reintentar
 * @param {number} intentos - Número máximo de intentos
 * @param {number} delayMs - Tiempo base de espera entre intentos (ms)
 */
async function conReintentos(fn, intentos = 3, delayMs = 1000) {
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            return await fn()
        } catch (err) {
            if (intento === intentos) throw err
            const espera = delayMs * Math.pow(2, intento - 1) // 1s, 2s, 4s
            console.warn(`[EmailService] Intento ${intento}/${intentos} fallido. Reintentando en ${espera}ms...`)
            await new Promise(r => setTimeout(r, espera))
        }
    }
}

/**
 * Genera una plantilla de correo electrónico HTML Premium con diseño responsivo, cian/oscuro.
 * @param {string} nombreCompleto 
 * @param {number} numeroTurno 
 * @returns {string} HTML del correo
 */
function generarTemplateHTML(nombreCompleto, numeroTurno) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a YAP - Crédito en Estudio</title>
    <style>
        body {
            background-color: #060c1b;
            color: #d1d5db;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 40px 10px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #0d1527;
            border: 1px solid #1e2d4a;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
        }
        .header {
            background: linear-gradient(135deg, #1a6fff 0%, #00d4ff 100%);
            padding: 40px 30px;
            text-align: center;
        }
        .logo-text {
            color: #ffffff;
            margin: 0;
            font-size: 36px;
            font-weight: 900;
            letter-spacing: 4px;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        .logo-sub {
            color: rgba(255, 255, 255, 0.85);
            margin: 5px 0 0 0;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome {
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .text {
            line-height: 1.6;
            margin-bottom: 30px;
            font-size: 15px;
            color: #a0aec0;
        }
        .highlight {
            color: #00d4ff;
            font-weight: 600;
        }
        .badge-container {
            text-align: center;
            background: rgba(0, 212, 255, 0.03);
            border: 1px dashed rgba(0, 212, 255, 0.2);
            border-radius: 20px;
            padding: 24px;
            margin-bottom: 30px;
        }
        .badge-title {
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            color: #00d4ff;
            letter-spacing: 2px;
            margin-bottom: 8px;
        }
        .badge-value {
            font-size: 58px;
            font-weight: 950;
            color: #ffffff;
            line-height: 1;
            margin: 0;
            text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
        }
        .badge-subtitle {
            font-size: 11px;
            color: #718096;
            margin-top: 10px;
            font-weight: 500;
        }
        .steps {
            background-color: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .step-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 15px;
        }
        .step-item:last-child {
            margin-bottom: 0;
        }
        .step-num {
            background-color: #1a6fff;
            color: #ffffff;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .step-text {
            font-size: 14px;
            color: #cbd5e0;
            line-height: 1.4;
        }
        .footer {
            background-color: #090e1a;
            padding: 30px 20px;
            text-align: center;
            border-top: 1px solid #1e2d4a;
            font-size: 11px;
            color: #718096;
        }
        .footer p {
            margin: 0 0 8px 0;
        }
        .footer p:last-child {
            margin-bottom: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo-text">YAP</h1>
            <p class="logo-sub">Créditos al instante</p>
        </div>
        <div class="content">
            <h2 class="welcome">¡Hola, ${nombreCompleto}!</h2>
            <p class="text">
                Queremos darte la bienvenida oficial a **YAP**. Tu información ha sido registrada con éxito en nuestra plataforma para el estudio de tu crédito por libranza.
            </p>
            
            <div class="badge-container">
                <p class="badge-title">Tu Número en la Fila</p>
                <p class="badge-value">#${numeroTurno}</p>
                <p class="badge-subtitle">Asignado de forma exacta en tu orden de ingreso al sistema</p>
            </div>

            <h3 style="color: #ffffff; font-size: 16px; font-weight: 700; margin-bottom: 15px;">¿Qué sigue ahora?</h3>
            <div class="steps">
                <div class="step-item">
                    <div class="step-num">1</div>
                    <div class="step-text"><strong>Validación Interna:</strong> Nuestro equipo de analistas de libranza revisará tu solicitud de crédito.</div>
                </div>
                <div class="step-item">
                    <div class="step-num">2</div>
                    <div class="step-text"><strong>Contacto Telefónico:</strong> Nos pondremos en contacto al número celular registrado para coordinar los detalles.</div>
                </div>
                <div class="step-item">
                    <div class="step-num">3</div>
                    <div class="step-text"><strong>Desembolso:</strong> Una vez aprobado, el dinero se transferirá directamente a tu cuenta configurada.</div>
                </div>
            </div>

            <p class="text" style="margin-bottom: 0; text-align: center; font-size: 14px;">
                Si tienes alguna pregunta, no dudes en responder a este correo. ¡Gracias por confiar en nosotros!
            </p>
        </div>
        <div class="footer">
            <p><strong>YAP S.A.S. - Gestión Administrativa Coraza</strong></p>
            <p>Este es un correo automático. Por favor no lo respondas directamente si no lo requieres.</p>
        </div>
    </div>
</body>
</html>`
}

/**
 * Envía el correo de confirmación de registro a un cliente.
 * Si no hay llaves SMTP configuradas, guarda la visualización local en temp_emails/
 * @param {object} params
 * @param {string} params.email Correo de destino
 * @param {string} params.nombreCompleto Nombre del cliente
 * @param {number} params.numeroTurno Número de fila
 */
export async function enviarConfirmacionRegistro({ email, nombreCompleto, numeroTurno }) {
    const htmlContent = generarTemplateHTML(nombreCompleto, numeroTurno)
    const { resend, EMAIL_FROM, EMAIL_REPLY_TO } = await obtenerConfiguracionEmail()

    console.log(`[EmailService] Procesando correo para: ${email} (Turno #${numeroTurno})`)
        try {
            console.log('[EmailService] Enviando vía Resend API...')
            await conReintentos(() => resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
                subject: `¡Registro Exitoso en YAP! Tu número en la fila es #${numeroTurno}`,
                html: htmlContent,
            }))
            console.log('[EmailService] ✅ Correo enviado exitosamente vía Resend!')
            return { sent: true, method: 'resend' }
        } catch (error) {
            resendError = error.message
            console.error('[EmailService] ❌ Falló envío por Resend (3 intentos agotados):', error.message)
            // Procedemos al fallback local
        }
    }

    // Caso 2: Fallback local para pruebas y simulación visual
    try {
        const tempDir = path.join(__dirname, '../../temp_emails')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }

        // Crear nombre de archivo amigable
        const safeName = nombreCompleto.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const filename = `registro_yap_turno_${numeroTurno}_${safeName}.html`
        const filePath = path.join(tempDir, filename)

        fs.writeFileSync(filePath, htmlContent, 'utf-8')

        console.log('\n=============================================================')
        console.log('📬 [EMAIL SIMULATOR - FALLBACK LOCAL]')
        console.log(`Cliente: ${nombreCompleto}`)
        console.log(`Destino: ${email}`)
        console.log(`Asunto: ¡Registro Exitoso en YAP! Turno #${numeroTurno}`)
        console.log(`Archivo HTML generado para vista previa visual local:`)
        console.log(`👉 file:///${filePath.replace(/\\/g, '/')}`)
        console.log('=============================================================\n')

        return { sent: true, method: 'fallback_file', path: filePath, resendAttempted: !!resend, resendError }
    } catch (fsError) {
        console.error('[EmailService] Error crítico al escribir el archivo de simulación local:', fsError.message)
        return { sent: false, error: fsError.message }
    }
}

/**
 * Envía una notificación por correo al administrador sobre una nueva solicitud de crédito.
 */
export async function enviarNotificacionAdminNuevaSolicitud({
    emailAdmin,
    nombreCompleto,
    cedula,
    emailCliente,
    celular,
    empresaNombre,
    cargo,
    montoRequerido,
    observaciones
}) {
    const formattedMonto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(montoRequerido || 0)
    const { resend, EMAIL_FROM } = await obtenerConfiguracionEmail()
    
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nueva Solicitud de Crédito Recibida</title>
    <style>
        body {
            background-color: #060c1b;
            color: #d1d5db;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 40px 10px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #0d1527;
            border: 1px solid #1e2d4a;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
        }
        .header {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            padding: 30px 20px;
            text-align: center;
        }
        .logo-text {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 900;
            letter-spacing: 3px;
        }
        .content {
            padding: 40px 30px;
        }
        .title {
            font-size: 20px;
            font-weight: 800;
            color: #ffffff;
            margin-top: 0;
            margin-bottom: 20px;
            text-align: center;
        }
        .highlight-box {
            background: rgba(16, 185, 129, 0.05);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: center;
        }
        .highlight-title {
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            color: #10B981;
            letter-spacing: 2px;
            margin-bottom: 5px;
        }
        .highlight-value {
            font-size: 36px;
            font-weight: 900;
            color: #ffffff;
            margin: 0;
            text-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
        }
        .table-info {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            overflow: hidden;
        }
        .table-info td {
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 14px;
        }
        .table-info tr:last-child td {
            border-bottom: none;
        }
        .label {
            color: #718096;
            font-weight: 700;
            width: 35%;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 1px;
        }
        .value {
            color: #ffffff;
            font-weight: 500;
        }
        .obs-box {
            background-color: rgba(255, 255, 255, 0.02);
            border-radius: 12px;
            padding: 15px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 13px;
            line-height: 1.5;
            color: #cbd5e0;
            margin-bottom: 30px;
        }
        .footer {
            background-color: #090e1a;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #1e2d4a;
            font-size: 11px;
            color: #718096;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo-text">YAP ADMIN</h1>
        </div>
        <div class="content">
            <h2 class="title">🔔 Nueva Solicitud Recibida</h2>
            <p style="color: #a0aec0; text-align: center; font-size: 14px; margin-bottom: 25px;">
                Un cliente ha diligenciado el formulario público de solicitud de crédito.
            </p>
            
            <div class="highlight-box">
                <p class="highlight-title">Monto Solicitado</p>
                <p class="highlight-value">${formattedMonto}</p>
            </div>

            <table class="table-info">
                <tr>
                    <td class="label">Cliente</td>
                    <td class="value">${nombreCompleto}</td>
                </tr>
                <tr>
                    <td class="label">Cédula</td>
                    <td class="value">${cedula}</td>
                </tr>
                <tr>
                    <td class="label">Celular</td>
                    <td class="value">${celular || '-'}</td>
                </tr>
                <tr>
                    <td class="label">Correo</td>
                    <td class="value">${emailCliente || '-'}</td>
                </tr>
                <tr>
                    <td class="label">Empresa</td>
                    <td class="value">${empresaNombre || '-'}</td>
                </tr>
                <tr>
                    <td class="label">Cargo</td>
                    <td class="value">${cargo || '-'}</td>
                </tr>
            </table>

            {OBSERVACIONES_PLACEHOLDER}
        </div>
        <div class="footer">
            <p><strong>YAP S.A.S. - Sistema de Notificaciones Administrativas</strong></p>
        </div>
    </div>
</body>
</html>`.replace(
        '{OBSERVACIONES_PLACEHOLDER}',
        observaciones
            ? `<h3 style="color: #ffffff; font-size: 14px; font-weight: 700; margin-bottom: 10px;">Observaciones del Cliente:</h3>
               <div class="obs-box">${observaciones}</div>`
            : ''
    )

    console.log(`[EmailService] Notificando al administrador (${emailAdmin}) sobre nueva solicitud de: ${nombreCompleto}`)

    if (resend) {
        try {
            await conReintentos(() => resend.emails.send({
                from: EMAIL_FROM,
                to: emailAdmin,
                subject: `🔔 Nueva Solicitud de Crédito - ${nombreCompleto} (${formattedMonto})`,
                html: htmlContent,
            }))
            console.log('[EmailService] ✅ Alerta de nueva solicitud enviada al administrador vía Resend!')
            return { sent: true, method: 'resend' }
        } catch (error) {
            console.error('[EmailService] ❌ Falló envío de alerta a administrador por Resend:', error.message)
        }
    }

    // Fallback local
    try {
        const tempDir = path.join(__dirname, '../../temp_emails')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }
        const safeName = nombreCompleto.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const filename = `alerta_admin_nueva_solicitud_${safeName}.html`
        const filePath = path.join(tempDir, filename)

        fs.writeFileSync(filePath, htmlContent, 'utf-8')
        console.log('\n=============================================================')
        console.log('📬 [EMAIL SIMULATOR - ALERTA ADMINISTRADOR]')
        console.log(`Admin destino: ${emailAdmin}`)
        console.log(`Cliente: ${nombreCompleto} (CC: ${cedula})`)
        console.log(`Monto: ${formattedMonto}`)
        console.log(`Archivo de alerta HTML generado para vista previa:`)
        console.log(`👉 file:///${filePath.replace(/\\/g, '/')}`)
        console.log('=============================================================\n')
        return { sent: true, method: 'fallback_file', path: filePath }
    } catch (fsError) {
        console.error('[EmailService] Error crítico al escribir alerta local:', fsError.message)
        return { sent: false, error: fsError.message }
    }
}

/**
 * Envía un correo con el extracto PDF adjunto al cliente (usado desde informes.routes.js).
 * Si no hay Resend configurado, guarda la visualización local.
 * @param {string} email Correo destino
 * @param {string} nombre Nombre del cliente
 * @param {Buffer} pdfBuffer Buffer del PDF a adjuntar
 * @param {string} fileName Nombre del archivo PDF
 */
export async function enviarCorreoReporte(email, nombre, pdfBuffer, fileName) {
    console.log(`[EmailService] Enviando extracto a: ${email}`)
    const { resend, EMAIL_FROM, EMAIL_REPLY_TO } = await obtenerConfiguracionEmail()

    if (resend) {
        try {
            await conReintentos(() => resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
                subject: `Tu Estado de Cuenta YAP - ${new Date().toLocaleDateString('es-CO')}`,
                html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
                        <h2 style="color:#1a6fff">YAP Créditos por Libranza</h2>
                        <p>Hola <strong>${nombre}</strong>,</p>
                        <p>Adjunto encontrarás tu estado de cuenta actualizado.</p>
                        <p>Si tienes preguntas, responde a este correo.</p>
                        <p style="margin-top:24px"><strong>Equipo YAP</strong></p>
                    </div>`,
                attachments: [
                    {
                        filename: fileName,
                        content: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : Buffer.from(pdfBuffer).toString('base64'),
                        content_type: 'text/html',
                    }
                ]
            }))
            console.log('[EmailService] ✅ Extracto enviado exitosamente vía Resend!')
            return { sent: true, method: 'resend' }
        } catch (error) {
            console.error('[EmailService] ❌ Error enviando extracto por Resend:', error.message)
        }
    }

    // Fallback: guardar aviso en consola y archivo local
    console.log(`\n[EmailService] 📋 FALLBACK: Extracto listo para envío manual`)
    console.log(`  Destinatario: ${email} (${nombre})`)
    console.log(`  Archivo: ${fileName} (${pdfBuffer?.length || 0} bytes)`)
    console.log(`  Configure RESEND_API_KEY en .env para envío automático\n`)
    return { sent: false, method: 'fallback_log' }
}

/**
 * Verifica si el servicio de correo está correctamente configurado.
 * Útil para la ruta de diagnóstico /api/auth/test-email
 * @returns {object} Estado del servicio
 */
export async function diagnosticarEmailService() {
    const config = await obtenerConfiguracionEmail()

    let apiKeyEnmascarada = ''
    if (config.apiKey) {
        const keyStr = String(config.apiKey)
        if (keyStr.length > 8) {
            apiKeyEnmascarada = `${keyStr.slice(0, 6)}...${keyStr.slice(-4)}`
        } else {
            apiKeyEnmascarada = '••••••••'
        }
    }

    return {
        configurado: config.configurado,
        remitente: config.EMAIL_FROM,
        modo: config.resend ? 'resend_api' : 'fallback_local',
        apiKey: apiKeyEnmascarada,
        instrucciones: config.resend ? null : [
            'Configurar la API Key de Resend en el formulario inferior.',
            'Verificar dominio en https://resend.com',
            'Configurar el Remitente (EMAIL_FROM) en el formulario inferior.'
        ]
    }
}

/**
 * Envía recordatorio de pago próximo a vencer (llamado por el cron quincenal).
 * Si RESEND_API_KEY no está configurada, el fallo es silencioso (solo log).
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.nombreCompleto
 * @param {number} params.numeroCuota
 * @param {number} params.montoCuota
 * @param {Date}   params.fechaVencimiento
 * @param {string} params.tipoPrestamo
 */
export async function enviarRecordatorioPago({ email, nombreCompleto, numeroCuota, montoCuota, fechaVencimiento, tipoPrestamo }) {
    const formatCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
    const formatFecha = (d) => new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    const { resend, EMAIL_FROM } = await obtenerConfiguracionEmail()

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recordatorio de Pago — YAP</title>
  <style>
    body { background:#060c1b; color:#d1d5db; font-family:'Segoe UI',system-ui,sans-serif; margin:0; padding:40px 10px; }
    .box { max-width:560px; margin:0 auto; background:#0d1527; border:1px solid #1e2d4a; border-radius:20px; overflow:hidden; }
    .hdr { background:linear-gradient(135deg,#f59e0b,#d97706); padding:28px; text-align:center; }
    .hdr h1 { color:#fff; margin:0; font-size:28px; font-weight:900; letter-spacing:3px; }
    .hdr p  { color:rgba(255,255,255,.85); margin:4px 0 0; font-size:11px; letter-spacing:3px; text-transform:uppercase; }
    .body { padding:32px 28px; }
    .alert { background:rgba(245,158,11,.06); border:1px solid rgba(245,158,11,.25); border-radius:14px; padding:20px; text-align:center; margin-bottom:24px; }
    .alert-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#f59e0b; font-weight:700; margin-bottom:6px; }
    .alert-value { font-size:42px; font-weight:900; color:#fff; margin:0; }
    .alert-sub { font-size:12px; color:#9ca3af; margin-top:6px; }
    table { width:100%; border-collapse:collapse; margin-bottom:24px; }
    td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.05); font-size:14px; }
    .lbl { color:#6b7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; width:40%; }
    .val { color:#fff; }
    .ftr { background:#090e1a; padding:20px; text-align:center; border-top:1px solid #1e2d4a; font-size:11px; color:#6b7280; }
  </style>
</head>
<body>
  <div class="box">
    <div class="hdr"><h1>YAP</h1><p>Recordatorio de Pago</p></div>
    <div class="body">
      <p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 16px">Hola, ${nombreCompleto} 👋</p>
      <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 20px">
        Te recordamos que tu próxima cuota de libranza vence pronto. Te invitamos a verificar que tu nómina esté al día para evitar recargos por mora.
      </p>
      <div class="alert">
        <p class="alert-label">Monto a descontar</p>
        <p class="alert-value">${formatCOP(montoCuota)}</p>
        <p class="alert-sub">Cuota N° ${numeroCuota} — ${tipoPrestamo}</p>
      </div>
      <table>
        <tr><td class="lbl">Fecha límite</td><td class="val">${formatFecha(fechaVencimiento)}</td></tr>
        <tr><td class="lbl">Modalidad</td><td class="val">Descuento automático por nómina</td></tr>
        <tr><td class="lbl">Cuota N°</td><td class="val">${numeroCuota}</td></tr>
      </table>
      <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin:0">
        Si ya realizaste tu pago o tienes alguna inquietud, comunícate con tu área de nómina o responde este correo.
      </p>
    </div>
    <div class="ftr"><p><strong>YAP S.A.S. — Créditos por Libranza</strong></p><p>Notificación automática — no responder directamente.</p></div>
  </div>
</body>
</html>`

    if (resend) {
        try {
            await resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                subject: `⚠️ Recordatorio: Tu cuota N°${numeroCuota} vence el ${formatFecha(fechaVencimiento)}`,
                html
            })
            return { sent: true }
        } catch (err) {
            console.warn(`[EmailService] Recordatorio no enviado a ${email}:`, err.message)
        }
    }

    // Fallback: solo log (no bloquear el cron si Resend no está configurado)
    console.log(`[EmailService][Recordatorio] ${email} | Cuota ${numeroCuota} | ${formatFecha(fechaVencimiento)} | ${formatCOP(montoCuota)}`)
    return { sent: false, method: 'fallback_log' }
}

/**
 * Genera la plantilla de confirmación de desembolso en formato HTML.
 */
function generarTemplateDesembolsoHTML(nombreCompleto, montoDesembolsado, codigoPrestamo) {
    const formatCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal/login`

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Desembolso — YAP</title>
    <style>
        body {
            background-color: #060c1b;
            color: #d1d5db;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 40px 10px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #0d1527;
            border: 1px solid #1e2d4a;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #00d4ff 100%);
            padding: 40px 30px;
            text-align: center;
        }
        .logo-text {
            color: #ffffff;
            margin: 0;
            font-size: 36px;
            font-weight: 900;
            letter-spacing: 4px;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        .logo-sub {
            color: rgba(255, 255, 255, 0.85);
            margin: 5px 0 0 0;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome {
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .text {
            line-height: 1.6;
            margin-bottom: 30px;
            font-size: 15px;
            color: #a0aec0;
        }
        .highlight-box {
            text-align: center;
            background: rgba(16, 185, 129, 0.05);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 20px;
            padding: 24px;
            margin-bottom: 30px;
        }
        .highlight-title {
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            color: #10b981;
            letter-spacing: 2px;
            margin-bottom: 8px;
        }
        .highlight-value {
            font-size: 44px;
            font-weight: 950;
            color: #ffffff;
            line-height: 1;
            margin: 0;
            text-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
        }
        .highlight-subtitle {
            font-size: 12px;
            color: #718096;
            margin-top: 10px;
            font-weight: 500;
        }
        .steps {
            background-color: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .step-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 18px;
        }
        .step-item:last-child {
            margin-bottom: 0;
        }
        .step-num {
            background-color: #1a6fff;
            color: #ffffff;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .step-text {
            font-size: 14px;
            color: #cbd5e0;
            line-height: 1.4;
        }
        .btn-portal {
            display: inline-block;
            background: linear-gradient(135deg, #1a6fff 0%, #00d4ff 100%);
            color: #ffffff !important;
            text-decoration: none;
            font-weight: 700;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 2px;
            padding: 16px 32px;
            border-radius: 50px;
            text-align: center;
            box-shadow: 0 8px 24px rgba(26, 111, 255, 0.35);
            transition: all 0.3s;
            margin: 10px auto 30px;
        }
        .footer {
            background-color: #090e1a;
            padding: 30px 20px;
            text-align: center;
            border-top: 1px solid #1e2d4a;
            font-size: 11px;
            color: #718096;
        }
        .footer p {
            margin: 0 0 8px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo-text">YAP</h1>
            <p class="logo-sub">Crédito Desembolsado</p>
        </div>
        <div class="content">
            <h2 class="welcome">¡Buenas noticias, ${nombreCompleto}! 🎉</h2>
            <p class="text">
                Te informamos que tu solicitud de crédito por libranza con referencia <strong style="color:#ffffff">${codigoPrestamo}</strong> ha sido aprobada y el capital ha sido desembolsado exitosamente a tu cuenta bancaria.
            </p>
            
            <div class="highlight-box">
                <p class="highlight-title">Monto Desembolsado</p>
                <p class="highlight-value">${formatCOP(montoDesembolsado)}</p>
                <p class="highlight-subtitle">Transacción realizada de forma exitosa</p>
            </div>

            <h3 style="color: #ffffff; font-size: 16px; font-weight: 700; margin-bottom: 15px;">¿Cómo consultar tu plan de pagos?</h3>
            <p class="text">
                Puedes hacer seguimiento autónomo a tu préstamo, cuotas pagadas y fechas de vencimiento ingresando al Portal de Clientes.
            </p>

            <div style="text-align: center;">
                <a href="${portalUrl}" class="btn-portal">Ingresar al Portal</a>
            </div>

            <div class="steps">
                <h4 style="color: #ffffff; font-size: 14px; font-weight: 700; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Instrucciones para primer ingreso:</h4>
                <div class="step-item">
                    <div class="step-num">1</div>
                    <div class="step-text">Ingresa tu número de <strong>Cédula de Ciudadanía</strong> tanto en el campo de <strong>Usuario</strong> como de <strong>Contraseña / PIN</strong>.</div>
                </div>
                <div class="step-item">
                    <div class="step-num">2</div>
                    <div class="step-text">El sistema te guiará inmediatamente para definir un <strong>nuevo PIN personal de 4 dígitos</strong>.</div>
                </div>
                <div class="step-item">
                    <div class="step-num">3</div>
                    <div class="step-text"><strong style="color:#10b981">¡Recuerda!</strong> Anota y guarda ese PIN de 4 dígitos en un lugar seguro para tus futuros ingresos.</div>
                </div>
            </div>
        </div>
        <div class="footer">
            <p><strong>YAP S.A.S. — Créditos por Libranza</strong></p>
            <p>Este es un correo automático. Por favor no lo respondas directamente si no lo requieres.</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Envía la notificación de desembolso al cliente.
 */
export async function enviarConfirmacionDesembolso({ email, nombreCompleto, montoDesembolsado, codigoPrestamo }) {
    const htmlContent = generarTemplateDesembolsoHTML(nombreCompleto, montoDesembolsado, codigoPrestamo)
    const formatCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
    const { resend, EMAIL_FROM, EMAIL_REPLY_TO } = await obtenerConfiguracionEmail()

    console.log(`[EmailService] Procesando correo de desembolso para: ${email} (Monto: ${formatCOP(montoDesembolsado)})`)

    let resendError = null
    if (resend) {
        try {
            console.log('[EmailService] Enviando desembolso vía Resend API...')
            await conReintentos(() => resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
                subject: `🎉 ¡Tu desembolso de ${formatCOP(montoDesembolsado)} está listo! — YAP`,
                html: htmlContent,
            }))
            console.log('[EmailService] ✅ Correo de desembolso enviado exitosamente vía Resend!')
            return { sent: true, method: 'resend' }
        } catch (error) {
            resendError = error.message
            console.error('[EmailService] ❌ Falló envío de desembolso por Resend:', error.message)
        }
    }

    // Fallback local
    try {
        const tempDir = path.join(__dirname, '../../temp_emails')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }
        const safeName = nombreCompleto.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const filename = `desembolso_yap_${codigoPrestamo}_${safeName}.html`
        const filePath = path.join(tempDir, filename)

        fs.writeFileSync(filePath, htmlContent, 'utf-8')

        console.log('\n=============================================================')
        console.log('📬 [EMAIL SIMULATOR - CONFIRMACIÓN DESEMBOLSO]')
        console.log(`Deudor: ${nombreCompleto}`)
        console.log(`Destino: ${email}`)
        console.log(`Préstamo: ${codigoPrestamo}`)
        console.log(`Monto: ${formatCOP(montoDesembolsado)}`)
        console.log(`Archivo de confirmación HTML generado:`)
        console.log(`👉 file:///${filePath.replace(/\\/g, '/')}`)
        console.log('=============================================================\n')

        return { sent: true, method: 'fallback_file', path: filePath, resendAttempted: !!resend, resendError }
    } catch (fsError) {
        console.error('[EmailService] Error crítico al escribir confirmación local:', fsError.message)
        return { sent: false, error: fsError.message }
    }
}

/**
 * Genera la plantilla de confirmación de pago en formato HTML.
 */
function generarTemplatePagoHTML(nombreCompleto, montoPagado, saldoRestante, numeroCuota, comprobante) {
    const formatCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal/login`

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Pago Recibido — YAP</title>
    <style>
        body {
            background-color: #060c1b;
            color: #d1d5db;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 40px 10px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #0d1527;
            border: 1px solid #1e2d4a;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 40px 30px;
            text-align: center;
        }
        .logo-text {
            color: #ffffff;
            margin: 0;
            font-size: 36px;
            font-weight: 900;
            letter-spacing: 4px;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        .logo-sub {
            color: rgba(255, 255, 255, 0.85);
            margin: 5px 0 0 0;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome {
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .text {
            line-height: 1.6;
            margin-bottom: 30px;
            font-size: 15px;
            color: #a0aec0;
        }
        .highlight-box {
            text-align: center;
            background: rgba(16, 185, 129, 0.05);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 20px;
            padding: 24px;
            margin-bottom: 30px;
        }
        .highlight-title {
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            color: #10b981;
            letter-spacing: 2px;
            margin-bottom: 8px;
        }
        .highlight-value {
            font-size: 44px;
            font-weight: 950;
            color: #ffffff;
            line-height: 1;
            margin: 0;
            text-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
        }
        .highlight-subtitle {
            font-size: 12px;
            color: #718096;
            margin-top: 10px;
            font-weight: 500;
        }
        .table-info {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            overflow: hidden;
        }
        .table-info td {
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 14px;
        }
        .table-info tr:last-child td {
            border-bottom: none;
        }
        .label {
            color: #718096;
            font-weight: 700;
            width: 40%;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 1px;
        }
        .value {
            color: #ffffff;
            font-weight: 500;
        }
        .footer {
            background-color: #090e1a;
            padding: 30px 20px;
            text-align: center;
            border-top: 1px solid #1e2d4a;
            font-size: 11px;
            color: #718096;
        }
        .footer p {
            margin: 0 0 8px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo-text">YAP</h1>
            <p class="logo-sub">Comprobante de Abono</p>
        </div>
        <div class="content">
            <h2 class="welcome">¡Hola, ${nombreCompleto}! 👋</h2>
            <p class="text">
                Confirmamos que hemos recibido y registrado de manera exitosa tu abono al crédito por libranza.
            </p>
            
            <div class="highlight-box">
                <p class="highlight-title">Monto Abonado</p>
                <p class="highlight-value">${formatCOP(montoPagado)}</p>
                <p class="highlight-subtitle">Transacción procesada correctamente</p>
            </div>

            <table class="table-info">
                <tr>
                    <td class="label">Comprobante de Pago</td>
                    <td class="value" style="font-family: monospace;">${comprobante}</td>
                </tr>
                <tr>
                    <td class="label">Cuota Afectada</td>
                    <td class="value">Cuota N° ${numeroCuota}</td>
                </tr>
                <tr>
                    <td class="label">Saldo Restante de Capital</td>
                    <td class="value" style="color: #10b981; font-weight: bold;">${formatCOP(saldoRestante)}</td>
                </tr>
                <tr>
                    <td class="label">Fecha del Pago</td>
                    <td class="value">${new Date().toLocaleDateString('es-CO')}</td>
                </tr>
            </table>

            <div style="text-align: center; margin-top: 10px;">
                <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; padding: 16px 32px; border-radius: 50px; text-align: center; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);">Ver Plan de Pagos</a>
            </div>
        </div>
        <div class="footer">
            <p><strong>YAP S.A.S. — Créditos por Libranza</strong></p>
            <p>Este es un correo automático. Por favor no lo respondas directamente si no lo requieres.</p>
        </div>
    </div>
</body>
</html>`
}

/**
 * Envía la notificación de confirmación de pago al cliente.
 */
export async function enviarConfirmacionPago({ email, nombreCompleto, montoPagado, saldoRestante, numeroCuota, comprobante }) {
    const htmlContent = generarTemplatePagoHTML(nombreCompleto, montoPagado, saldoRestante, numeroCuota, comprobante)
    const formatCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
    const { resend, EMAIL_FROM, EMAIL_REPLY_TO } = await obtenerConfiguracionEmail()

    console.log(`[EmailService] Procesando correo de confirmación de pago para: ${email} (Monto: ${formatCOP(montoPagado)})`)

    let resendError = null
    if (resend) {
        try {
            console.log('[EmailService] Enviando confirmación de pago vía Resend API...')
            await conReintentos(() => resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
                subject: `💰 Confirmación de Abono YAP — Recibido: ${formatCOP(montoPagado)}`,
                html: htmlContent,
            }))
            console.log('[EmailService] ✅ Correo de confirmación de pago enviado exitosamente vía Resend!')
            return { sent: true, method: 'resend' }
        } catch (error) {
            resendError = error.message
            console.error('[EmailService] ❌ Falló envío de confirmación de pago por Resend:', error.message)
        }
    }

    // Fallback local
    try {
        const tempDir = path.join(__dirname, '../../temp_emails')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }
        const safeName = nombreCompleto.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const filename = `abono_yap_${comprobante}_${safeName}.html`
        const filePath = path.join(tempDir, filename)

        fs.writeFileSync(filePath, htmlContent, 'utf-8')

        console.log('\n=============================================================')
        console.log('📬 [EMAIL SIMULATOR - CONFIRMACIÓN ABONO]')
        console.log(`Deudor: ${nombreCompleto}`)
        console.log(`Destino: ${email}`)
        console.log(`Comprobante: ${comprobante}`)
        console.log(`Abono: ${formatCOP(montoPagado)}`)
        console.log(`Saldo Restante: ${formatCOP(saldoRestante)}`)
        console.log(`Archivo de confirmación HTML generado:`)
        console.log(`👉 file:///${filePath.replace(/\\/g, '/')}`)
        console.log('=============================================================\n')

        return { sent: true, method: 'fallback_file', path: filePath, resendAttempted: !!resend, resendError }
    } catch (fsError) {
        console.error('[EmailService] Error crítico al escribir confirmación de abono local:', fsError.message)
        return { sent: false, error: fsError.message }
    }
}

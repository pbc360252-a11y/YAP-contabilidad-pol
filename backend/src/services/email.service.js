/**
 * Servicio de Correo YAP (Deshabilitado / Silent Mode)
 * Se ha desactivado el envío de correos y las notificaciones automáticas.
 */

export async function enviarConfirmacionRegistro() {
    return { sent: false, disabled: true }
}

export async function enviarNotificacionAdminNuevaSolicitud() {
    return { sent: false, disabled: true }
}

export async function enviarCorreoReporte() {
    return { sent: false, disabled: true }
}

export async function enviarRecordatorioPago() {
    return { sent: false, disabled: true }
}

export async function enviarConfirmacionDesembolso() {
    return { sent: false, disabled: true }
}

export async function enviarConfirmacionPago() {
    return { sent: false, disabled: true }
}

export async function diagnosticarEmailService() {
    return {
        configurado: false,
        remitente: '',
        modo: 'deshabilitado',
        apiKey: '',
        instrucciones: []
    }
}

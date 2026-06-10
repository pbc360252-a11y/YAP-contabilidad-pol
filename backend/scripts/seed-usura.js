import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log('[SEED-USURA] Creando/Actualizando LIMITE_USURA_MENSUAL...')
        const config = await prisma.configuracion.upsert({
            where: { clave: 'LIMITE_USURA_MENSUAL' },
            update: { valor: '3.5' },
            create: { clave: 'LIMITE_USURA_MENSUAL', valor: '3.5' }
        })
        console.log('[SEED-USURA] Configuración guardada:', config)
    } catch (e) {
        console.error('[SEED-USURA] Error:', e)
    } finally {
        await prisma.$disconnect()
    }
}

main()

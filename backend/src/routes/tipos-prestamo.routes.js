import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { verificarToken, requiereRol } from '../middleware/auth.js'

const router = Router()

// Obtener todos los tipos con sus tasas asignadas
router.get('/', verificarToken, async (req, res) => {
    try {
        const tipos = await prisma.tipoPrestamo.findMany({
            include: {
                tasas: {
                    include: { tasa: true },
                    orderBy: { orden: 'asc' }
                }
            }
        })
        res.json({ tipos })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener tipos de préstamo' })
    }
})

// Obtener tipo específico
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const tipo = await prisma.tipoPrestamo.findUnique({
            where: { id: req.params.id },
            include: {
                tasas: {
                    include: { tasa: true },
                    orderBy: { orden: 'asc' }
                }
            }
        })
        if (!tipo) return res.status(404).json({ error: 'Tipo no encontrado' })
        res.json({ tipo })
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener' })
    }
})

// Crear nuevo tipo de préstamo con sus tasas
router.post('/', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const { nombre, descripcion, cuotas_maximas, monto_minimo, monto_maximo, metodo_amortizacion, diferir_cargos, tasasIds } = req.body

        const nuevoTipo = await prisma.tipoPrestamo.create({
            data: {
                nombre,
                descripcion,
                cuotas_maximas: cuotas_maximas !== undefined ? parseInt(cuotas_maximas) : undefined,
                monto_minimo: monto_minimo !== undefined ? parseFloat(monto_minimo) : undefined,
                monto_maximo: monto_maximo !== undefined ? parseFloat(monto_maximo) : undefined,
                metodo_amortizacion: metodo_amortizacion || 'lineal',
                diferir_cargos: diferir_cargos !== undefined ? Boolean(diferir_cargos) : true,
                tasas: {
                    create: (tasasIds || []).map((id, idx) => ({
                        tasa_id: id,
                        orden: idx + 1
                    }))
                }
            },
            include: { tasas: true }
        })
        res.status(201).json({ mensaje: 'Tipo creado', tipo: nuevoTipo })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Error al crear' })
    }
})

// Editar tipo
router.put('/:id', verificarToken, requiereRol(['superadmin', 'administrador']), async (req, res) => {
    try {
        const id = req.params.id
        const { nombre, descripcion, cuotas_maximas, monto_minimo, monto_maximo, estado, metodo_amortizacion, diferir_cargos, tasasIds } = req.body

        // Si envían tasasIds, actualizamos la relación
        let tasasUpdate = {}
        if (tasasIds) {
            // Eliminar relaciones actuales y recrearlas
            await prisma.tipoPrestamo_Tasa.deleteMany({ where: { tipo_id: id } })
            tasasUpdate = {
                tasas: {
                    create: tasasIds.map((tid, idx) => ({
                        tasa_id: tid,
                        orden: idx + 1
                    }))
                }
            }
        }

        const editado = await prisma.tipoPrestamo.update({
            where: { id },
            data: {
                nombre,
                descripcion,
                cuotas_maximas: cuotas_maximas !== undefined ? parseInt(cuotas_maximas) : undefined,
                monto_minimo: monto_minimo !== undefined ? parseFloat(monto_minimo) : undefined,
                monto_maximo: monto_maximo !== undefined ? parseFloat(monto_maximo) : undefined,
                estado,
                metodo_amortizacion: metodo_amortizacion || undefined,
                diferir_cargos: diferir_cargos !== undefined ? Boolean(diferir_cargos) : undefined,
                ...tasasUpdate
            },
            include: { tasas: true }
        })

        res.json({ mensaje: 'Tipo actualizado', tipo: editado })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Error al actualizar' })
    }
})

// Eliminar
router.delete('/:id', verificarToken, requiereRol(['superadmin']), async (req, res) => {
    try {
        const id = req.params.id

        // Verificamos si tiene préstamos activos
        const prestamos = await prisma.prestamo.count({
            where: { tipo_id: id }
        })
        if (prestamos > 0) {
            return res.status(400).json({ error: 'No se puede eliminar porque hay préstamos emitidos con este tipo. Puedes desactivarlo.' })
        }

        // Borramos relaciones primero
        await prisma.tipoPrestamo_Tasa.deleteMany({ where: { tipo_id: id } })
        await prisma.tipoPrestamo.delete({ where: { id } })

        res.json({ mensaje: 'Tipo eliminado correctamente' })
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' })
    }
})

export default router

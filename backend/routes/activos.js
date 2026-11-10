// /api/activos: inventario de activos de información
const express = require('express');
const { body, param } = require('express-validator');
const { Activo, Usuario } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');

const router = express.Router();
router.use(requiereSesion);

// Lista para los selectores de los formularios (cualquier usuario autenticado, solo datos básicos)
router.get('/opciones', async (req, res, next) => {
  try {
    const datos = await Activo.find({ activo: true }).select('codigo nombre tipo').sort({ nombre: 1 }).lean();
    res.json({ datos });
  } catch (e) { next(e); }
});

router.get('/', requiereRol('admin'), async (req, res, next) => {
  try {
    const datos = await Activo.find().populate('responsable', 'nombre apellido').sort({ codigo: 1 }).lean();
    res.json({ datos });
  } catch (e) { next(e); }
});

const reglas = [
  body('codigo').trim().matches(/^[A-Za-z0-9_-]{2,20}$/).withMessage('Código: 2 a 20 caracteres alfanuméricos, guion o guion bajo'),
  body('nombre').trim().isLength({ min: 3, max: 80 }).withMessage('Nombre entre 3 y 80 caracteres'),
  body('tipo').isIn(Activo.TIPOS).withMessage('Tipo inválido'),
  body('criticidad').isIn(['baja', 'media', 'alta', 'critica']).withMessage('Criticidad inválida'),
  body('ubicacion').optional().trim().isLength({ max: 80 }),
  body('descripcion').optional().trim().isLength({ max: 400 }),
  body('responsable').optional({ values: 'falsy' }).isMongoId().withMessage('Responsable inválido')
];

async function responsableValido(id) {
  return !id || Boolean(await Usuario.exists({ _id: id, activo: true }));
}

router.post('/', requiereRol('admin'), reglas, validar, async (req, res, next) => {
  try {
    const { codigo, nombre, tipo, criticidad, ubicacion = '', descripcion = '', responsable } = req.body;
    if (!(await responsableValido(responsable))) return res.status(422).json({ error: 'Responsable inválido' });
    if (await Activo.exists({ codigo: codigo.toUpperCase() })) return res.status(409).json({ error: 'Ya existe un activo con ese código' });
    const act = await Activo.create({ codigo, nombre, tipo, criticidad, ubicacion, descripcion, responsable: responsable || null });
    await auditar(req, 'activo_creado', { entidad: 'activo', entidadId: act._id, detalle: act.codigo });
    res.status(201).json({ mensaje: 'Activo registrado', activo: act });
  } catch (e) { next(e); }
});

router.put('/:id', requiereRol('admin'), [param('id').isMongoId(), ...reglas, body('activo').optional().isBoolean().toBoolean()], validar, async (req, res, next) => {
  try {
    const act = await Activo.findById(req.params.id);
    if (!act) return res.status(404).json({ error: 'Activo no encontrado' });
    const { codigo, nombre, tipo, criticidad, ubicacion = '', descripcion = '', responsable } = req.body;
    if (!(await responsableValido(responsable))) return res.status(422).json({ error: 'Responsable inválido' });
    const dup = await Activo.exists({ codigo: codigo.toUpperCase(), _id: { $ne: act._id } });
    if (dup) return res.status(409).json({ error: 'Ya existe un activo con ese código' });
    Object.assign(act, { codigo, nombre, tipo, criticidad, ubicacion, descripcion, responsable: responsable || null });
    if (typeof req.body.activo === 'boolean') act.activo = req.body.activo;
    await act.save();
    await auditar(req, 'activo_actualizado', { entidad: 'activo', entidadId: act._id, detalle: act.codigo });
    res.json({ mensaje: 'Activo actualizado', activo: act });
  } catch (e) { next(e); }
});

// No se borra físicamente: los eventos e incidentes históricos siguen haciendo referencia al activo
router.delete('/:id', requiereRol('admin'), [param('id').isMongoId()], validar, async (req, res, next) => {
  try {
    const act = await Activo.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!act) return res.status(404).json({ error: 'Activo no encontrado' });
    await auditar(req, 'activo_deshabilitado', { entidad: 'activo', entidadId: act._id, detalle: act.codigo });
    res.json({ mensaje: 'Activo deshabilitado' });
  } catch (e) { next(e); }
});

module.exports = router;

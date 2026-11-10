// /api/solicitudes: solicitudes de acceso a activos y su aprobación
const express = require('express');
const { body, param, query } = require('express-validator');
const { Solicitud, Activo } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');

const router = express.Router();
router.use(requiereSesion);

const POBLAR = [
  { path: 'activo', select: 'codigo nombre criticidad' },
  { path: 'solicitante', select: 'nombre apellido email area cargo' },
  { path: 'revisadoPor', select: 'nombre apellido' }
];

// Formulario 2: solicitud de acceso
router.post('/', [
  body('activo').isMongoId().withMessage('Selecciona un activo'),
  body('nivelAcceso').isIn(['lectura', 'escritura', 'administrador']).withMessage('Nivel de acceso inválido'),
  body('justificacion').trim().isLength({ min: 15, max: 600 }).withMessage('La justificación debe tener entre 15 y 600 caracteres'),
  body('fechaTermino').optional({ values: 'falsy' }).isISO8601().toDate()
    .custom(f => f > new Date()).withMessage('La fecha de término debe ser futura')
], validar, async (req, res, next) => {
  try {
    const { activo, nivelAcceso, justificacion, fechaTermino } = req.body;
    const act = await Activo.findOne({ _id: activo, activo: true });
    if (!act) return res.status(422).json({ error: 'El activo no existe o está deshabilitado' });
    const pendiente = await Solicitud.exists({ solicitante: req.usuario._id, activo, estado: 'pendiente' });
    if (pendiente) return res.status(409).json({ error: 'Ya tienes una solicitud pendiente para ese activo' });

    const sol = await Solicitud.create({
      solicitante: req.usuario._id, activo, nivelAcceso, justificacion, fechaTermino: fechaTermino || null
    });
    await auditar(req, 'solicitud_creada', { entidad: 'solicitud', entidadId: sol._id, detalle: `${act.codigo} (${nivelAcceso})` });
    res.status(201).json({ mensaje: 'Solicitud enviada. Un administrador la revisará.', solicitud: sol });
  } catch (e) { next(e); }
});

router.get('/mias', async (req, res, next) => {
  try {
    const datos = await Solicitud.find({ solicitante: req.usuario._id }).sort({ createdAt: -1 }).limit(100).populate(POBLAR).lean();
    res.json({ datos });
  } catch (e) { next(e); }
});

router.get('/', requiereRol('admin'), [
  query('estado').optional({ values: 'falsy' }).isIn(['pendiente', 'aprobada', 'rechazada'])
], validar, async (req, res, next) => {
  try {
    const filtro = req.query.estado ? { estado: req.query.estado } : {};
    const datos = await Solicitud.find(filtro).sort({ createdAt: -1 }).limit(200).populate(POBLAR).lean();
    res.json({ datos });
  } catch (e) { next(e); }
});

router.patch('/:id', requiereRol('admin'), [
  param('id').isMongoId(),
  body('estado').isIn(['aprobada', 'rechazada']).withMessage('Decisión inválida'),
  body('comentarioRevision').trim().isLength({ min: 3, max: 400 }).withMessage('Agrega un comentario (3 a 400 caracteres)')
], validar, async (req, res, next) => {
  try {
    const sol = await Solicitud.findById(req.params.id);
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (sol.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue revisada' });
    // Segregación de funciones: nadie aprueba su propia solicitud
    if (String(sol.solicitante) === String(req.usuario._id)) {
      return res.status(403).json({ error: 'No puedes revisar tu propia solicitud' });
    }
    Object.assign(sol, {
      estado: req.body.estado,
      comentarioRevision: req.body.comentarioRevision,
      revisadoPor: req.usuario._id,
      fechaRevision: new Date()
    });
    await sol.save();
    await auditar(req, `solicitud_${req.body.estado}`, { entidad: 'solicitud', entidadId: sol._id });
    await sol.populate(POBLAR);
    res.json({ mensaje: `Solicitud ${req.body.estado}`, solicitud: sol });
  } catch (e) { next(e); }
});

module.exports = router;

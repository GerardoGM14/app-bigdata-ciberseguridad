// /api/incidentes: reporte (cualquier usuario) y gestión (solo admin)
const express = require('express');
const crypto = require('crypto');
const { body, param, query } = require('express-validator');
const { Incidente, Activo, Usuario } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');
const { escaparRegex } = require('../utils/escapar');

const router = express.Router();
router.use(requiereSesion);

const POBLAR = [
  { path: 'activo', select: 'codigo nombre' },
  { path: 'reportadoPor', select: 'nombre apellido email area' },
  { path: 'asignadoA', select: 'nombre apellido email' },
  { path: 'historial.usuario', select: 'nombre apellido' }
];

function nuevoFolio() {
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `INC-${fecha}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// Formulario 1: reportar incidente
router.post('/', [
  body('titulo').trim().isLength({ min: 5, max: 120 }).withMessage('El título debe tener entre 5 y 120 caracteres'),
  body('descripcion').trim().isLength({ min: 20, max: 2000 }).withMessage('Describe el incidente con al menos 20 caracteres'),
  body('categoria').isIn(Incidente.CATEGORIAS).withMessage('Categoría inválida'),
  body('severidad').isIn(['baja', 'media', 'alta', 'critica']).withMessage('Severidad inválida'),
  body('fechaDeteccion').isISO8601().withMessage('Fecha inválida').toDate()
    .custom(f => f <= new Date(Date.now() + 60000)).withMessage('La fecha de detección no puede ser futura'),
  body('activo').optional({ values: 'falsy' }).isMongoId().withMessage('Activo inválido')
], validar, async (req, res, next) => {
  try {
    const { titulo, descripcion, categoria, severidad, fechaDeteccion, activo } = req.body;
    if (activo && !(await Activo.exists({ _id: activo, activo: true }))) {
      return res.status(422).json({ error: 'El activo seleccionado no existe' });
    }
    let incidente;
    for (let i = 0; i < 3 && !incidente; i++) {
      try {
        incidente = await Incidente.create({
          folio: nuevoFolio(), titulo, descripcion, categoria, severidad, fechaDeteccion,
          activo: activo || null,
          reportadoPor: req.usuario._id,
          historial: [{ usuario: req.usuario._id, accion: 'creado', comentario: 'Incidente reportado' }]
        });
      } catch (e) { if (e.code !== 11000) throw e; }
    }
    await auditar(req, 'incidente_creado', { entidad: 'incidente', entidadId: incidente._id, detalle: incidente.folio });
    res.status(201).json({ mensaje: `Incidente registrado con folio ${incidente.folio}`, incidente });
  } catch (e) { next(e); }
});

router.get('/mios', async (req, res, next) => {
  try {
    const lista = await Incidente.find({ reportadoPor: req.usuario._id })
      .sort({ createdAt: -1 }).limit(100).populate(POBLAR).lean();
    res.json({ datos: lista });
  } catch (e) { next(e); }
});

router.get('/', requiereRol('admin'), [
  query('estado').optional({ values: 'falsy' }).isIn(Incidente.ESTADOS),
  query('severidad').optional({ values: 'falsy' }).isIn(['baja', 'media', 'alta', 'critica']),
  query('q').optional().isString().isLength({ max: 60 }),
  query('pagina').optional().isInt({ min: 1, max: 10000 }).toInt()
], validar, async (req, res, next) => {
  try {
    const filtro = {};
    if (req.query.estado) filtro.estado = req.query.estado;
    if (req.query.severidad) filtro.severidad = req.query.severidad;
    if (req.query.q) {
      const rx = new RegExp(escaparRegex(req.query.q), 'i');
      filtro.$or = [{ titulo: rx }, { folio: rx }];
    }
    const pagina = req.query.pagina || 1;
    const porPagina = 20;
    const [datos, total] = await Promise.all([
      Incidente.find(filtro).sort({ createdAt: -1 }).skip((pagina - 1) * porPagina).limit(porPagina).populate(POBLAR).lean(),
      Incidente.countDocuments(filtro)
    ]);
    res.json({ datos, total, pagina, paginas: Math.ceil(total / porPagina) });
  } catch (e) { next(e); }
});

router.get('/:id', [param('id').isMongoId()], validar, async (req, res, next) => {
  try {
    const inc = await Incidente.findById(req.params.id).populate(POBLAR).lean();
    if (!inc) return res.status(404).json({ error: 'Incidente no encontrado' });
    // Un colaborador solo puede ver sus propios incidentes (control de acceso a nivel de objeto)
    if (req.usuario.rol !== 'admin' && String(inc.reportadoPor._id) !== String(req.usuario._id)) {
      return res.status(403).json({ error: 'No tienes permisos para ver este incidente' });
    }
    res.json({ incidente: inc });
  } catch (e) { next(e); }
});

router.patch('/:id', requiereRol('admin'), [
  param('id').isMongoId(),
  body('estado').optional().isIn(Incidente.ESTADOS).withMessage('Estado inválido'),
  body('severidad').optional().isIn(['baja', 'media', 'alta', 'critica']),
  body('asignadoA').optional({ values: 'null' }).isMongoId().withMessage('Responsable inválido'),
  body('comentario').optional().trim().isLength({ max: 500 })
], validar, async (req, res, next) => {
  try {
    const inc = await Incidente.findById(req.params.id);
    if (!inc) return res.status(404).json({ error: 'Incidente no encontrado' });
    const cambios = [];
    if (req.body.estado && req.body.estado !== inc.estado) { cambios.push(`estado: ${inc.estado} → ${req.body.estado}`); inc.estado = req.body.estado; }
    if (req.body.severidad && req.body.severidad !== inc.severidad) { cambios.push(`severidad: ${req.body.severidad}`); inc.severidad = req.body.severidad; }
    if (req.body.asignadoA !== undefined) {
      if (req.body.asignadoA && !(await Usuario.exists({ _id: req.body.asignadoA, rol: 'admin', activo: true }))) {
        return res.status(422).json({ error: 'Solo se puede asignar a un administrador activo' });
      }
      inc.asignadoA = req.body.asignadoA || null;
      cambios.push('responsable actualizado');
    }
    if (!cambios.length && !req.body.comentario) return res.status(400).json({ error: 'No hay cambios que guardar' });
    inc.historial.push({ usuario: req.usuario._id, accion: cambios.join(', ') || 'comentario', comentario: req.body.comentario || '' });
    await inc.save();
    await auditar(req, 'incidente_actualizado', { entidad: 'incidente', entidadId: inc._id, detalle: `${inc.folio} ${cambios.join(', ')}` });
    await inc.populate(POBLAR);
    res.json({ mensaje: 'Incidente actualizado', incidente: inc });
  } catch (e) { next(e); }
});

module.exports = router;

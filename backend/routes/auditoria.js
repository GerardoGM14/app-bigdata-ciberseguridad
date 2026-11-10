// /api/auditoria: consulta de la bitácora (solo lectura, solo admin)
const express = require('express');
const { query } = require('express-validator');
const { Auditoria } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion, requiereRol('admin'));

router.get('/', [
  query('accion').optional({ values: 'falsy' }).matches(/^[a-z_]{2,60}$/),
  query('pagina').optional().isInt({ min: 1, max: 5000 }).toInt()
], validar, async (req, res, next) => {
  try {
    const filtro = req.query.accion ? { accion: req.query.accion } : {};
    const pagina = req.query.pagina || 1;
    const porPagina = 40;
    const [datos, total, acciones] = await Promise.all([
      Auditoria.find(filtro).sort({ fecha: -1 }).skip((pagina - 1) * porPagina).limit(porPagina).lean(),
      Auditoria.countDocuments(filtro),
      Auditoria.distinct('accion')
    ]);
    res.json({ datos, total, pagina, paginas: Math.max(1, Math.ceil(total / porPagina)), acciones: acciones.sort() });
  } catch (e) { next(e); }
});

module.exports = router;

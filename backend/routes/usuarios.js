// /api/usuarios: administración de cuentas (solo admin)
const express = require('express');
const { body, param, query } = require('express-validator');
const { Usuario } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');
const { escaparRegex } = require('../utils/escapar');

const router = express.Router();
router.use(requiereSesion, requiereRol('admin'));

router.get('/', [query('q').optional().isString().isLength({ max: 60 })], validar, async (req, res, next) => {
  try {
    const filtro = {};
    if (req.query.q) {
      const rx = new RegExp(escaparRegex(req.query.q), 'i');
      filtro.$or = [{ nombre: rx }, { apellido: rx }, { email: rx }];
    }
    const lista = await Usuario.find(filtro).select('+bloqueadoHasta').sort({ createdAt: -1 }).limit(300);
    res.json({ datos: lista.map(u => ({ ...u.toPublico(), bloqueado: u.estaBloqueado() })) });
  } catch (e) { next(e); }
});

router.get('/admins', async (req, res, next) => {
  try {
    const datos = await Usuario.find({ rol: 'admin', activo: true }).select('nombre apellido').lean();
    res.json({ datos });
  } catch (e) { next(e); }
});

router.patch('/:id', [
  param('id').isMongoId(),
  body('rol').optional().isIn(['admin', 'colaborador']).withMessage('Rol inválido'),
  body('activo').optional().isBoolean().toBoolean(),
  body('desbloquear').optional().isBoolean().toBoolean()
], validar, async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.usuario._id) && (req.body.rol || req.body.activo === false)) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivar tu propia cuenta' });
    }
    const u = await Usuario.findById(req.params.id).select('+bloqueadoHasta +intentosFallidos');
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    const cambios = [];
    if (req.body.rol && req.body.rol !== u.rol) { cambios.push(`rol ${u.rol} → ${req.body.rol}`); u.rol = req.body.rol; }
    if (typeof req.body.activo === 'boolean' && req.body.activo !== u.activo) {
      u.activo = req.body.activo; cambios.push(req.body.activo ? 'activado' : 'desactivado');
    }
    if (req.body.desbloquear) { u.bloqueadoHasta = null; u.intentosFallidos = 0; cambios.push('desbloqueado'); }
    if (!cambios.length) return res.status(400).json({ error: 'No hay cambios que aplicar' });
    // Un cambio de rol o una desactivación invalida las sesiones abiertas de esa persona
    if (cambios.some(c => c.startsWith('rol') || c === 'desactivado')) u.passwordCambiadaEn = new Date();
    await u.save();
    await auditar(req, 'usuario_modificado', { entidad: 'usuario', entidadId: u._id, detalle: `${u.email}: ${cambios.join(', ')}` });
    res.json({ mensaje: 'Usuario actualizado', usuario: u.toPublico() });
  } catch (e) { next(e); }
});

module.exports = router;

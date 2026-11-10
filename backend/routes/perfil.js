// /api/perfil: datos de la propia cuenta y cambio de contraseña
const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { Usuario } = require('../models');
const { validar, passwordSegura } = require('../middleware/validar');
const { requiereSesion, emitirSesion } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');

const router = express.Router();
router.use(requiereSesion);

router.get('/', (req, res) => res.json({ usuario: req.usuario.toPublico() }));

router.put('/', [
  body('nombre').trim().isLength({ min: 2, max: 60 }).matches(/^[\p{L} '-]+$/u).withMessage('Nombre inválido'),
  body('apellido').trim().isLength({ min: 2, max: 60 }).matches(/^[\p{L} '-]+$/u).withMessage('Apellido inválido'),
  body('area').optional().trim().isLength({ max: 60 }),
  body('cargo').optional().trim().isLength({ max: 60 }),
  body('telefono').optional({ values: 'falsy' }).trim().matches(/^\+?[0-9 ]{8,15}$/).withMessage('Teléfono inválido (8 a 15 dígitos)')
], validar, async (req, res, next) => {
  try {
    // Solo se actualizan campos permitidos: el rol, el correo o el estado no se pueden tocar desde aquí
    const { nombre, apellido, area = '', cargo = '', telefono = '' } = req.body;
    Object.assign(req.usuario, { nombre, apellido, area, cargo, telefono });
    await req.usuario.save();
    await auditar(req, 'perfil_actualizado', { entidad: 'usuario', entidadId: req.usuario._id });
    res.json({ mensaje: 'Perfil actualizado', usuario: req.usuario.toPublico() });
  } catch (e) { next(e); }
});

router.put('/password', [
  body('actual').isString().isLength({ min: 1, max: 72 }).withMessage('Ingresa tu contraseña actual'),
  passwordSegura('nueva'),
  body('confirmacion').custom((v, { req }) => v === req.body.nueva).withMessage('Las contraseñas no coinciden')
], validar, async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.usuario._id).select('+passwordHash');
    const ok = await bcrypt.compare(req.body.actual, usuario.passwordHash);
    if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    if (await bcrypt.compare(req.body.nueva, usuario.passwordHash)) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    }
    usuario.passwordHash = await bcrypt.hash(req.body.nueva, 12);
    usuario.passwordCambiadaEn = new Date();
    await usuario.save();
    emitirSesion(res, usuario); // nueva sesión; las demás quedan invalidadas
    await auditar(req, 'password_cambiada', { entidad: 'usuario', entidadId: usuario._id });
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (e) { next(e); }
});

module.exports = router;

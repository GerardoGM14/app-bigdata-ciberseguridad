// /api/auth: registro, inicio y cierre de sesión, recuperación de contraseña
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const env = require('../config/env');
const { Usuario, TokenRecuperacion, Evento } = require('../models');
const { validar, passwordSegura } = require('../middleware/validar');
const { emitirSesion, cerrarSesion, requiereSesion } = require('../middleware/auth');
const { limiteAuth } = require('../middleware/seguridad');
const { auditar, ipDe } = require('../utils/auditoria');
const { enviarCorreo, plantillaRecuperacion } = require('../utils/correo');
const { escaparHtml } = require('../utils/escapar');

const router = express.Router();
const COSTO_BCRYPT = 12;
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
// Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe (evita enumeración)
const HASH_FICTICIO = bcrypt.hashSync('no-existe-este-usuario', COSTO_BCRYPT);

// La propia plataforma también genera eventos de seguridad, que alimentan el análisis
function registrarEventoPropio(req, tipo, email, mensaje) {
  Evento.create({
    fecha: new Date(),
    origen: { sistema: 'CENTINELA' },
    tipo,
    severidad: tipo === 'login_fallido' ? 'media' : 'info',
    ip: ipDe(req),
    usuario: email,
    mensaje
  }).catch(() => {});
}

router.post('/registro', limiteAuth, [
  body('nombre').trim().isLength({ min: 2, max: 60 }).withMessage('Nombre entre 2 y 60 caracteres')
    .matches(/^[\p{L} '-]+$/u).withMessage('El nombre solo puede contener letras'),
  body('apellido').trim().isLength({ min: 2, max: 60 }).withMessage('Apellido entre 2 y 60 caracteres')
    .matches(/^[\p{L} '-]+$/u).withMessage('El apellido solo puede contener letras'),
  body('email').trim().isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false }),
  body('area').optional().trim().isLength({ max: 60 }),
  body('cargo').optional().trim().isLength({ max: 60 }),
  passwordSegura('password'),
  body('confirmacion').custom((v, { req }) => v === req.body.password).withMessage('Las contraseñas no coinciden')
], validar, async (req, res, next) => {
  try {
    const { nombre, apellido, email, area = '', cargo = '', password } = req.body;
    const existe = await Usuario.exists({ email });
    if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

    // Todo registro público crea un colaborador; el rol admin solo lo asigna otro admin
    const usuario = await Usuario.create({
      nombre, apellido, email, area, cargo,
      passwordHash: await bcrypt.hash(password, COSTO_BCRYPT),
      rol: 'colaborador'
    });
    await auditar(req, 'registro', { usuario, entidad: 'usuario', entidadId: usuario._id });
    res.status(201).json({ mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' });
  } catch (e) { next(e); }
});

router.post('/login', limiteAuth, [
  body('email').trim().isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().isLength({ min: 1, max: 72 }).withMessage('Ingresa tu contraseña')
], validar, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const usuario = await Usuario.findOne({ email }).select('+passwordHash +intentosFallidos +bloqueadoHasta');
    const generico = { error: 'Correo o contraseña incorrectos' };

    if (!usuario) {
      await bcrypt.compare(password, HASH_FICTICIO);
      registrarEventoPropio(req, 'login_fallido', email, 'Usuario inexistente');
      return res.status(401).json(generico);
    }
    if (usuario.estaBloqueado()) {
      const minutos = Math.ceil((usuario.bloqueadoHasta - new Date()) / 60000);
      return res.status(423).json({ error: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta en ${minutos} min.` });
    }
    if (!usuario.activo) return res.status(403).json({ error: 'La cuenta está desactivada. Contacta al administrador.' });

    const valida = await bcrypt.compare(password, usuario.passwordHash);
    if (!valida) {
      usuario.intentosFallidos += 1;
      if (usuario.intentosFallidos >= MAX_INTENTOS) {
        usuario.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60000);
        usuario.intentosFallidos = 0;
        await auditar(req, 'cuenta_bloqueada', { usuario, entidad: 'usuario', entidadId: usuario._id });
      }
      await usuario.save();
      registrarEventoPropio(req, 'login_fallido', email, 'Contraseña incorrecta');
      return res.status(401).json(generico);
    }

    usuario.intentosFallidos = 0;
    usuario.bloqueadoHasta = null;
    usuario.ultimoAcceso = new Date();
    await usuario.save();

    emitirSesion(res, usuario);
    registrarEventoPropio(req, 'login_ok', email, 'Inicio de sesión correcto');
    await auditar(req, 'login', { usuario, entidad: 'usuario', entidadId: usuario._id });
    res.json({ usuario: usuario.toPublico(), destino: usuario.rol === 'admin' ? '/admin.html' : '/panel.html' });
  } catch (e) { next(e); }
});

router.post('/logout', requiereSesion, async (req, res) => {
  await auditar(req, 'logout', { entidad: 'usuario', entidadId: req.usuario._id });
  cerrarSesion(res);
  res.json({ mensaje: 'Sesión cerrada' });
});

router.get('/me', requiereSesion, (req, res) => {
  res.json({ usuario: req.usuario.toPublico() });
});

router.post('/recuperar', limiteAuth, [
  body('email').trim().isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false })
], validar, async (req, res, next) => {
  try {
    // La respuesta es la misma exista o no la cuenta, para no revelar qué correos están registrados
    const respuesta = { mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer la contraseña.' };
    const usuario = await Usuario.findOne({ email: req.body.email, activo: true });
    if (!usuario) return res.json(respuesta);

    await TokenRecuperacion.deleteMany({ usuario: usuario._id });
    const token = crypto.randomBytes(32).toString('hex');
    await TokenRecuperacion.create({
      usuario: usuario._id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiraEn: new Date(Date.now() + 30 * 60000),
      ipSolicitud: ipDe(req)
    });

    const enlace = `${env.APP_URL}/restablecer.html?token=${token}`;
    const { html, texto } = plantillaRecuperacion(escaparHtml(usuario.nombre), enlace);
    try {
      await enviarCorreo({ para: usuario.email, asunto: 'Restablece tu contraseña de Centinela', html, texto });
    } catch (err) {
      console.error('[correo] error al enviar:', err.message);
    }
    await auditar(req, 'recuperacion_solicitada', { usuario, entidad: 'usuario', entidadId: usuario._id });
    res.json(respuesta);
  } catch (e) { next(e); }
});

router.post('/restablecer', limiteAuth, [
  body('token').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Enlace inválido'),
  passwordSegura('password'),
  body('confirmacion').custom((v, { req }) => v === req.body.password).withMessage('Las contraseñas no coinciden')
], validar, async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const registro = await TokenRecuperacion.findOne({ tokenHash, usado: false, expiraEn: { $gt: new Date() } });
    if (!registro) return res.status(400).json({ error: 'El enlace expiró o ya fue utilizado. Solicita uno nuevo.' });

    const usuario = await Usuario.findById(registro.usuario);
    if (!usuario || !usuario.activo) return res.status(400).json({ error: 'El enlace no es válido' });

    usuario.passwordHash = await bcrypt.hash(req.body.password, COSTO_BCRYPT);
    usuario.passwordCambiadaEn = new Date();
    usuario.intentosFallidos = 0;
    usuario.bloqueadoHasta = null;
    await usuario.save();
    registro.usado = true;
    await registro.save();

    await auditar(req, 'password_restablecida', { usuario, entidad: 'usuario', entidadId: usuario._id });
    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.COSTO_BCRYPT = COSTO_BCRYPT;

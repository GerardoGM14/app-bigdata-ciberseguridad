// Autenticación con JWT almacenado en cookie httpOnly y control de acceso por rol (RBAC)
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { Usuario } = require('../models');

const COOKIE = 'centinela_sesion';

function opcionesCookie() {
  return {
    httpOnly: true, // inaccesible desde JavaScript del navegador (mitiga robo de sesión por XSS)
    secure: env.esProduccion, // solo HTTPS en producción
    sameSite: 'strict', // el navegador no la envía en peticiones originadas en otros sitios (CSRF)
    path: '/',
    maxAge: 2 * 60 * 60 * 1000
  };
}

function emitirSesion(res, usuario) {
  const token = jwt.sign({ sub: String(usuario._id), rol: usuario.rol }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRA,
    issuer: 'centinela'
  });
  res.cookie(COOKIE, token, opcionesCookie());
}

function cerrarSesion(res) {
  const { maxAge, ...resto } = opcionesCookie();
  res.clearCookie(COOKIE, resto);
}

async function requiereSesion(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'Debes iniciar sesión' });

    const datos = jwt.verify(token, env.JWT_SECRET, { issuer: 'centinela' });
    const usuario = await Usuario.findById(datos.sub).select('+passwordCambiadaEn');
    if (!usuario || !usuario.activo) {
      cerrarSesion(res);
      return res.status(401).json({ error: 'Sesión no válida' });
    }
    // Si la contraseña cambió después de emitir el token, la sesión antigua deja de servir
    if (usuario.passwordCambiadaEn && datos.iat * 1000 < usuario.passwordCambiadaEn.getTime() - 1000) {
      cerrarSesion(res);
      return res.status(401).json({ error: 'La sesión expiró, vuelve a ingresar' });
    }
    req.usuario = usuario;
    next();
  } catch (e) {
    cerrarSesion(res);
    return res.status(401).json({ error: 'Sesión expirada o inválida' });
  }
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

module.exports = { emitirSesion, cerrarSesion, requiereSesion, requiereRol, COOKIE };

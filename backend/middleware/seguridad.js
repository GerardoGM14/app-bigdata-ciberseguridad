const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Cabeceras HTTP seguras. La CSP solo permite recursos del propio dominio.
const cabeceras = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': env.esProduccion ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
});

// Límite general para la API y uno más estricto para autenticación (fuerza bruta)
const limiteApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
});

const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.LIMITE_AUTH, 10) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar' }
});

// Defensa adicional contra CSRF: en métodos que modifican datos, si el navegador envía
// la cabecera Origin, esta debe coincidir con el host de la aplicación.
function verificarOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.get('origin');
  if (!origen) return next(); // clientes no navegador (p. ej. la API de ingesta)
  try {
    const host = new URL(origen).host;
    if (host === req.get('host')) return next();
  } catch (_) { /* origen mal formado */ }
  return res.status(403).json({ error: 'Origen no permitido' });
}

module.exports = { cabeceras, limiteApi, limiteAuth, verificarOrigen };

// Carga y valida las variables de entorno. Si falta algo crítico en producción, la app no arranca.
require('dotenv').config({ quiet: true });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRA: process.env.JWT_EXPIRA || '2h',
  APP_URL: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  INGESTA_API_KEY: process.env.INGESTA_API_KEY || '',
  // Correo: se usa Brevo (API HTTP) si hay clave; si no, SMTP; si no, consola (solo desarrollo)
  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || 'Centinela',
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || 'no-reply@centinela.local',
  RETENCION_EVENTOS_DIAS: parseInt(process.env.RETENCION_EVENTOS_DIAS, 10) || 365
};

env.esProduccion = env.NODE_ENV === 'production';

if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  if (env.esProduccion) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
  env.JWT_SECRET = 'solo-desarrollo-cambiar-este-secreto-0123456789';
}

module.exports = env;

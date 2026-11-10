const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const env = require('./config/env');
const { cabeceras, limiteApi, verificarOrigen } = require('./middleware/seguridad');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // el hosting entrega la IP real del cliente en X-Forwarded-For

app.use(cabeceras);
// La ingesta recibe lotes grandes; el resto de la API acepta cuerpos pequeños
app.use('/api/eventos/ingesta', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
// Elimina claves que empiezan con "$" o contienen "." para evitar inyección de operadores NoSQL
app.use(mongoSanitize({ replaceWith: '_' }));

app.get('/api/salud', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

app.use('/api', limiteApi, verificarOrigen);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/perfil', require('./routes/perfil'));
app.use('/api/incidentes', require('./routes/incidentes'));
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/activos', require('./routes/activos'));
app.use('/api/eventos', require('./routes/eventos'));
app.use('/api/analitica', require('./routes/analitica'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/auditoria', require('./routes/auditoria'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// Frontend estático y librerías open source servidas desde el mismo origen (CSP 'self')
const RUTA_CHARTJS = path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js');
app.get('/vendor/chart.umd.js', (req, res) => res.type('application/javascript').sendFile(RUTA_CHARTJS));
app.use(express.static(path.join(__dirname, '..', 'frontend'), { extensions: ['html'], maxAge: env.esProduccion ? '1h' : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html')));

// Manejador de errores: registra el detalle en el servidor y responde un mensaje genérico
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande' });
  if (err.name === 'ValidationError') return res.status(422).json({ error: 'Datos inválidos' });
  if (err.code === 11000) return res.status(409).json({ error: 'El registro ya existe' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Ocurrió un error interno. Intenta nuevamente.' });
});

module.exports = app;

// /api/eventos: exploración, carga masiva (CSV/JSON) e ingesta automática de eventos de seguridad
const express = require('express');
const crypto = require('crypto');
const net = require('net');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query } = require('express-validator');
const env = require('../config/env');
const { Evento } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');
const { auditar } = require('../utils/auditoria');
const { escaparRegex } = require('../utils/escapar');

const router = express.Router();
const MAX_FILAS = 50000;
const TAM_LOTE = 1000;

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|json)$/i.test(file.originalname);
    cb(ok ? null : new Error('Solo se aceptan archivos .csv o .json'), ok);
  }
});

// Normaliza y valida una fila. Devuelve { evento } o { error }.
function normalizarFila(f, lote) {
  const fecha = new Date(f.fecha);
  if (!f.fecha || isNaN(fecha)) return { error: 'fecha inválida' };
  if (fecha > new Date(Date.now() + 5 * 60000)) return { error: 'fecha futura' };
  const sistema = String(f.sistema || (f.origen && f.origen.sistema) || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(sistema)) return { error: 'sistema inválido' };
  const tipo = String(f.tipo || '').trim().toLowerCase();
  if (!Evento.TIPOS.includes(tipo)) return { error: `tipo "${tipo}" no reconocido` };
  const severidad = String(f.severidad || 'info').trim().toLowerCase();
  if (!Evento.SEVERIDADES.includes(severidad)) return { error: 'severidad inválida' };
  const ip = String(f.ip || '').trim();
  if (ip && !net.isIP(ip)) return { error: 'IP inválida' };
  const pais = String(f.pais || '').trim().toUpperCase();
  if (pais && !/^[A-Z]{2}$/.test(pais)) return { error: 'país debe ser código ISO de 2 letras' };
  return {
    evento: {
      fecha, origen: { sistema }, tipo, severidad, ip,
      usuario: String(f.usuario || '').trim().toLowerCase().slice(0, 120),
      pais,
      mensaje: String(f.mensaje || '').trim().slice(0, 300),
      lote
    }
  };
}

async function procesarFilas(filas, lote) {
  const validos = [];
  const errores = [];
  filas.forEach((f, i) => {
    const r = normalizarFila(f || {}, lote);
    if (r.error) { if (errores.length < 25) errores.push({ fila: i + 1, error: r.error }); }
    else validos.push(r.evento);
  });
  let insertados = 0;
  // Inserción por lotes: reduce viajes a la base y mantiene acotado el uso de memoria
  for (let i = 0; i < validos.length; i += TAM_LOTE) {
    const res = await Evento.insertMany(validos.slice(i, i + TAM_LOTE), { ordered: false, lean: true });
    insertados += res.length;
  }
  return { recibidos: filas.length, insertados, rechazados: filas.length - validos.length, errores };
}

// Ingesta automática desde otros sistemas (servidores, firewall, VPN) con clave de API
router.post('/ingesta', express.json({ limit: '4mb' }), async (req, res, next) => {
  try {
    const clave = String(req.get('x-api-key') || '');
    const esperada = env.INGESTA_API_KEY;
    const valida = esperada && clave.length === esperada.length &&
      crypto.timingSafeEqual(Buffer.from(clave), Buffer.from(esperada));
    if (!valida) return res.status(401).json({ error: 'Clave de API inválida' });
    const filas = Array.isArray(req.body) ? req.body : req.body.eventos;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'Se esperaba un arreglo de eventos' });
    if (filas.length > 5000) return res.status(413).json({ error: 'Máximo 5000 eventos por petición' });
    const resultado = await procesarFilas(filas, `api-${Date.now()}`);
    res.status(201).json(resultado);
  } catch (e) { next(e); }
});

router.use(requiereSesion, requiereRol('admin'));

// Formulario 3: carga masiva de eventos desde archivo
router.post('/carga', (req, res, next) => {
  subida.single('archivo')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 8 MB' : err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo .csv o .json' });
    const texto = req.file.buffer.toString('utf8').replace(/^﻿/, '');
    let filas;
    try {
      if (/\.json$/i.test(req.file.originalname)) {
        const datos = JSON.parse(texto);
        filas = Array.isArray(datos) ? datos : datos.eventos;
      } else {
        filas = parse(texto, { columns: h => h.map(c => c.trim().toLowerCase()), skip_empty_lines: true, trim: true, delimiter: [',', ';'] });
      }
    } catch (_) {
      return res.status(400).json({ error: 'No se pudo leer el archivo: revisa el formato' });
    }
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'El archivo no contiene eventos' });
    if (filas.length > MAX_FILAS) return res.status(413).json({ error: `Máximo ${MAX_FILAS} filas por archivo` });

    const lote = `carga-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const inicio = Date.now();
    const resultado = await procesarFilas(filas, lote);
    resultado.lote = lote;
    resultado.segundos = ((Date.now() - inicio) / 1000).toFixed(2);
    await auditar(req, 'carga_masiva', {
      entidad: 'evento', entidadId: lote,
      detalle: `${req.file.originalname}: ${resultado.insertados} insertados, ${resultado.rechazados} rechazados`
    });
    res.status(201).json(resultado);
  } catch (e) { next(e); }
});

router.get('/', [
  query('desde').optional({ values: 'falsy' }).isISO8601(),
  query('hasta').optional({ values: 'falsy' }).isISO8601(),
  query('sistema').optional({ values: 'falsy' }).matches(/^[A-Za-z0-9_-]{2,20}$/),
  query('tipo').optional({ values: 'falsy' }).isIn(Evento.TIPOS),
  query('severidad').optional({ values: 'falsy' }).isIn(Evento.SEVERIDADES),
  query('ip').optional({ values: 'falsy' }).isIP(),
  query('usuario').optional({ values: 'falsy' }).isString().isLength({ max: 60 }),
  query('pagina').optional().isInt({ min: 1, max: 2000 }).toInt()
], validar, async (req, res, next) => {
  try {
    const q = req.query;
    const filtro = {};
    if (q.desde || q.hasta) {
      filtro.fecha = {};
      if (q.desde) filtro.fecha.$gte = new Date(q.desde);
      if (q.hasta) filtro.fecha.$lte = new Date(q.hasta);
    }
    if (q.sistema) filtro['origen.sistema'] = q.sistema.toUpperCase();
    if (q.tipo) filtro.tipo = q.tipo;
    if (q.severidad) filtro.severidad = q.severidad;
    if (q.ip) filtro.ip = q.ip;
    if (q.usuario) filtro.usuario = new RegExp('^' + escaparRegex(q.usuario.toLowerCase()));
    const pagina = q.pagina || 1;
    const porPagina = 50;
    const [datos, total] = await Promise.all([
      Evento.find(filtro).sort({ fecha: -1 }).skip((pagina - 1) * porPagina).limit(porPagina).lean(),
      Evento.countDocuments(filtro)
    ]);
    res.json({ datos, total, pagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.normalizarFila = normalizarFila;

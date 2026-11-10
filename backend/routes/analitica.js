// /api/analitica: indicadores y detección de patrones sobre el volumen de eventos.
// Todo el cálculo se hace dentro de MongoDB con aggregation pipelines ($facet, $dateTrunc),
// de modo que al navegador solo viajan resultados ya resumidos.
const express = require('express');
const { query } = require('express-validator');
const { Evento, Incidente, Solicitud, Usuario } = require('../models');
const { validar } = require('../middleware/validar');
const { requiereSesion, requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion, requiereRol('admin'));

const ZONA = 'America/Santiago';
const UMBRAL_FUERZA_BRUTA = 5; // intentos fallidos desde una IP en una ventana de 10 minutos
const UMBRAL_SPRAYING = 4; // cuentas distintas atacadas desde una misma IP

router.get('/resumen', [query('dias').optional().isIn(['1', '7', '30']).toInt()], validar, async (req, res, next) => {
  try {
    const dias = req.query.dias || 7;
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
    const unidad = dias === 1 ? 'hour' : 'day';

    const [r] = await Evento.aggregate([
      { $match: { fecha: { $gte: desde } } },
      {
        $facet: {
          totales: [{
            $group: {
              _id: null,
              total: { $sum: 1 },
              fallidos: { $sum: { $cond: [{ $eq: ['$tipo', 'login_fallido'] }, 1, 0] } },
              graves: { $sum: { $cond: [{ $in: ['$severidad', ['alta', 'critica']] }, 1, 0] } },
              ips: { $addToSet: '$ip' }
            }
          }, { $project: { _id: 0, total: 1, fallidos: 1, graves: 1, ipsUnicas: { $size: '$ips' } } }],
          serie: [
            { $group: {
              _id: { t: { $dateTrunc: { date: '$fecha', unit: unidad, timezone: ZONA } }, f: { $eq: ['$tipo', 'login_fallido'] } },
              n: { $sum: 1 }
            } },
            { $group: {
              _id: '$_id.t',
              fallidos: { $sum: { $cond: ['$_id.f', '$n', 0] } },
              otros: { $sum: { $cond: ['$_id.f', 0, '$n'] } }
            } },
            { $sort: { _id: 1 } }
          ],
          porTipo: [{ $group: { _id: '$tipo', n: { $sum: 1 } } }, { $sort: { n: -1 } }],
          porSistema: [{ $group: { _id: '$origen.sistema', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }],
          porSeveridad: [{ $group: { _id: '$severidad', n: { $sum: 1 } } }],
          porPais: [{ $match: { pais: { $ne: '' } } }, { $group: { _id: '$pais', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]
        }
      }
    ]).allowDiskUse(true);

    const [incAbiertos, solPendientes, usuariosActivos] = await Promise.all([
      Incidente.countDocuments({ estado: { $in: ['abierto', 'en_analisis'] } }),
      Solicitud.countDocuments({ estado: 'pendiente' }),
      Usuario.countDocuments({ activo: true })
    ]);

    res.json({
      dias,
      unidad,
      totales: { ...(r.totales[0] || { total: 0, fallidos: 0, graves: 0, ipsUnicas: 0 }), incAbiertos, solPendientes, usuariosActivos },
      serie: r.serie.map(s => ({ t: s._id, fallidos: s.fallidos, otros: s.otros })),
      porTipo: r.porTipo,
      porSistema: r.porSistema,
      porSeveridad: r.porSeveridad,
      porPais: r.porPais
    });
  } catch (e) { next(e); }
});

// Detección de fuerza bruta y password spraying sobre los intentos fallidos
router.get('/alertas', [query('horas').optional().isInt({ min: 1, max: 720 }).toInt()], validar, async (req, res, next) => {
  try {
    const horas = req.query.horas || 168;
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const datos = await Evento.aggregate([
      { $match: { fecha: { $gte: desde }, tipo: 'login_fallido', ip: { $ne: '' } } },
      { $group: {
        _id: { ip: '$ip', ventana: { $dateTrunc: { date: '$fecha', unit: 'minute', binSize: 10 } } },
        intentos: { $sum: 1 },
        usuarios: { $addToSet: '$usuario' },
        sistemas: { $addToSet: '$origen.sistema' },
        pais: { $first: '$pais' },
        ultimo: { $max: '$fecha' }
      } },
      { $match: { intentos: { $gte: UMBRAL_FUERZA_BRUTA } } },
      { $group: {
        _id: '$_id.ip',
        ventanas: { $sum: 1 },
        intentos: { $sum: '$intentos' },
        maxVentana: { $max: '$intentos' },
        usuarios: { $push: '$usuarios' },
        sistemas: { $push: '$sistemas' },
        pais: { $first: '$pais' },
        ultimo: { $max: '$ultimo' }
      } },
      { $project: {
        _id: 0, ip: '$_id', ventanas: 1, intentos: 1, maxVentana: 1, pais: 1, ultimo: 1,
        usuarios: { $reduce: { input: '$usuarios', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
        sistemas: { $reduce: { input: '$sistemas', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } }
      } },
      { $addFields: {
        cuentas: { $size: '$usuarios' },
        patron: { $cond: [{ $gte: [{ $size: '$usuarios' }, UMBRAL_SPRAYING] }, 'password_spraying', 'fuerza_bruta'] },
        riesgo: { $switch: { branches: [
          { case: { $gte: ['$intentos', 100] }, then: 'critico' },
          { case: { $gte: ['$intentos', 30] }, then: 'alto' }
        ], default: 'medio' } }
      } },
      { $project: { usuarios: { $slice: ['$usuarios', 5] }, ip: 1, ventanas: 1, intentos: 1, maxVentana: 1, pais: 1, ultimo: 1, sistemas: 1, cuentas: 1, patron: 1, riesgo: 1 } },
      { $sort: { intentos: -1 } },
      { $limit: 25 }
    ]).allowDiskUse(true);
    res.json({ horas, umbral: UMBRAL_FUERZA_BRUTA, datos });
  } catch (e) { next(e); }
});

module.exports = router;

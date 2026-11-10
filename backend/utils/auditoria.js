const { Auditoria } = require('../models');

function ipDe(req) {
  return (req.ip || '').replace('::ffff:', '');
}

// Registra una acción en la bitácora. Nunca interrumpe la petición si falla.
async function auditar(req, accion, { entidad = '', entidadId = '', detalle = '', usuario = null, email = '' } = {}) {
  try {
    const u = usuario || req.usuario;
    await Auditoria.create({
      usuario: u ? u._id : null,
      email: email || (u ? u.email : ''),
      accion,
      entidad,
      entidadId: entidadId ? String(entidadId) : '',
      detalle: String(detalle).slice(0, 500),
      ip: ipDe(req),
      userAgent: String(req.get('user-agent') || '').slice(0, 200)
    });
  } catch (e) {
    console.error('[auditoria] no se pudo registrar:', e.message);
  }
}

module.exports = { auditar, ipDe };

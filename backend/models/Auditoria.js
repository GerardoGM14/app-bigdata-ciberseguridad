// Bitácora de acciones realizadas dentro de la plataforma (no existe ruta para editarla ni borrarla)
const mongoose = require('mongoose');

const auditoriaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now, index: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  email: { type: String, default: '' },
  accion: { type: String, required: true, maxlength: 60, index: true },
  entidad: { type: String, maxlength: 40, default: '' },
  entidadId: { type: String, maxlength: 40, default: '' },
  detalle: { type: String, maxlength: 500, default: '' },
  ip: { type: String, maxlength: 45, default: '' },
  userAgent: { type: String, maxlength: 200, default: '' }
}, { collection: 'auditoria', versionKey: false });

module.exports = mongoose.model('Auditoria', auditoriaSchema);

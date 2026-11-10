// Solicitudes de acceso a activos (principio de mínimo privilegio: todo acceso se pide y se aprueba)
const mongoose = require('mongoose');

const solicitudSchema = new mongoose.Schema({
  solicitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  activo: { type: mongoose.Schema.Types.ObjectId, ref: 'Activo', required: true },
  nivelAcceso: { type: String, enum: ['lectura', 'escritura', 'administrador'], required: true },
  justificacion: { type: String, required: true, trim: true, maxlength: 600 },
  fechaTermino: { type: Date, default: null },
  estado: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente', index: true },
  revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  comentarioRevision: { type: String, trim: true, maxlength: 400, default: '' },
  fechaRevision: { type: Date, default: null }
}, { timestamps: true, collection: 'solicitudes_acceso' });

module.exports = mongoose.model('Solicitud', solicitudSchema);

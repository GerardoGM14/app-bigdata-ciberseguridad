const mongoose = require('mongoose');

const CATEGORIAS = ['phishing', 'malware', 'acceso_no_autorizado', 'perdida_equipo', 'fuga_datos', 'suplantacion', 'otro'];
const ESTADOS = ['abierto', 'en_analisis', 'resuelto', 'cerrado'];

const historialSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  accion: { type: String, maxlength: 60 },
  comentario: { type: String, maxlength: 500, default: '' }
}, { _id: false });

const incidenteSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true },
  titulo: { type: String, required: true, trim: true, maxlength: 120 },
  descripcion: { type: String, required: true, trim: true, maxlength: 2000 },
  categoria: { type: String, enum: CATEGORIAS, required: true },
  severidad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], default: 'media' },
  estado: { type: String, enum: ESTADOS, default: 'abierto', index: true },
  activo: { type: mongoose.Schema.Types.ObjectId, ref: 'Activo', default: null },
  fechaDeteccion: { type: Date, required: true },
  reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  historial: [historialSchema]
}, { timestamps: true, collection: 'incidentes' });

incidenteSchema.index({ estado: 1, severidad: 1, createdAt: -1 });

const Incidente = mongoose.model('Incidente', incidenteSchema);
Incidente.CATEGORIAS = CATEGORIAS;
Incidente.ESTADOS = ESTADOS;
module.exports = Incidente;

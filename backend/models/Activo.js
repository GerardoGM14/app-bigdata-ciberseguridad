// Activos de información de la empresa (sistemas, servidores, equipos de red, servicios en la nube)
const mongoose = require('mongoose');

const TIPOS = ['aplicacion', 'servidor', 'red', 'base_datos', 'endpoint', 'nube'];

const activoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
  nombre: { type: String, required: true, trim: true, maxlength: 80 },
  tipo: { type: String, enum: TIPOS, required: true },
  criticidad: { type: String, enum: ['baja', 'media', 'alta', 'critica'], default: 'media' },
  ubicacion: { type: String, trim: true, maxlength: 80, default: '' },
  descripcion: { type: String, trim: true, maxlength: 400, default: '' },
  responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  activo: { type: Boolean, default: true }
}, { timestamps: true, collection: 'activos' });

const Activo = mongoose.model('Activo', activoSchema);
Activo.TIPOS = TIPOS;
module.exports = Activo;

// Eventos de seguridad (logs). Es la colección de mayor volumen, por eso se define como
// colección de series de tiempo: MongoDB agrupa internamente los documentos por "origen"
// y por ventana de tiempo, lo que reduce el almacenamiento y acelera las consultas por rango.
const mongoose = require('mongoose');
const env = require('../config/env');

const TIPOS = ['login_ok', 'login_fallido', 'acceso_denegado', 'cambio_privilegios',
  'malware_detectado', 'conexion_vpn', 'descarga_masiva', 'escaneo_puertos', 'otro'];
const SEVERIDADES = ['info', 'baja', 'media', 'alta', 'critica'];

const eventoSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  origen: {
    sistema: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 }
  },
  tipo: { type: String, enum: TIPOS, required: true },
  severidad: { type: String, enum: SEVERIDADES, default: 'info' },
  ip: { type: String, trim: true, maxlength: 45, default: '' },
  usuario: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
  pais: { type: String, trim: true, uppercase: true, maxlength: 2, default: '' },
  mensaje: { type: String, trim: true, maxlength: 300, default: '' },
  lote: { type: String, default: null } // identifica la carga masiva que lo insertó
}, {
  collection: 'eventos',
  versionKey: false,
  timeseries: { timeField: 'fecha', metaField: 'origen', granularity: 'seconds' },
  expireAfterSeconds: env.RETENCION_EVENTOS_DIAS * 24 * 3600
});

eventoSchema.index({ 'origen.sistema': 1, fecha: -1 });
eventoSchema.index({ tipo: 1, fecha: -1 });
eventoSchema.index({ ip: 1, fecha: -1 });

const Evento = mongoose.model('Evento', eventoSchema);
Evento.TIPOS = TIPOS;
Evento.SEVERIDADES = SEVERIDADES;
module.exports = Evento;

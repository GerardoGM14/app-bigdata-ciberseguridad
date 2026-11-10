// Tokens de recuperación de contraseña. Solo se guarda el hash SHA-256 del token;
// el índice TTL elimina el documento automáticamente cuando expira.
const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiraEn: { type: Date, required: true },
  usado: { type: Boolean, default: false },
  ipSolicitud: { type: String, default: '' }
}, { timestamps: true, collection: 'tokens_recuperacion' });

tokenSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenRecuperacion', tokenSchema);

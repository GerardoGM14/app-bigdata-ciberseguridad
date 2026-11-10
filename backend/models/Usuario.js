const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 60 },
  apellido: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true, select: false },
  rol: { type: String, enum: ['admin', 'colaborador'], default: 'colaborador', index: true },
  area: { type: String, trim: true, maxlength: 60, default: '' },
  cargo: { type: String, trim: true, maxlength: 60, default: '' },
  telefono: { type: String, trim: true, maxlength: 20, default: '' },
  activo: { type: Boolean, default: true },
  intentosFallidos: { type: Number, default: 0, select: false },
  bloqueadoHasta: { type: Date, default: null, select: false },
  passwordCambiadaEn: { type: Date, default: Date.now, select: false },
  ultimoAcceso: { type: Date, default: null }
}, { timestamps: true, collection: 'usuarios' });

usuarioSchema.methods.estaBloqueado = function () {
  return Boolean(this.bloqueadoHasta && this.bloqueadoHasta > new Date());
};

usuarioSchema.methods.toPublico = function () {
  return {
    id: this._id,
    nombre: this.nombre,
    apellido: this.apellido,
    email: this.email,
    rol: this.rol,
    area: this.area,
    cargo: this.cargo,
    telefono: this.telefono,
    activo: this.activo,
    ultimoAcceso: this.ultimoAcceso,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Usuario', usuarioSchema);

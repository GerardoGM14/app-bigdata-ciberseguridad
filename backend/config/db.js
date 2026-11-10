const mongoose = require('mongoose');

mongoose.set('strictQuery', true); // descarta filtros con campos que no existen en el esquema

async function conectar(uri) {
  if (!uri) throw new Error('Falta MONGODB_URI');
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000
  });
  // Crea las colecciones (incluida la de series de tiempo) y los índices declarados en los modelos
  require('../models');
  for (const m of Object.values(mongoose.models)) {
    await m.createCollection().catch(() => {});
    await m.syncIndexes();
  }
  console.log(`[db] conectado a la base "${mongoose.connection.name}"`);
}

module.exports = { conectar };

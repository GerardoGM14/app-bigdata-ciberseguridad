// Levanta la aplicación con un MongoDB temporal en memoria (no requiere instalar MongoDB).
// Útil para probar en local: los datos se pierden al detener el proceso.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'centinela' } });
  const uri = mongo.getUri('centinela');
  console.log(`[dev] MongoDB en memoria: ${uri}`);
  const { iniciar } = require('../../backend/server');
  await iniciar(uri);
  const { sembrar } = require('./seed');
  await sembrar({ reset: true, totalEventos: parseInt(process.env.EVENTOS, 10) || 60000 });
  const cerrar = async () => { await mongo.stop(); process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
})().catch(e => { console.error(e); process.exit(1); });

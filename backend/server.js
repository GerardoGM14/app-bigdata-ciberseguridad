const env = require('./config/env');
const { conectar } = require('./config/db');
const app = require('./app');

async function iniciar(uri = env.MONGODB_URI) {
  await conectar(uri);
  return new Promise(resolve => {
    const servidor = app.listen(env.PORT, () => {
      console.log(`[centinela] escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
      resolve(servidor);
    });
  });
}

if (require.main === module) {
  iniciar().catch(err => {
    console.error('[centinela] no se pudo iniciar:', err.message);
    process.exit(1);
  });
}

module.exports = { iniciar };

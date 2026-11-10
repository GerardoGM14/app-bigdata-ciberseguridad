// Prueba de rendimiento: mide la ingesta y el tiempo de respuesta de la API analítica
// con distintos volúmenes de eventos. Usa un MongoDB en memoria, así que no toca datos reales.
// Uso: node database/scripts/benchmark.js
process.env.PORT = process.env.PORT || '3100';
process.env.LIMITE_AUTH = '1000';
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const VOLUMENES = (process.env.VOLUMENES || '50000,150000,300000').split(',').map(Number);
const ms = t => Number(process.hrtime.bigint() - t) / 1e6;

(async () => {
  const mongo = await MongoMemoryServer.create();
  const { iniciar } = require('../../backend/server');
  const servidor = await iniciar(mongo.getUri('centinela_bench'));
  const { sembrar } = require('./seed');
  const { Evento } = require('../../backend/models');
  const { generarEventos } = require('./generador');
  await sembrar({ reset: true, totalEventos: 0, log: () => {} });

  const base = `http://localhost:${process.env.PORT}`;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@cordillera.demo', password: 'Admin#Centinela2026' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const medir = async url => {
    const tiempos = [];
    for (let i = 0; i < 5; i++) {
      const t = process.hrtime.bigint();
      const r = await fetch(base + url, { headers: { cookie } });
      await r.json();
      tiempos.push(ms(t));
    }
    tiempos.sort((a, b) => a - b);
    return tiempos[2]; // mediana de 5 ejecuciones
  };

  const filas = [];
  let acumulado = 0;
  for (const objetivo of VOLUMENES) {
    const nuevos = objetivo - acumulado;
    const eventos = generarEventos({ total: nuevos, dias: 30, seed: objetivo, usuarios: ['a@cordillera.demo', 'b@cordillera.demo', 'c@cordillera.demo', 'd@cordillera.demo', 'e@cordillera.demo'] });
    const t = process.hrtime.bigint();
    for (let i = 0; i < eventos.length; i += 1000) await Evento.insertMany(eventos.slice(i, i + 1000), { ordered: false, lean: true });
    const tIngesta = ms(t);
    acumulado = objetivo;
    const fila = {
      eventos: objetivo,
      ingestaSeg: +(tIngesta / 1000).toFixed(2),
      eventosPorSeg: Math.round(nuevos / (tIngesta / 1000)),
      resumen7dMs: Math.round(await medir('/api/analitica/resumen?dias=7')),
      resumen30dMs: Math.round(await medir('/api/analitica/resumen?dias=30')),
      alertasMs: Math.round(await medir('/api/analitica/alertas?horas=168')),
      filtroIpMs: Math.round(await medir('/api/eventos?ip=45.155.205.233'))
    };
    filas.push(fila);
    console.log(JSON.stringify(fila));
  }
  const stats = await mongoose.connection.db.command({ collStats: 'system.buckets.eventos' }).catch(() => null);
  if (stats) console.log(JSON.stringify({ buckets: stats.count, tamanoDatosMB: +(stats.size / 1048576).toFixed(1), almacenamientoMB: +(stats.storageSize / 1048576).toFixed(1), indicesMB: +(stats.totalIndexSize / 1048576).toFixed(1) }));
  console.table(filas);
  servidor.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

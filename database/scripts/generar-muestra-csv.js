// Genera los archivos de ejemplo para probar la carga masiva:
//  - database/muestras/eventos_muestra.csv     (5.000 eventos válidos de los últimos 3 días)
//  - database/muestras/eventos_con_errores.csv (filas válidas mezcladas con filas inválidas)
//  - database/muestras/eventos_muestra.json    (200 eventos en formato JSON)
const fs = require('fs');
const path = require('path');
const { generarEventos } = require('./generador');

const dir = path.join(__dirname, '..', 'muestras');
fs.mkdirSync(dir, { recursive: true });
const usuarios = ['colaborador@cordillera.demo', 'admin@cordillera.demo', 'javiera.rojas3@cordillera.demo', 'tomas.silva9@cordillera.demo', 'paula.araya12@cordillera.demo'];
const cols = ['fecha', 'sistema', 'tipo', 'severidad', 'ip', 'usuario', 'pais', 'mensaje'];
const csv = v => /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const fila = e => [e.fecha.toISOString(), e.origen.sistema, e.tipo, e.severidad, e.ip, e.usuario, e.pais, e.mensaje].map(csv).join(',');

const ev = generarEventos({ total: 5000, dias: 3, usuarios, seed: 99 }).sort((a, b) => a.fecha - b.fecha);
fs.writeFileSync(path.join(dir, 'eventos_muestra.csv'), [cols.join(','), ...ev.map(fila)].join('\n'));

const malas = [
  'no-es-fecha,VPN,login_ok,info,10.10.1.5,demo@cordillera.demo,,Fecha inválida',
  `${new Date().toISOString()},VPN,borrar_todo,info,10.10.1.5,demo@cordillera.demo,,Tipo no reconocido`,
  `${new Date().toISOString()},VPN,login_ok,info,999.1.1.1,demo@cordillera.demo,,IP inválida`,
  `${new Date().toISOString()},"VPN; DROP",login_ok,info,10.0.0.1,demo@cordillera.demo,,Sistema inválido`,
  `${new Date(Date.now() + 86400000 * 3).toISOString()},ERP,login_ok,info,10.0.0.1,demo@cordillera.demo,,Fecha futura`
];
const mezcla = [cols.join(','), ...ev.slice(0, 95).map(fila), ...malas];
fs.writeFileSync(path.join(dir, 'eventos_con_errores.csv'), mezcla.join('\n'));

fs.writeFileSync(path.join(dir, 'eventos_muestra.json'), JSON.stringify(ev.slice(0, 200).map(e => ({
  fecha: e.fecha, sistema: e.origen.sistema, tipo: e.tipo, severidad: e.severidad, ip: e.ip, usuario: e.usuario, pais: e.pais, mensaje: e.mensaje
})), null, 2));
console.log('Archivos de muestra generados en', dir);

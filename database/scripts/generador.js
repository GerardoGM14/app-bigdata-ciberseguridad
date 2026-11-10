// Generador de eventos sintéticos con patrones realistas para Transportes Cordillera SpA:
// tráfico normal concentrado en horario laboral, fallos ocasionales de contraseña y
// ataques puntuales (fuerza bruta, password spraying, escaneo de puertos, malware).

const SISTEMAS = ['ERP', 'WMS', 'VPN', 'CORREO', 'PORTAL', 'FW-PERIM', 'AD', 'GPS-FLOTA', 'BD-OPER', 'NAS'];
const PESO_SISTEMA = [14, 10, 16, 18, 12, 9, 10, 5, 3, 3];
const AREAS = ['Operaciones', 'Bodega', 'Finanzas', 'Comercial', 'RR.HH.', 'TI', 'Flota', 'Gerencia'];
const NOMBRES = ['Camila', 'Matías', 'Valentina', 'Benjamín', 'Javiera', 'Vicente', 'Fernanda', 'Tomás', 'Catalina',
  'Diego', 'Antonia', 'Joaquín', 'Constanza', 'Sebastián', 'Isidora', 'Martín', 'Francisca', 'Lucas', 'Josefa',
  'Nicolás', 'Daniela', 'Felipe', 'Paula', 'Cristóbal', 'Macarena', 'Ignacio', 'Carolina', 'Rodrigo'];
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda',
  'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela',
  'Castillo', 'Tapia', 'Reyes', 'Gutiérrez', 'Castro', 'Pizarro', 'Álvarez', 'Vásquez'];
const ATACANTES = [
  { ip: '185.220.101.47', pais: 'DE' }, { ip: '45.155.205.233', pais: 'RU' },
  { ip: '103.145.13.92', pais: 'CN' }, { ip: '191.96.12.18', pais: 'BR' },
  { ip: '193.32.162.71', pais: 'NL' }, { ip: '61.177.172.140', pais: 'CN' }
];

function semilla(s) { // PRNG determinista (mulberry32) para que los datos sean reproducibles
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crearGenerador(seed = 2026) {
  const rnd = semilla(seed);
  const elegir = arr => arr[Math.floor(rnd() * arr.length)];
  const elegirPeso = (arr, pesos) => {
    const total = pesos.reduce((a, b) => a + b, 0);
    let x = rnd() * total;
    for (let i = 0; i < arr.length; i++) { x -= pesos[i]; if (x <= 0) return arr[i]; }
    return arr[arr.length - 1];
  };
  const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ipInterna = () => `10.${elegir([10, 20, 30])}.${Math.floor(rnd() * 8)}.${2 + Math.floor(rnd() * 250)}`;
  const ipChile = () => `${elegir(['181.43', '190.161', '200.83', '186.10', '152.172'])}.${Math.floor(rnd() * 255)}.${1 + Math.floor(rnd() * 253)}`;

  return { rnd, elegir, elegirPeso, quitarTildes, ipInterna, ipChile };
}

function generarEventos({ total = 60000, dias = 30, usuarios = [], seed = 2026, hasta = new Date(), lote = null }) {
  const g = crearGenerador(seed);
  const correos = usuarios.length ? usuarios : ['operaciones@cordillera.demo'];
  const fin = hasta.getTime();
  const inicio = fin - dias * 24 * 3600 * 1000;
  const eventos = [];

  // Instante aleatorio con más probabilidad entre 8:00 y 19:00 de lunes a sábado (hora local)
  function instanteLaboral() {
    for (;;) {
      const t = inicio + g.rnd() * (fin - inicio);
      const d = new Date(t);
      const h = (d.getUTCHours() + 24 - 3) % 24; // aproximación a hora de Chile
      const dow = d.getUTCDay();
      const peso = (h >= 8 && h <= 19 ? 1 : 0.12) * (dow === 0 ? 0.25 : 1);
      if (g.rnd() < peso) return d;
    }
  }

  const base = Math.floor(total * 0.9);
  for (let i = 0; i < base; i++) {
    const sistema = g.elegirPeso(SISTEMAS, PESO_SISTEMA);
    const usuario = g.elegir(correos);
    const remoto = sistema === 'VPN' || sistema === 'PORTAL' || g.rnd() < 0.15;
    const ip = remoto ? g.ipChile() : g.ipInterna();
    let tipo = g.elegirPeso(['login_ok', 'login_fallido', 'acceso_denegado', 'conexion_vpn', 'otro', 'cambio_privilegios', 'descarga_masiva'],
      [70, 7, 4, sistema === 'VPN' ? 25 : 0, 6, 0.4, sistema === 'NAS' || sistema === 'BD-OPER' ? 3 : 0.3]);
    let severidad = { login_ok: 'info', login_fallido: 'baja', acceso_denegado: 'media', conexion_vpn: 'info', otro: 'info', cambio_privilegios: 'alta', descarga_masiva: 'alta' }[tipo];
    let mensaje = {
      login_ok: 'Autenticación correcta', login_fallido: 'Contraseña incorrecta', acceso_denegado: 'Intento de acceso a recurso sin permiso',
      conexion_vpn: 'Túnel VPN establecido', otro: 'Evento operativo', cambio_privilegios: 'Usuario agregado a grupo privilegiado',
      descarga_masiva: 'Descarga de volumen inusual de archivos'
    }[tipo];
    if (sistema === 'FW-PERIM' && g.rnd() < 0.35) { tipo = 'escaneo_puertos'; severidad = 'media'; mensaje = 'Escaneo de puertos bloqueado'; }
    eventos.push({ fecha: instanteLaboral(), sistema, tipo, severidad, ip, usuario, pais: remoto ? 'CL' : '', mensaje });
  }

  // Ataques: ráfagas de intentos fallidos desde IPs externas
  let restantes = total - base;
  const ataques = [];
  const nAtaques = 14;
  for (let a = 0; a < nAtaques; a++) {
    const atk = ATACANTES[a % ATACANTES.length];
    const spraying = a % 4 === 1;
    // Garantiza actividad reciente (últimas 24 h) para que el panel muestre alertas vigentes
    const t0 = a < 3 ? fin - (2 + a * 5) * 3600 * 1000 : inicio + g.rnd() * (fin - inicio - 3600000);
    ataques.push({ atk, spraying, t0, sistema: g.elegir(['VPN', 'PORTAL', 'CORREO']) });
  }
  const porAtaque = Math.floor(restantes * 0.8 / nAtaques);
  for (const at of ataques) {
    for (let k = 0; k < porAtaque; k++) {
      const usuario = at.spraying ? g.elegir(correos) : g.elegir(['admin@cordillera.demo', 'gerencia@cordillera.demo', correos[0]]);
      eventos.push({
        fecha: new Date(at.t0 + k * (8000 + g.rnd() * 20000)), sistema: at.sistema, tipo: 'login_fallido', severidad: 'alta',
        ip: at.atk.ip, usuario, pais: at.atk.pais,
        mensaje: at.spraying ? 'Intento con contraseña común sobre múltiples cuentas' : 'Contraseña incorrecta (ráfaga)'
      });
    }
  }
  restantes -= porAtaque * nAtaques;

  // Eventos críticos dispersos: malware, escaneos externos y descargas sospechosas
  for (let i = 0; i < restantes; i++) {
    const tipo = g.elegirPeso(['malware_detectado', 'escaneo_puertos', 'descarga_masiva', 'acceso_denegado'], [3, 5, 2, 4]);
    const atk = g.elegir(ATACANTES);
    const interno = tipo === 'malware_detectado' || tipo === 'descarga_masiva';
    eventos.push({
      fecha: new Date(inicio + g.rnd() * (fin - inicio)),
      sistema: tipo === 'escaneo_puertos' ? 'FW-PERIM' : g.elegir(SISTEMAS),
      tipo,
      severidad: tipo === 'malware_detectado' ? 'critica' : 'alta',
      ip: interno ? g.ipInterna() : atk.ip,
      usuario: interno ? g.elegir(correos) : '',
      pais: interno ? '' : atk.pais,
      mensaje: { malware_detectado: 'Antivirus detectó y aisló archivo malicioso', escaneo_puertos: 'Escaneo externo de puertos', descarga_masiva: 'Descarga masiva fuera de horario', acceso_denegado: 'Acceso denegado por política' }[tipo]
    });
  }

  return eventos.map(e => ({
    fecha: e.fecha, origen: { sistema: e.sistema }, tipo: e.tipo, severidad: e.severidad,
    ip: e.ip, usuario: e.usuario, pais: e.pais, mensaje: e.mensaje, lote
  }));
}

module.exports = { generarEventos, crearGenerador, SISTEMAS, AREAS, NOMBRES, APELLIDOS };

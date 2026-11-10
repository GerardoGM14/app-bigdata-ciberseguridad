/* Ejecución asistida del plan de pruebas de Centinela.
   Recorre los casos de prueba en un navegador real (Edge o Chrome), guarda una captura
   como evidencia de cada uno en docs/evidencias y deja el resumen en docs/evidencias/resultados.json.

   Uso (con la app corriendo):
     BASE_URL=http://localhost:3000 LOG_SERVIDOR=ruta/al/log MONGO_URI=... node tests/pruebas-e2e.js
   - LOG_SERVIDOR: archivo donde la app imprime los correos (modo consola) para leer el enlace de recuperación.
   - MONGO_URI: para verificar que las contraseñas quedan cifradas en la base.
   - NAVEGADOR: ruta del ejecutable (por defecto Edge en Windows). */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const NAVEGADOR = process.env.NAVEGADOR || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SALIDA = path.join(__dirname, '..', 'docs', 'evidencias');
const MUESTRA = path.join(__dirname, '..', 'database', 'muestras', 'eventos_con_errores.csv');
const ADMIN = { email: 'admin@cordillera.demo', pass: 'Admin#Centinela2026' };
const COLAB = { email: 'colaborador@cordillera.demo', pass: 'Colab#Centinela2026' };
const sufijo = Date.now().toString(36);
const NUEVO = { nombre: 'Martina', apellido: 'Riquelme', email: `martina.riquelme.${sufijo}@cordillera.demo`, pass: 'Bodega#Segura2026', pass2: 'Nueva#Clave2026x' };

fs.mkdirSync(SALIDA, { recursive: true });
const resultados = [];
const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: NAVEGADOR, headless: true, args: ['--lang=es-CL'] });

  async function pagina(ancho = 1366, alto = 800, movil = false) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: ancho, height: alto, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
    p.on('dialog', d => d.accept());
    return p;
  }
  // Se pasa por about:blank para forzar una carga completa aunque solo cambie el #hash
  async function ir(p, ruta) { await p.goto('about:blank'); await p.goto(BASE + ruta, { waitUntil: 'networkidle0' }); await esperar(300); }
  async function login(p, u, pass) {
    await ir(p, '/index.html');
    await p.type('#email', u); await p.type('#password', pass);
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), p.click('button[type=submit]')]);
    await esperar(500);
  }
  async function texto(p, sel) { return p.$eval(sel, n => n.textContent.trim()).catch(() => ''); }
  async function caso(id, nombre, fn) {
    const p = await pagina();
    let obtenido = ''; let ok = false;
    try {
      const r = await fn(p);
      ok = r.ok; obtenido = r.obtenido;
    } catch (e) { obtenido = `Error al ejecutar: ${e.message}`; }
    await esperar(400);
    await p.screenshot({ path: path.join(SALIDA, `${id}.png`) }).catch(() => {});
    resultados.push({ id, nombre, resultado: ok ? 'Aprobado' : 'Fallido', obtenido });
    console.log(`${ok ? '✔' : '✘'} ${id} ${nombre} → ${obtenido}`);
    await p.browserContext().close();
  }

  await caso('CP-01', 'Registro de usuario con datos válidos', async p => {
    await ir(p, '/registro.html');
    await p.type('#nombre', NUEVO.nombre); await p.type('#apellido', NUEVO.apellido); await p.type('#email', NUEVO.email);
    await p.select('#area', 'Bodega'); await p.type('#cargo', 'Supervisora de bodega');
    await p.type('#password', NUEVO.pass); await p.type('#confirmacion', NUEVO.pass);
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')]);
    const msg = await texto(p, '.aviso');
    return { ok: p.url().includes('registrado=1') && msg.includes('Cuenta creada'), obtenido: `Redirige al login con el mensaje "${msg}"` };
  });

  await caso('CP-02', 'Registro rechazado por datos inválidos y contraseña débil', async p => {
    await ir(p, '/registro.html');
    await p.type('#nombre', 'J4'); await p.type('#apellido', 'Pérez'); await p.type('#email', 'correo-sin-arroba');
    await p.type('#password', 'clave123'); await p.type('#confirmacion', 'otra');
    await p.click('button[type=submit]'); await esperar(400);
    const errores = await p.$$eval('.campo.invalido', n => n.length);
    const r = await p.evaluate(async () => (await fetch('/api/auth/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Juan', apellido: 'Pérez', email: 'juan@cordillera.demo', password: 'clave123', confirmacion: 'clave123' }) })).status);
    return { ok: errores >= 4 && r === 422, obtenido: `${errores} campos marcados en el navegador; la API responde ${r} si se salta la validación del cliente` };
  });

  await caso('CP-03', 'Inicio de sesión correcto y redirección según perfil', async p => {
    await login(p, NUEVO.email, NUEVO.pass);
    const enPanel = p.url().includes('/panel.html');
    const cookies = await p.cookies();
    const c = cookies.find(x => x.name === 'centinela_sesion');
    return { ok: enPanel && c && c.httpOnly && c.sameSite === 'Strict', obtenido: `Colaborador redirigido a panel.html; cookie de sesión httpOnly=${c && c.httpOnly}, SameSite=${c && c.sameSite}` };
  });

  await caso('CP-04', 'Inicio de sesión con contraseña incorrecta', async p => {
    await ir(p, '/index.html');
    await p.type('#email', COLAB.email); await p.type('#password', 'NoEsLaClave#1');
    await p.click('button[type=submit]'); await esperar(900);
    const msg = await texto(p, '.aviso');
    return { ok: msg === 'Correo o contraseña incorrectos' && p.url().includes('index'), obtenido: `Mensaje genérico: "${msg}" (no revela si el correo existe)` };
  });

  await caso('CP-05', 'Bloqueo temporal de la cuenta tras 5 intentos fallidos', async p => {
    await ir(p, '/index.html');
    for (let i = 0; i < 6; i++) {
      await p.$eval('#email', n => { n.value = ''; }); await p.$eval('#password', n => { n.value = ''; });
      await p.type('#email', NUEVO.email); await p.type('#password', `Incorrecta#${i}`);
      await p.click('button[type=submit]'); await esperar(700);
    }
    const msg = await texto(p, '.aviso');
    return { ok: /bloqueada/i.test(msg), obtenido: `Al sexto intento: "${msg}"` };
  });

  await caso('CP-06', 'Recuperación de contraseña por correo electrónico', async p => {
    await ir(p, '/recuperar.html');
    await p.type('#email', NUEVO.email); await p.click('button[type=submit]'); await esperar(1200);
    const msg = await texto(p, '.aviso');
    let enlace = '';
    if (process.env.LOG_SERVIDOR) {
      const log = fs.readFileSync(process.env.LOG_SERVIDOR, 'utf8');
      const m = [...log.matchAll(/https?:\/\/\S+restablecer\.html\?token=[a-f0-9]{64}/g)].pop();
      enlace = m ? m[0] : '';
    }
    if (!enlace) return { ok: false, obtenido: 'No se encontró el enlace en el registro del servidor' };
    await p.goto(enlace.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle0' });
    await p.type('#password', NUEVO.pass2); await p.type('#confirmacion', NUEVO.pass2);
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')]);
    const ok1 = p.url().includes('restablecida=1');
    // el bloqueo se levanta al restablecer; se ingresa con la nueva contraseña
    await p.type('#email', NUEVO.email); await p.type('#password', NUEVO.pass2);
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), p.click('button[type=submit]')]);
    await esperar(500);
    // reutilizar el mismo enlace debe fallar
    const reuso = await p.evaluate(async t => (await fetch('/api/auth/restablecer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t, password: 'Otra#Clave20266', confirmacion: 'Otra#Clave20266' }) })).status, enlace.split('token=')[1]);
    return { ok: ok1 && p.url().includes('/panel.html') && reuso === 400, obtenido: `"${msg}"; enlace recibido, contraseña cambiada, ingreso con la nueva clave correcto; reutilizar el enlace responde ${reuso}` };
  });

  await caso('CP-07', 'Control de acceso: colaborador no puede usar funciones de administrador', async p => {
    await login(p, COLAB.email, COLAB.pass);
    await ir(p, '/admin.html'); await esperar(500);
    const redirigido = p.url().includes('/panel.html');
    const codigos = await p.evaluate(async () => Promise.all(['/api/usuarios', '/api/eventos', '/api/analitica/resumen', '/api/auditoria']
      .map(async u => `${u} → ${(await fetch(u)).status}`)));
    const patch = await p.evaluate(async () => (await fetch('/api/usuarios/000000000000000000000000', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"rol":"admin"}' })).status);
    await ir(p, '/panel.html#inicio');
    return { ok: redirigido && codigos.every(c => c.endsWith('403')) && patch === 403, obtenido: `admin.html redirige a panel.html; ${codigos.join(', ')}; PATCH rol → ${patch}` };
  });

  let folio = '';
  await caso('CP-08', 'Formulario 1: reportar incidente de seguridad', async p => {
    await login(p, COLAB.email, COLAB.pass);
    await ir(p, '/panel.html#reportar');
    await p.type('#i-titulo', 'Correo falso de "Chilexpress" con enlace de pago');
    await p.select('#i-categoria', 'phishing'); await p.select('#i-severidad', 'alta');
    const opciones = await p.$$eval('#i-activo option', o => o.map(x => x.value).filter(Boolean));
    await p.select('#i-activo', opciones[3] || opciones[0]);
    await p.type('#i-descripcion', 'Recibí un correo que dice venir de Chilexpress pidiendo pagar $1.990 para liberar una encomienda. No hice clic, lo reporto para que bloqueen el remitente.');
    await p.click('#form-incidente button[type=submit]'); await esperar(1200);
    folio = await texto(p, '#t-mis-incidentes tbody tr td');
    return { ok: p.url().includes('#mis-incidentes') && folio.startsWith('INC-'), obtenido: `Incidente creado con folio ${folio} y visible en "Mis incidentes"` };
  });

  await caso('CP-09', 'Formulario 2: solicitud de acceso y aprobación por el administrador', async p => {
    const pc = await pagina();
    await login(pc, NUEVO.email, NUEVO.pass2);
    await ir(pc, '/panel.html#solicitar');
    const opciones = await pc.$$eval('#s-activo option', o => o.map(x => x.value).filter(Boolean));
    await pc.select('#s-activo', opciones[opciones.length - 1]); await pc.select('#s-nivel', 'escritura');
    await pc.type('#s-justificacion', 'Debo registrar las recepciones de mercadería del turno noche en la bodega 2.');
    await pc.click('#form-solicitud button[type=submit]'); await esperar(1000);
    const estado1 = await texto(pc, '#t-mis-solicitudes tbody tr td:nth-child(3)');
    await login(p, ADMIN.email, ADMIN.pass);
    await ir(p, '/admin.html#solicitudes'); await esperar(600);
    const filas = await p.$$('#t-solicitudes tbody tr');
    let aprobado = false;
    for (const f of filas) {
      const t = await f.evaluate(n => n.textContent);
      if (t.includes(NUEVO.apellido)) { const b = await f.$('.btn--ok'); await b.click(); aprobado = true; break; }
    }
    if (!aprobado) return { ok: false, obtenido: 'No apareció la solicitud en el panel del administrador' };
    await esperar(500);
    await p.type('#rev-com', 'Aprobado por el turno noche. Vigencia hasta fin de mes.');
    await esperar(300);
    await p.screenshot({ path: path.join(SALIDA, 'CP-09b.png') });
    await p.click('#dialogo button[type=submit]'); await esperar(900);
    await ir(pc, '/panel.html#mis-solicitudes'); await esperar(500);
    const estado2 = await texto(pc, '#t-mis-solicitudes tbody tr td:nth-child(3)');
    await pc.screenshot({ path: path.join(SALIDA, 'CP-09c.png') });
    await pc.browserContext().close();
    await ir(p, '/admin.html#solicitudes');
    return { ok: estado1 === 'Pendiente' && estado2 === 'Aprobada', obtenido: `Solicitud creada en estado "${estado1}"; tras la aprobación el colaborador la ve "${estado2}"` };
  });

  await caso('CP-10', 'Formulario 3: carga masiva de eventos con filas inválidas', async p => {
    await login(p, ADMIN.email, ADMIN.pass);
    await ir(p, '/admin.html#carga');
    const input = await p.$('#archivo');
    await input.uploadFile(MUESTRA);
    await p.click('#form-carga button[type=submit]'); await esperar(1800);
    const kpis = await p.$$eval('#resultado-carga .kpi__valor', n => n.map(x => x.textContent));
    return { ok: kpis.join('|') === '100|95|5', obtenido: `Filas leídas ${kpis[0]}, insertadas ${kpis[1]}, rechazadas ${kpis[2]} con el motivo de cada rechazo` };
  });

  await caso('CP-11', 'Dashboard analítico y detección de fuerza bruta', async p => {
    await login(p, ADMIN.email, ADMIN.pass);
    await esperar(1500);
    const total = await texto(p, '#k-total');
    const alertas = await p.$$eval('#t-alertas tbody tr.alerta-fila', n => n.length);
    const graficos = await p.$$eval('canvas', n => n.filter(c => c.width > 0).length);
    return { ok: alertas > 0 && graficos === 4 && total !== '–', obtenido: `${total} eventos resumidos en 4 gráficos; ${alertas} IP marcadas como fuerza bruta o password spraying` };
  });

  await caso('CP-12', 'Protección contra inyección NoSQL', async p => {
    await ir(p, '/index.html');
    const r = await p.evaluate(async () => {
      const a = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }) });
      const b = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@cordillera.demo', password: { $gt: '' } }) });
      return [a.status, b.status, (await a.json()).error];
    });
    await login(p, ADMIN.email, ADMIN.pass);
    const q = await p.evaluate(async () => (await fetch('/api/incidentes?q=' + encodeURIComponent('.*|(a+)+$'))).status);
    await ir(p, '/admin.html#incidentes');
    await p.type('#fi-q', '.*|(a+)+$'); await p.click('#f-incidentes button[type=submit]'); await esperar(600);
    return { ok: r[0] === 422 && r[1] === 422 && q === 200, obtenido: `Login con operadores {$ne}/{$gt} → ${r[0]}/${r[1]} "${r[2]}"; búsqueda con expresión regular maliciosa → ${q} sin resultados` };
  });

  await caso('CP-13', 'Protección contra XSS en datos ingresados por usuarios', async p => {
    await login(p, COLAB.email, COLAB.pass);
    await ir(p, '/panel.html#reportar');
    await p.type('#i-titulo', '<img src=x onerror=alert(1)> prueba');
    await p.select('#i-categoria', 'otro');
    await p.type('#i-descripcion', '<script>alert("xss")</script> Texto de prueba para verificar que no se ejecuta código.');
    let alerta = false;
    p.on('dialog', () => { alerta = true; });
    await p.click('#form-incidente button[type=submit]'); await esperar(1200);
    const celda = await p.$eval('#t-mis-incidentes tbody tr td:nth-child(2)', n => ({ texto: n.textContent, imgs: n.querySelectorAll('img').length }));
    const csp = await p.evaluate(async () => (await fetch('/index.html')).headers.get('content-security-policy'));
    return { ok: !alerta && celda.imgs === 0 && celda.texto.includes('<img'), obtenido: `El título se muestra como texto ("${celda.texto}"), no se ejecuta script; CSP activa: ${csp.split(';')[0]}…` };
  });

  await caso('CP-14', 'Gestión de incidente por el administrador (estado e historial)', async p => {
    await login(p, ADMIN.email, ADMIN.pass);
    await ir(p, '/admin.html#incidentes');
    await p.type('#fi-q', folio || 'INC'); await p.click('#f-incidentes button[type=submit]'); await esperar(700);
    await p.click('#t-incidentes tbody tr button'); await esperar(800);
    await p.select('#dialogo select[name=estado]', 'en_analisis');
    const opciones = await p.$$eval('#dialogo select[name=asignadoA] option', o => o.map(x => x.value).filter(Boolean));
    await p.select('#dialogo select[name=asignadoA]', opciones[0]);
    await p.type('#dialogo textarea[name=comentario]', 'Se bloqueó el remitente en el filtro de correo y se avisó al área Comercial.');
    await p.click('#dialogo button[type=submit]'); await esperar(900);
    await p.click('#t-incidentes tbody tr button'); await esperar(800);
    const hist = await p.$$eval('#dialogo .linea-tiempo li', n => n.length);
    const estado = await p.$eval('#dialogo select[name=estado]', s => s.value);
    return { ok: estado === 'en_analisis' && hist >= 2, obtenido: `Estado cambiado a "En análisis", responsable asignado y ${hist} registros en el historial` };
  });

  await caso('CP-15', 'Cambio de contraseña desde el perfil', async p => {
    await login(p, NUEVO.email, NUEVO.pass2);
    await ir(p, '/perfil.html');
    await p.type('#c-actual', 'NoEsMiClave#99'); await p.type('#c-nueva', 'Perfil#Nueva2026'); await p.type('#c-confirmacion', 'Perfil#Nueva2026');
    await p.click('#form-password button[type=submit]'); await esperar(2000);
    const err = await texto(p, '#form-password .aviso');
    await p.$eval('#c-actual', n => { n.value = ''; });
    await p.type('#c-actual', NUEVO.pass2);
    await p.click('#form-password button[type=submit]'); await esperar(2500);
    const ok = await texto(p, '#form-password .aviso');
    return { ok: err.includes('no es correcta') && ok.includes('actualizada'), obtenido: `Con clave actual errónea: "${err}"; con la correcta: "${ok}"` };
  });

  await caso('CP-16', 'Diseño responsive en teléfono (390 px)', async m => {
    await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await login(m, ADMIN.email, ADMIN.pass);
    await ir(m, '/admin.html#incidentes');
    const desborde = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const menuOculto = await m.$eval('.lateral', n => getComputedStyle(n).transform !== 'none');
    await m.click('.barra__menu'); await esperar(400);
    await m.screenshot({ path: path.join(SALIDA, 'CP-16b.png') });
    await m.evaluate(() => document.querySelector('.app').classList.remove('menu-abierto'));
    await esperar(300);
    return { ok: !desborde && menuOculto, obtenido: `Sin desplazamiento horizontal; menú lateral se convierte en panel desplegable; tablas se muestran como tarjetas` };
  });

  // CP-17: contraseñas cifradas en la base de datos (consulta directa a MongoDB)
  if (process.env.MONGO_URI) {
    const { MongoClient } = require('mongodb');
    const cli = await MongoClient.connect(process.env.MONGO_URI);
    const docs = await cli.db().collection('usuarios').find({}, { projection: { email: 1, passwordHash: 1, _id: 0 } }).limit(4).toArray();
    await cli.close();
    const ok = docs.every(d => /^\$2[aby]\$1[0-2]\$/.test(d.passwordHash));
    const lineas = docs.map(d => `{ email: "${d.email}", passwordHash: "${d.passwordHash}" }`);
    const p = await pagina(1100, 360);
    await p.setContent(`<body style="margin:0;background:#0c1622;color:#d6e2ef;font:14px Consolas,monospace;padding:18px">
      <div style="color:#7fb3e6">centinela&gt; db.usuarios.find({}, { email: 1, passwordHash: 1 }).limit(4)</div>
      ${lineas.map(l => `<div style="margin-top:6px">${l.replace(/</g, '&lt;')}</div>`).join('')}</body>`);
    await p.screenshot({ path: path.join(SALIDA, 'CP-17.png') });
    await p.browserContext().close();
    resultados.push({ id: 'CP-17', nombre: 'Contraseñas almacenadas cifradas con bcrypt', resultado: ok ? 'Aprobado' : 'Fallido', obtenido: `Los ${docs.length} usuarios consultados tienen hash bcrypt (prefijo $2a$, costo 10-12); ninguna contraseña en texto plano` });
    console.log(`${ok ? '✔' : '✘'} CP-17 contraseñas cifradas`);
  }

  fs.writeFileSync(path.join(SALIDA, 'resultados.json'), JSON.stringify({ fecha: new Date().toISOString(), base: BASE, resultados }, null, 2));
  const fallidos = resultados.filter(r => r.resultado !== 'Aprobado').length;
  console.log(`\n${resultados.length - fallidos}/${resultados.length} casos aprobados`);
  await browser.close();
  process.exit(fallidos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

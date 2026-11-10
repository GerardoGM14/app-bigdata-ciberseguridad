// Carga datos iniciales: usuarios de prueba, activos, incidentes, solicitudes y eventos sintéticos.
// Uso: npm run seed            -> agrega datos solo si la base está vacía
//      npm run seed -- --reset -> borra todo y vuelve a cargar
//      EVENTOS=200000 npm run seed -- --reset  -> cambia el volumen de eventos
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { conectar } = require('../../backend/config/db');
const { Usuario, Activo, Evento, Incidente, Solicitud, Auditoria, TokenRecuperacion } = require('../../backend/models');
const { generarEventos, crearGenerador, AREAS, NOMBRES, APELLIDOS } = require('./generador');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@cordillera.demo';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'Admin#Centinela2026';
const COLAB_EMAIL = process.env.SEED_COLAB_EMAIL || 'colaborador@cordillera.demo';
const COLAB_PASS = process.env.SEED_COLAB_PASSWORD || 'Colab#Centinela2026';

async function sembrar({ reset = false, totalEventos = 60000, log = console.log } = {}) {
  if (reset) {
    for (const M of [Usuario, Activo, Evento, Incidente, Solicitud, Auditoria, TokenRecuperacion]) await M.deleteMany({});
    log('[seed] colecciones vaciadas');
  } else if (await Usuario.exists({})) {
    log('[seed] la base ya tiene datos; usa --reset para recargar');
    return;
  }
  const g = crearGenerador(7);

  // Usuarios
  const hashAdmin = await bcrypt.hash(ADMIN_PASS, 12);
  const hashColab = await bcrypt.hash(COLAB_PASS, 12);
  const admin = await Usuario.create({ nombre: 'Andrea', apellido: 'Valdés', email: ADMIN_EMAIL, passwordHash: hashAdmin, rol: 'admin', area: 'TI', cargo: 'Jefa de Seguridad TI', telefono: '+56 9 5555 1001' });
  const analista = await Usuario.create({ nombre: 'Rodrigo', apellido: 'Fuentes', email: 'analista@cordillera.demo', passwordHash: hashAdmin, rol: 'admin', area: 'TI', cargo: 'Analista de Ciberseguridad' });
  const colab = await Usuario.create({ nombre: 'Camila', apellido: 'Soto', email: COLAB_EMAIL, passwordHash: hashColab, rol: 'colaborador', area: 'Operaciones', cargo: 'Coordinadora de Despacho', telefono: '+56 9 5555 2002' });
  const hashOtros = await bcrypt.hash('Cordillera#' + Math.random().toString(36).slice(2, 10), 10);
  const otros = [];
  for (let i = 0; i < 40; i++) {
    const nombre = g.elegir(NOMBRES); const apellido = g.elegir(APELLIDOS);
    otros.push({
      nombre, apellido, email: `${g.quitarTildes(nombre)}.${g.quitarTildes(apellido)}${i}@cordillera.demo`,
      passwordHash: hashOtros, rol: 'colaborador', area: g.elegir(AREAS), cargo: 'Colaborador', activo: i !== 7
    });
  }
  const creados = await Usuario.insertMany(otros);
  log(`[seed] ${creados.length + 3} usuarios`);

  // Activos de información
  const activos = await Activo.insertMany([
    { codigo: 'ERP', nombre: 'ERP corporativo (finanzas y facturación)', tipo: 'aplicacion', criticidad: 'critica', ubicacion: 'Nube privada', responsable: admin._id },
    { codigo: 'WMS', nombre: 'Sistema de gestión de bodegas', tipo: 'aplicacion', criticidad: 'alta', ubicacion: 'CD Pudahuel', responsable: analista._id },
    { codigo: 'VPN', nombre: 'Acceso remoto VPN', tipo: 'red', criticidad: 'alta', ubicacion: 'Casa matriz', responsable: analista._id },
    { codigo: 'CORREO', nombre: 'Correo corporativo', tipo: 'nube', criticidad: 'alta', ubicacion: 'SaaS', responsable: admin._id },
    { codigo: 'PORTAL', nombre: 'Portal de clientes y seguimiento de envíos', tipo: 'aplicacion', criticidad: 'alta', ubicacion: 'Nube pública', responsable: analista._id },
    { codigo: 'FW-PERIM', nombre: 'Firewall perimetral', tipo: 'red', criticidad: 'critica', ubicacion: 'Casa matriz', responsable: analista._id },
    { codigo: 'AD', nombre: 'Directorio de identidades', tipo: 'servidor', criticidad: 'critica', ubicacion: 'Casa matriz', responsable: admin._id },
    { codigo: 'GPS-FLOTA', nombre: 'Plataforma de rastreo GPS de camiones', tipo: 'nube', criticidad: 'media', ubicacion: 'SaaS' },
    { codigo: 'BD-OPER', nombre: 'Base de datos operacional', tipo: 'base_datos', criticidad: 'critica', ubicacion: 'Nube privada', responsable: admin._id },
    { codigo: 'NAS', nombre: 'Servidor de archivos compartidos', tipo: 'servidor', criticidad: 'media', ubicacion: 'Sucursal Antofagasta' }
  ]);
  const act = Object.fromEntries(activos.map(a => [a.codigo, a]));
  log(`[seed] ${activos.length} activos`);

  // Incidentes con distintos estados
  const ahora = Date.now();
  const hace = h => new Date(ahora - h * 3600 * 1000);
  const plantillas = [
    ['Correo sospechoso que suplanta a proveedor de combustible', 'phishing', 'alta', 'en_analisis', 'CORREO', 'Llegó un correo pidiendo actualizar los datos bancarios del proveedor. El remitente usa un dominio parecido al real y el enlace lleva a una página de inicio de sesión falsa.'],
    ['Notebook de despacho extraviado en ruta a Rancagua', 'perdida_equipo', 'media', 'abierto', null, 'El conductor informa que el notebook de despacho quedó en un servicentro. Tiene sesión del WMS guardada y planillas con datos de clientes.'],
    ['Antivirus alertó archivo malicioso en equipo de facturación', 'malware', 'critica', 'resuelto', 'ERP', 'Al abrir un adjunto con supuesta factura, el antivirus bloqueó un archivo y aisló el equipo. Se requiere revisar si alcanzó a ejecutar algo.'],
    ['Múltiples intentos de acceso a la VPN durante la madrugada', 'acceso_no_autorizado', 'alta', 'en_analisis', 'VPN', 'Centinela mostró una ráfaga de intentos fallidos desde una IP extranjera contra cuentas de gerencia entre las 3:00 y las 4:00.'],
    ['Cliente reporta que ve envíos de otra empresa en el portal', 'fuga_datos', 'critica', 'abierto', 'PORTAL', 'Un cliente llamó indicando que al filtrar por fecha aparecieron guías de despacho que no le pertenecen. Adjunta captura por correo.'],
    ['Llamada de supuesto soporte técnico solicitando contraseña', 'suplantacion', 'media', 'cerrado', null, 'Una persona llamó a recepción diciendo ser de soporte del ERP y pidió la contraseña de la cuenta de facturación. No se entregó.'],
    ['Carpeta compartida del NAS accesible para todo el personal', 'acceso_no_autorizado', 'media', 'resuelto', 'NAS', 'La carpeta de remuneraciones aparece disponible para cualquier usuario del dominio. Debería ser solo de RR.HH.'],
    ['Pendrive desconocido conectado en bodega', 'malware', 'baja', 'cerrado', 'WMS', 'Se encontró un pendrive conectado al computador de la bodega 2. Nadie sabe de quién es.'],
    ['Correo masivo con enlace a "seguimiento de encomienda"', 'phishing', 'media', 'abierto', 'CORREO', 'Varias personas de Comercial recibieron un correo con un enlace acortado para "rastrear encomienda". Dos alcanzaron a hacer clic.'],
    ['Usuario agregado a grupo de administradores sin solicitud', 'acceso_no_autorizado', 'alta', 'en_analisis', 'AD', 'En los eventos aparece un cambio de privilegios sobre una cuenta de Bodega que no tiene solicitud aprobada.']
  ];
  const incidentes = plantillas.map((p, i) => {
    const rep = i % 3 === 0 ? colab : g.elegir(creados);
    const creado = hace(10 + i * 37);
    const historial = [{ fecha: creado, usuario: rep._id, accion: 'creado', comentario: 'Incidente reportado' }];
    if (p[3] !== 'abierto') historial.push({ fecha: new Date(creado.getTime() + 2 * 3600000), usuario: analista._id, accion: 'estado: abierto → en_analisis', comentario: 'Se revisa el caso y se contacta al usuario.' });
    if (p[3] === 'resuelto' || p[3] === 'cerrado') historial.push({ fecha: new Date(creado.getTime() + 20 * 3600000), usuario: analista._id, accion: `estado: en_analisis → ${p[3]}`, comentario: 'Se aplicaron medidas de contención y se informó al área.' });
    return {
      folio: `INC-2026${String(10 + (i % 2)).padStart(2, '0')}${String(1 + i * 2).padStart(2, '0')}-${(4096 + i * 977).toString(16).toUpperCase()}`,
      titulo: p[0], descripcion: p[5], categoria: p[1], severidad: p[2], estado: p[3],
      activo: p[4] ? act[p[4]]._id : null, fechaDeteccion: new Date(creado.getTime() - 3600000),
      reportadoPor: rep._id, asignadoA: p[3] === 'abierto' ? null : analista._id, historial,
      createdAt: creado, updatedAt: historial[historial.length - 1].fecha
    };
  });
  await Incidente.insertMany(incidentes, { timestamps: false });
  log(`[seed] ${incidentes.length} incidentes`);

  // Solicitudes de acceso
  const solicitudes = [];
  const justificaciones = ['Necesito revisar el estado de las órdenes de despacho de mi zona.', 'Reemplazo a un compañero de vacaciones durante dos semanas.',
    'Debo cargar las facturas de proveedores del cierre mensual.', 'Soporte a la auditoría externa de inventario.', 'Ingreso nuevo al área, requiero acceso para mis funciones.'];
  for (let i = 0; i < 14; i++) {
    const estado = i < 5 ? 'pendiente' : (i % 3 === 0 ? 'rechazada' : 'aprobada');
    const solicitante = i % 4 === 0 ? colab : g.elegir(creados);
    const creado = hace(5 + i * 20);
    solicitudes.push({
      solicitante: solicitante._id, activo: g.elegir(activos)._id,
      nivelAcceso: g.elegir(['lectura', 'lectura', 'escritura', 'administrador']), justificacion: g.elegir(justificaciones),
      estado, revisadoPor: estado === 'pendiente' ? null : admin._id,
      comentarioRevision: estado === 'aprobada' ? 'Aprobado con vigencia limitada.' : estado === 'rechazada' ? 'No corresponde a sus funciones; solicitar a jefatura.' : '',
      fechaRevision: estado === 'pendiente' ? null : new Date(creado.getTime() + 6 * 3600000),
      createdAt: creado, updatedAt: creado
    });
  }
  await Solicitud.insertMany(solicitudes, { timestamps: false });
  log(`[seed] ${solicitudes.length} solicitudes de acceso`);

  // Eventos de seguridad (volumen principal)
  const correos = [ADMIN_EMAIL, COLAB_EMAIL, 'analista@cordillera.demo', ...creados.map(u => u.email)];
  const inicio = Date.now();
  const eventos = generarEventos({ total: totalEventos, dias: 30, usuarios: correos, lote: 'seed' });
  for (let i = 0; i < eventos.length; i += 5000) {
    await Evento.insertMany(eventos.slice(i, i + 5000), { ordered: false, lean: true });
  }
  log(`[seed] ${eventos.length} eventos insertados en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  log(`[seed] listo. Admin: ${ADMIN_EMAIL} / ${ADMIN_PASS} · Colaborador: ${COLAB_EMAIL} / ${COLAB_PASS}`);
}

if (require.main === module) {
  (async () => {
    await conectar(process.env.MONGODB_URI);
    await sembrar({ reset: process.argv.includes('--reset'), totalEventos: parseInt(process.env.EVENTOS, 10) || 60000 });
    await mongoose.disconnect();
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { sembrar };

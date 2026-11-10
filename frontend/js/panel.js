// Panel del perfil Colaborador
(function () {
  'use strict';
  const C = window.C;
  const { el, api, chip, fmtFecha, etiqueta } = C;
  let misIncidentes = [];
  let misSolicitudes = [];

  function fechaLocalAhora() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  async function cargarActivos() {
    const r = await api('GET', '/api/activos/opciones');
    const opciones = (r.datos.datos || []).map(a => ({ valor: a._id, texto: `${a.nombre} (${a.codigo})` }));
    C.llenarSelect(document.getElementById('i-activo'), opciones, { vacio: 'No lo sé / no aplica' });
    C.llenarSelect(document.getElementById('s-activo'), opciones, { vacio: 'Selecciona' });
  }

  async function cargarDatos() {
    const [ri, rs] = await Promise.all([api('GET', '/api/incidentes/mios'), api('GET', '/api/solicitudes/mias')]);
    misIncidentes = ri.datos.datos || [];
    misSolicitudes = rs.datos.datos || [];
  }

  async function vistaInicio() {
    await cargarDatos();
    document.getElementById('k-inc').textContent = misIncidentes.length;
    document.getElementById('k-inc-abiertos').textContent = misIncidentes.filter(i => ['abierto', 'en_analisis'].includes(i.estado)).length;
    document.getElementById('k-sol-ok').textContent = misSolicitudes.filter(s => s.estado === 'aprobada').length;
    document.getElementById('k-sol-pend').textContent = misSolicitudes.filter(s => s.estado === 'pendiente').length;
  }

  function verIncidente(inc) {
    const d = document.getElementById('dialogo');
    document.getElementById('dialogo-titulo').textContent = `${inc.folio} · ${inc.titulo}`;
    document.getElementById('dialogo-cuerpo').replaceChildren(
      el('dl', { class: 'datos' },
        el('dt', null, 'Estado'), el('dd', null, chip(inc.estado)),
        el('dt', null, 'Severidad'), el('dd', null, chip(inc.severidad)),
        el('dt', null, 'Tipo'), el('dd', null, etiqueta(inc.categoria)),
        el('dt', null, 'Sistema'), el('dd', null, inc.activo ? inc.activo.nombre : 'No indicado'),
        el('dt', null, 'Detectado'), el('dd', null, fmtFecha(inc.fechaDeteccion)),
        el('dt', null, 'Responsable'), el('dd', null, inc.asignadoA ? C.nombreDe(inc.asignadoA) : 'Sin asignar aún')),
      el('div', null, el('h3', null, 'Descripción'), el('p', null, inc.descripcion)),
      el('div', null, el('h3', null, 'Seguimiento'), el('ol', { class: 'linea-tiempo' },
        inc.historial.map(h => el('li', null, el('strong', null, h.accion), h.comentario ? ` — ${h.comentario}` : '',
          el('small', null, `${fmtFecha(h.fecha)} · ${h.usuario ? C.nombreDe(h.usuario) : ''}`)))))
    );
    d.showModal();
  }

  async function vistaMisIncidentes() {
    await cargarDatos();
    const tabla = document.getElementById('t-mis-incidentes');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    if (!misIncidentes.length) return C.filaVacia(tbody, 7, 'Aún no has reportado incidentes');
    tbody.replaceChildren(...misIncidentes.map(i => C.fila(th, [
      el('td', { class: 'mono nowrap' }, i.folio), i.titulo, etiqueta(i.categoria), chip(i.severidad), chip(i.estado),
      fmtFecha(i.createdAt), el('button', { class: 'btn btn--sec btn--chico', type: 'button', onclick: () => verIncidente(i) }, 'Ver')
    ])));
  }

  async function vistaMisSolicitudes() {
    await cargarDatos();
    const tabla = document.getElementById('t-mis-solicitudes');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    if (!misSolicitudes.length) return C.filaVacia(tbody, 5, 'No tienes solicitudes');
    tbody.replaceChildren(...misSolicitudes.map(s => C.fila(th, [
      s.activo ? `${s.activo.nombre} (${s.activo.codigo})` : '—', chip(s.nivelAcceso), chip(s.estado), fmtFecha(s.createdAt),
      s.estado === 'pendiente' ? el('span', { class: 'ayuda' }, 'En revisión') : `${s.comentarioRevision} (${C.nombreDe(s.revisadoPor)})`
    ])));
  }

  function prepararFormulario(id, url, alExito) {
    const form = document.getElementById(id);
    const boton = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!C.validarForm(form)) return;
      const datos = C.datosForm(form);
      if (datos.fechaDeteccion) datos.fechaDeteccion = new Date(datos.fechaDeteccion).toISOString();
      if (datos.fechaTermino) datos.fechaTermino = new Date(`${datos.fechaTermino}T23:59:00`).toISOString();
      await C.enviando(boton, async () => {
        const r = await api('POST', url, datos);
        if (!r.ok) return C.mostrarErrorApi(form, r);
        form.reset();
        C.toast(r.datos.mensaje);
        alExito();
      });
    });
  }

  document.querySelector('.dialogo__cerrar').addEventListener('click', () => document.getElementById('dialogo').close());

  C.iniciarPagina({ rol: 'colaborador' }).then(u => {
    if (!u) return;
    document.getElementById('saludo').textContent = u.nombre;
    cargarActivos();
    prepararFormulario('form-incidente', '/api/incidentes', () => { location.hash = '#mis-incidentes'; });
    prepararFormulario('form-solicitud', '/api/solicitudes', () => { location.hash = '#mis-solicitudes'; });
    C.enrutador({
      inicio: vistaInicio,
      reportar: () => {
        const f = document.getElementById('i-fecha');
        f.max = fechaLocalAhora();
        if (!f.value) f.value = fechaLocalAhora();
      },
      solicitar: () => { document.getElementById('s-termino').min = new Date(Date.now() + 864e5).toISOString().slice(0, 10); },
      'mis-incidentes': vistaMisIncidentes,
      'mis-solicitudes': vistaMisSolicitudes
    }, 'inicio');
  });
})();

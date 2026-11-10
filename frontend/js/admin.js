// Panel del perfil Administrador (analista de seguridad)
(function () {
  'use strict';
  const C = window.C;
  const { el, api, chip, fmtFecha, fmtNum, etiqueta, nombreDe } = C;
  const graficos = {};
  let yo = null;
  let admins = [];

  const PALETA = ['#0f6cbd', '#14a38b', '#e0a526', '#c0392b', '#7b5ea7', '#2f8fd8', '#5bb98c', '#d9822b', '#8e1b4b', '#5b6675'];
  const COLOR_SEV = { info: '#2f8fd8', baja: '#5bb98c', media: '#e0a526', alta: '#d9622b', critica: '#8e1b4b' };

  // ---------- Diálogo ----------
  const dialogo = document.getElementById('dialogo');
  document.querySelector('.dialogo__cerrar').addEventListener('click', () => dialogo.close());
  function abrirDialogo(titulo, ...contenido) {
    document.getElementById('dialogo-titulo').textContent = titulo;
    document.getElementById('dialogo-cuerpo').replaceChildren(...contenido);
    dialogo.showModal();
  }

  async function actualizarContadores() {
    const [ri, rs] = await Promise.all([
      api('GET', '/api/incidentes?estado=abierto'),
      api('GET', '/api/solicitudes?estado=pendiente')
    ]);
    const ci = document.getElementById('c-inc');
    const cs = document.getElementById('c-sol');
    const ni = ri.datos.total || 0;
    const ns = (rs.datos.datos || []).length;
    ci.textContent = ni; ci.hidden = !ni;
    cs.textContent = ns; cs.hidden = !ns;
  }

  // ---------- Dashboard ----------
  function grafico(id, config) {
    if (!window.Chart) return;
    if (graficos[id]) graficos[id].destroy();
    graficos[id] = new window.Chart(document.getElementById(id), config);
  }

  async function vistaDashboard() {
    const dias = document.getElementById('d-dias').value;
    const [r, ra] = await Promise.all([api('GET', `/api/analitica/resumen?dias=${dias}`), api('GET', '/api/analitica/alertas?horas=168')]);
    if (!r.ok) return C.toast(r.datos.error || 'No se pudo cargar el resumen', true);
    const d = r.datos;
    const t = d.totales;
    document.getElementById('k-total').textContent = fmtNum(t.total);
    document.getElementById('k-fallidos').textContent = fmtNum(t.fallidos);
    document.getElementById('k-graves').textContent = fmtNum(t.graves);
    document.getElementById('k-ips').textContent = fmtNum(t.ipsUnicas);
    document.getElementById('k-inc').textContent = fmtNum(t.incAbiertos);
    document.getElementById('k-sol').textContent = fmtNum(t.solPendientes);

    if (window.Chart) {
      window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      window.Chart.defaults.color = '#5b6675';
      window.Chart.defaults.locale = 'es-CL';
    }
    const etiquetasSerie = d.serie.map(s => {
      const f = new Date(s.t);
      return d.unidad === 'hour'
        ? f.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : f.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    });
    grafico('g-serie', {
      type: 'bar',
      data: {
        labels: etiquetasSerie,
        datasets: [
          { label: 'Logins fallidos', data: d.serie.map(s => s.fallidos), backgroundColor: '#c0392b', stack: 's' },
          { label: 'Otros eventos', data: d.serie.map(s => s.otros), backgroundColor: '#9cc3e8', stack: 's' }
        ]
      },
      options: { maintainAspectRatio: false, responsive: true, interaction: { mode: 'index', intersect: false },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } } }
    });
    const orden = ['info', 'baja', 'media', 'alta', 'critica'];
    const sev = orden.map(s => (d.porSeveridad.find(x => x._id === s) || { n: 0 }).n);
    grafico('g-severidad', {
      type: 'doughnut',
      data: { labels: orden.map(etiqueta), datasets: [{ data: sev, backgroundColor: orden.map(s => COLOR_SEV[s]), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '60%' }
    });
    grafico('g-sistema', {
      type: 'bar',
      data: { labels: d.porSistema.map(s => s._id), datasets: [{ label: 'Eventos', data: d.porSistema.map(s => s.n), backgroundColor: '#0f6cbd', borderRadius: 4 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { grid: { display: false } } } }
    });
    grafico('g-tipo', {
      type: 'bar',
      data: { labels: d.porTipo.map(s => etiqueta(s._id)), datasets: [{ label: 'Eventos', data: d.porTipo.map(s => s.n), backgroundColor: d.porTipo.map((_, i) => PALETA[i % PALETA.length]), borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, type: 'logarithmic' }, x: { grid: { display: false } } } }
    });

    const tabla = document.getElementById('t-alertas');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    const alertas = (ra.datos && ra.datos.datos) || [];
    if (!alertas.length) return C.filaVacia(tbody, 9, 'Sin patrones de ataque en el período');
    tbody.replaceChildren(...alertas.map(a => C.fila(th, [
      el('td', { class: 'mono' }, a.ip), a.pais || '—', etiqueta(a.patron), chip(a.riesgo, a.riesgo === 'medio' ? 'media' : a.riesgo === 'alto' ? 'alta' : 'critica'),
      fmtNum(a.intentos), String(a.cuentas), a.sistemas.join(', '), fmtFecha(a.ultimo),
      el('button', { class: 'btn btn--sec btn--chico', type: 'button', onclick: () => {
        const f = document.getElementById('f-eventos');
        f.reset();
        f.elements.ip.value = a.ip;
        location.hash = '#eventos';
      } }, 'Ver eventos')
    ], { class: 'alerta-fila' })));
  }

  // ---------- Eventos ----------
  let paginaEventos = 1;
  async function vistaEventos(pagina = 1) {
    paginaEventos = pagina;
    const f = document.getElementById('f-eventos');
    const p = new URLSearchParams();
    const datos = C.datosForm(f);
    Object.entries(datos).forEach(([k, v]) => {
      if (!v) return;
      p.set(k, (k === 'desde' || k === 'hasta') ? new Date(v).toISOString() : v);
    });
    p.set('pagina', paginaEventos);
    const r = await api('GET', `/api/eventos?${p}`);
    const tabla = document.getElementById('t-eventos');
    const tbody = tabla.querySelector('tbody');
    if (!r.ok) { C.filaVacia(tbody, 8, (r.datos.campos ? 'Revisa los filtros: ' + r.datos.campos.map(c => c.campo).join(', ') : r.datos.error)); return; }
    const th = C.encabezadosDe(tabla);
    if (!r.datos.datos.length) C.filaVacia(tbody, 8, 'No hay eventos con esos filtros');
    else tbody.replaceChildren(...r.datos.datos.map(e => C.fila(th, [
      el('td', { class: 'nowrap' }, fmtFecha(e.fecha)), e.origen.sistema, etiqueta(e.tipo), chip(e.severidad),
      el('td', { class: 'mono' }, e.ip || '—'), e.pais || '—', e.usuario || '—', e.mensaje
    ])));
    C.paginacion(document.getElementById('p-eventos'), r.datos, vistaEventos);
  }

  // ---------- Carga masiva ----------
  function prepararCarga() {
    const form = document.getElementById('form-carga');
    const input = document.getElementById('archivo');
    const zona = document.getElementById('zona-carga');
    const texto = document.getElementById('zona-texto');
    const progreso = document.getElementById('progreso');
    const resultado = document.getElementById('resultado-carga');
    const mostrarNombre = () => {
      const a = input.files[0];
      texto.textContent = a ? `${a.name} · ${(a.size / 1024).toFixed(0)} KB` : 'Arrastra el archivo aquí o haz clic para elegirlo';
    };
    input.addEventListener('change', mostrarNombre);
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
    zona.addEventListener('drop', e => { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; mostrarNombre(); } });

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      C.limpiarErrores(form);
      const archivo = input.files[0];
      if (!archivo) return C.aviso(form, 'Selecciona un archivo .csv o .json');
      if (!/\.(csv|json)$/i.test(archivo.name)) return C.aviso(form, 'Solo se aceptan archivos .csv o .json');
      if (archivo.size > 8 * 1024 * 1024) return C.aviso(form, 'El archivo supera 8 MB');
      const fd = new FormData();
      fd.append('archivo', archivo);
      // XMLHttpRequest permite mostrar el avance de la subida
      const xhr = new XMLHttpRequest();
      const boton = form.querySelector('button');
      boton.disabled = true;
      progreso.hidden = false;
      progreso.firstElementChild.style.width = '0';
      xhr.upload.addEventListener('progress', e => { if (e.lengthComputable) progreso.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`; });
      xhr.addEventListener('loadend', () => {
        boton.disabled = false;
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch (_) { /* vacío */ }
        if (xhr.status !== 201) { progreso.hidden = true; return C.aviso(form, r.error || 'No se pudo procesar el archivo'); }
        C.aviso(form, `Carga completada en ${r.segundos} s`, 'ok');
        resultado.replaceChildren(
          el('div', { class: 'kpis' },
            el('div', { class: 'kpi' }, el('div', { class: 'kpi__valor' }, fmtNum(r.recibidos)), el('div', { class: 'kpi__etiqueta' }, 'Filas leídas')),
            el('div', { class: 'kpi kpi--ok' }, el('div', { class: 'kpi__valor' }, fmtNum(r.insertados)), el('div', { class: 'kpi__etiqueta' }, 'Insertadas')),
            el('div', { class: 'kpi kpi--peligro' }, el('div', { class: 'kpi__valor' }, fmtNum(r.rechazados)), el('div', { class: 'kpi__etiqueta' }, 'Rechazadas'))),
          r.errores.length ? el('div', null, el('h3', null, 'Filas rechazadas'), el('div', { class: 'tabla-envoltura' }, el('table', null,
            el('thead', null, el('tr', null, el('th', null, 'Fila'), el('th', null, 'Motivo'))),
            el('tbody', null, r.errores.map(e => el('tr', null, el('td', null, String(e.fila)), el('td', null, e.error))))))) : '',
          el('p', { class: 'ayuda' }, `Lote: ${r.lote}`)
        );
        form.reset(); mostrarNombre();
      });
      xhr.open('POST', '/api/eventos/carga');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(fd);
    });
  }

  // ---------- Incidentes ----------
  let paginaInc = 1;
  async function vistaIncidentes(pagina = 1) {
    paginaInc = pagina;
    const p = new URLSearchParams(C.datosForm(document.getElementById('f-incidentes')));
    [...p.keys()].forEach(k => { if (!p.get(k)) p.delete(k); });
    p.set('pagina', paginaInc);
    const r = await api('GET', `/api/incidentes?${p}`);
    const tabla = document.getElementById('t-incidentes');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    if (!r.ok || !r.datos.datos.length) C.filaVacia(tbody, 9, 'No hay incidentes con esos filtros');
    else tbody.replaceChildren(...r.datos.datos.map(i => C.fila(th, [
      el('td', { class: 'mono nowrap' }, i.folio), i.titulo, etiqueta(i.categoria), chip(i.severidad), chip(i.estado),
      nombreDe(i.reportadoPor), i.asignadoA ? nombreDe(i.asignadoA) : el('span', { class: 'ayuda' }, 'Sin asignar'), el('td', { class: 'nowrap' }, fmtFecha(i.createdAt)),
      el('button', { class: 'btn btn--chico', type: 'button', onclick: () => gestionarIncidente(i._id) }, 'Gestionar')
    ])));
    if (r.ok) C.paginacion(document.getElementById('p-incidentes'), r.datos, vistaIncidentes);
  }

  async function gestionarIncidente(id) {
    const r = await api('GET', `/api/incidentes/${id}`);
    if (!r.ok) return C.toast(r.datos.error, true);
    const inc = r.datos.incidente;
    const selEstado = el('select', { name: 'estado' }, ['abierto', 'en_analisis', 'resuelto', 'cerrado'].map(e => el('option', { value: e, selected: e === inc.estado }, etiqueta(e))));
    const selSev = el('select', { name: 'severidad' }, ['baja', 'media', 'alta', 'critica'].map(e => el('option', { value: e, selected: e === inc.severidad }, etiqueta(e))));
    const selResp = el('select', { name: 'asignadoA' }, el('option', { value: '' }, 'Sin asignar'),
      admins.map(a => el('option', { value: a._id, selected: inc.asignadoA && inc.asignadoA._id === a._id }, nombreDe(a))));
    const form = el('form', { class: 'form form--2', novalidate: true },
      el('div', { class: 'aviso completo', role: 'alert' }),
      el('div', { class: 'campo' }, el('label', null, 'Estado'), selEstado),
      el('div', { class: 'campo' }, el('label', null, 'Severidad'), selSev),
      el('div', { class: 'campo completo' }, el('label', null, 'Responsable'), selResp),
      el('div', { class: 'campo completo' }, el('label', null, 'Comentario de seguimiento'), el('textarea', { name: 'comentario', maxlength: 500, placeholder: 'Acciones realizadas, hallazgos, próximos pasos…' })),
      el('div', { class: 'completo' }, el('button', { class: 'btn', type: 'submit' }, 'Guardar cambios'))
    );
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = C.datosForm(form);
      const cuerpo = { comentario: d.comentario };
      if (d.estado !== inc.estado) cuerpo.estado = d.estado;
      if (d.severidad !== inc.severidad) cuerpo.severidad = d.severidad;
      const actual = inc.asignadoA ? inc.asignadoA._id : '';
      if (d.asignadoA !== actual) cuerpo.asignadoA = d.asignadoA || null;
      await C.enviando(form.querySelector('button'), async () => {
        const res = await api('PATCH', `/api/incidentes/${id}`, cuerpo);
        if (!res.ok) return C.mostrarErrorApi(form, res);
        dialogo.close();
        C.toast(res.datos.mensaje);
        vistaIncidentes(paginaInc);
        actualizarContadores();
      });
    });
    abrirDialogo(`${inc.folio} · ${inc.titulo}`,
      el('dl', { class: 'datos' },
        el('dt', null, 'Tipo'), el('dd', null, etiqueta(inc.categoria)),
        el('dt', null, 'Sistema'), el('dd', null, inc.activo ? `${inc.activo.nombre} (${inc.activo.codigo})` : 'No indicado'),
        el('dt', null, 'Reportado por'), el('dd', null, `${nombreDe(inc.reportadoPor)} · ${inc.reportadoPor.area || ''} · ${inc.reportadoPor.email}`),
        el('dt', null, 'Detectado'), el('dd', null, fmtFecha(inc.fechaDeteccion))),
      el('div', null, el('h3', null, 'Descripción'), el('p', null, inc.descripcion)),
      form,
      el('div', null, el('h3', null, 'Historial'), el('ol', { class: 'linea-tiempo' }, inc.historial.slice().reverse().map(h =>
        el('li', null, el('strong', null, h.accion), h.comentario ? ` — ${h.comentario}` : '', el('small', null, `${fmtFecha(h.fecha)} · ${h.usuario ? nombreDe(h.usuario) : ''}`)))))
    );
  }

  // ---------- Solicitudes ----------
  async function vistaSolicitudes() {
    const estado = document.getElementById('fs-estado').value;
    const r = await api('GET', `/api/solicitudes${estado ? `?estado=${estado}` : ''}`);
    const tabla = document.getElementById('t-solicitudes');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    const lista = (r.datos && r.datos.datos) || [];
    if (!lista.length) return C.filaVacia(tbody, 8, 'No hay solicitudes');
    tbody.replaceChildren(...lista.map(s => C.fila(th, [
      nombreDe(s.solicitante), s.solicitante ? s.solicitante.area || '—' : '—', s.activo ? `${s.activo.codigo} · ${s.activo.nombre}` : '—', chip(s.nivelAcceso),
      s.justificacion, chip(s.estado), el('td', { class: 'nowrap' }, fmtFecha(s.createdAt)),
      s.estado === 'pendiente'
        ? el('div', { class: 'filtros' },
          el('button', { class: 'btn btn--ok btn--chico', type: 'button', onclick: () => revisarSolicitud(s, 'aprobada') }, 'Aprobar'),
          el('button', { class: 'btn btn--peligro btn--chico', type: 'button', onclick: () => revisarSolicitud(s, 'rechazada') }, 'Rechazar'))
        : el('span', { class: 'ayuda' }, `${s.comentarioRevision} (${nombreDe(s.revisadoPor)})`)
    ])));
  }

  function revisarSolicitud(s, estado) {
    const form = el('form', { class: 'form', novalidate: true },
      el('div', { class: 'aviso', role: 'alert' }),
      el('p', null, `${nombreDe(s.solicitante)} pide acceso de `, el('strong', null, etiqueta(s.nivelAcceso)), ` a ${s.activo.nombre}.`),
      el('p', { class: 'ayuda' }, `Justificación: ${s.justificacion}`),
      el('div', { class: 'campo' }, el('label', { for: 'rev-com' }, 'Comentario para el solicitante'),
        el('textarea', { id: 'rev-com', name: 'comentarioRevision', required: true, minlength: 3, maxlength: 400, 'data-msg': 'Escribe un comentario (mínimo 3 caracteres)' })),
      el('div', null, el('button', { class: `btn ${estado === 'aprobada' ? 'btn--ok' : 'btn--peligro'}`, type: 'submit' }, estado === 'aprobada' ? 'Confirmar aprobación' : 'Confirmar rechazo'))
    );
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!C.validarForm(form)) return;
      await C.enviando(form.querySelector('button'), async () => {
        const r = await api('PATCH', `/api/solicitudes/${s._id}`, { estado, comentarioRevision: C.datosForm(form).comentarioRevision });
        if (!r.ok) return C.mostrarErrorApi(form, r);
        dialogo.close();
        C.toast(r.datos.mensaje);
        vistaSolicitudes();
        actualizarContadores();
      });
    });
    abrirDialogo(estado === 'aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud', form);
  }

  // ---------- Activos ----------
  let activos = [];
  async function vistaActivos() {
    const r = await api('GET', '/api/activos');
    activos = r.datos.datos || [];
    const tabla = document.getElementById('t-activos');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    if (!activos.length) return C.filaVacia(tbody, 7);
    tbody.replaceChildren(...activos.map(a => C.fila(th, [
      el('td', { class: 'mono' }, a.codigo), a.nombre, etiqueta(a.tipo), chip(a.criticidad), a.responsable ? nombreDe(a.responsable) : '—',
      chip(a.activo ? 'activo' : 'inactivo'), el('button', { class: 'btn btn--sec btn--chico', type: 'button', onclick: () => editarActivo(a) }, 'Editar')
    ])));
  }

  function editarActivo(a) {
    const f = document.getElementById('form-activo');
    C.limpiarErrores(f);
    f.elements.id.value = a._id;
    ['codigo', 'nombre', 'tipo', 'criticidad', 'ubicacion', 'descripcion'].forEach(k => { f.elements[k].value = a[k] || ''; });
    f.elements.responsable.value = a.responsable ? a.responsable._id : '';
    document.getElementById('activo-titulo').textContent = `Editar ${a.codigo}`;
    document.getElementById('a-cancelar').hidden = false;
    f.elements.codigo.focus();
  }

  function prepararActivos() {
    const f = document.getElementById('form-activo');
    const cancelar = document.getElementById('a-cancelar');
    const limpiar = () => {
      f.reset(); f.elements.id.value = ''; cancelar.hidden = true;
      document.getElementById('activo-titulo').textContent = 'Nuevo activo';
    };
    cancelar.addEventListener('click', limpiar);
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!C.validarForm(f)) return;
      const d = C.datosForm(f);
      const id = d.id; delete d.id;
      await C.enviando(f.querySelector('button'), async () => {
        const r = await api(id ? 'PUT' : 'POST', id ? `/api/activos/${id}` : '/api/activos', d);
        if (!r.ok) return C.mostrarErrorApi(f, r);
        C.toast(r.datos.mensaje);
        limpiar();
        vistaActivos();
      });
    });
  }

  // ---------- Usuarios ----------
  async function vistaUsuarios() {
    const q = document.getElementById('u-q').value.trim();
    const r = await api('GET', `/api/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const tabla = document.getElementById('t-usuarios');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    const lista = r.datos.datos || [];
    if (!lista.length) return C.filaVacia(tbody, 7, 'Sin resultados');
    tbody.replaceChildren(...lista.map(u => {
      const esYo = u.id === yo.id;
      const rol = el('select', { 'aria-label': `Rol de ${u.email}`, disabled: esYo },
        el('option', { value: 'colaborador', selected: u.rol === 'colaborador' }, 'Colaborador'),
        el('option', { value: 'admin', selected: u.rol === 'admin' }, 'Administrador'));
      rol.addEventListener('change', () => modificarUsuario(u, { rol: rol.value }, `¿Cambiar el rol de ${u.email} a ${etiqueta(rol.value)}?`, () => { rol.value = u.rol; }));
      const acciones = el('div', { class: 'filtros' },
        esYo ? el('span', { class: 'ayuda' }, 'Tu cuenta') :
          el('button', { class: `btn btn--chico ${u.activo ? 'btn--sec' : 'btn--ok'}`, type: 'button',
            onclick: () => modificarUsuario(u, { activo: !u.activo }, `¿${u.activo ? 'Desactivar' : 'Activar'} la cuenta de ${u.email}?`) }, u.activo ? 'Desactivar' : 'Activar'),
        u.bloqueado ? el('button', { class: 'btn btn--chico btn--peligro', type: 'button', onclick: () => modificarUsuario(u, { desbloquear: true }) }, 'Desbloquear') : '');
      return C.fila(th, [nombreDe(u), u.email, u.area || '—', rol,
        u.bloqueado ? chip('bloqueado', 'alta') : chip(u.activo ? 'activo' : 'inactivo'), el('td', { class: 'nowrap' }, fmtFecha(u.ultimoAcceso)), acciones]);
    }));
  }

  async function modificarUsuario(u, cambios, confirmacion, alCancelar) {
    if (confirmacion && !window.confirm(confirmacion)) { if (alCancelar) alCancelar(); return; }
    const r = await api('PATCH', `/api/usuarios/${u.id}`, cambios);
    C.toast(r.ok ? r.datos.mensaje : r.datos.error, !r.ok);
    vistaUsuarios();
  }

  // ---------- Auditoría ----------
  async function vistaAuditoria(pagina = 1) {
    const sel = document.getElementById('au-accion');
    const accion = sel.value;
    const r = await api('GET', `/api/auditoria?pagina=${pagina}${accion ? `&accion=${accion}` : ''}`);
    if (!r.ok) return;
    if (sel.options.length <= 1) {
      C.llenarSelect(sel, r.datos.acciones.map(a => ({ valor: a, texto: a.replace(/_/g, ' ') })), { vacio: 'Todas' });
      sel.value = accion;
    }
    const tabla = document.getElementById('t-auditoria');
    const tbody = tabla.querySelector('tbody');
    const th = C.encabezadosDe(tabla);
    if (!r.datos.datos.length) C.filaVacia(tbody, 5);
    else tbody.replaceChildren(...r.datos.datos.map(a => C.fila(th, [
      el('td', { class: 'nowrap' }, fmtFecha(a.fecha)), a.email || '—', el('td', { class: 'mono' }, a.accion), a.detalle || '—', el('td', { class: 'mono' }, a.ip)
    ])));
    C.paginacion(document.getElementById('p-auditoria'), r.datos, vistaAuditoria);
  }

  // ---------- Inicio ----------
  C.iniciarPagina({ rol: 'admin' }).then(async u => {
    if (!u) return;
    yo = u;
    const [ra, rop] = await Promise.all([api('GET', '/api/usuarios/admins'), api('GET', '/api/activos/opciones')]);
    admins = ra.datos.datos || [];
    C.llenarSelect(document.getElementById('a-responsable'), admins.map(a => ({ valor: a._id, texto: nombreDe(a) })), { vacio: 'Sin responsable' });
    C.llenarSelect(document.getElementById('e-sistema'), [{ valor: 'CENTINELA', texto: 'CENTINELA (esta plataforma)' }, ...(rop.datos.datos || []).map(a => ({ valor: a.codigo, texto: a.codigo }))], { vacio: 'Todos' });
    C.llenarSelect(document.getElementById('e-tipo'), ['login_ok', 'login_fallido', 'acceso_denegado', 'cambio_privilegios', 'malware_detectado', 'conexion_vpn', 'descarga_masiva', 'escaneo_puertos', 'otro'].map(t => ({ valor: t, texto: etiqueta(t) })), { vacio: 'Todos' });

    document.getElementById('d-dias').addEventListener('change', vistaDashboard);
    document.getElementById('f-eventos').addEventListener('submit', e => { e.preventDefault(); vistaEventos(1); });
    document.getElementById('f-eventos').addEventListener('reset', () => setTimeout(() => vistaEventos(1), 0));
    document.getElementById('f-incidentes').addEventListener('submit', e => { e.preventDefault(); vistaIncidentes(1); });
    document.getElementById('fs-estado').addEventListener('change', vistaSolicitudes);
    document.getElementById('f-usuarios').addEventListener('submit', e => { e.preventDefault(); vistaUsuarios(); });
    document.getElementById('au-accion').addEventListener('change', () => vistaAuditoria(1));
    prepararCarga();
    prepararActivos();
    actualizarContadores();

    C.enrutador({
      dashboard: vistaDashboard,
      eventos: () => vistaEventos(1),
      incidentes: () => vistaIncidentes(1),
      solicitudes: vistaSolicitudes,
      activos: vistaActivos,
      usuarios: vistaUsuarios,
      auditoria: () => vistaAuditoria(1)
    }, 'dashboard');
  });
})();

/* Utilidades compartidas por todas las páginas de Centinela.
   Regla de seguridad: los datos que vienen del servidor se insertan con textContent
   (función el()), nunca con innerHTML, para evitar XSS. */
(function () {
  'use strict';

  const ETIQUETAS = {
    login_ok: 'Login correcto', login_fallido: 'Login fallido', acceso_denegado: 'Acceso denegado',
    cambio_privilegios: 'Cambio de privilegios', malware_detectado: 'Malware detectado', conexion_vpn: 'Conexión VPN',
    descarga_masiva: 'Descarga masiva', escaneo_puertos: 'Escaneo de puertos', otro: 'Otro',
    phishing: 'Phishing', malware: 'Malware', acceso_no_autorizado: 'Acceso no autorizado', perdida_equipo: 'Pérdida de equipo',
    fuga_datos: 'Fuga de datos', suplantacion: 'Suplantación',
    abierto: 'Abierto', en_analisis: 'En análisis', resuelto: 'Resuelto', cerrado: 'Cerrado',
    pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
    info: 'Info', baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica', critico: 'Crítico', medio: 'Medio', alto: 'Alto',
    lectura: 'Lectura', escritura: 'Escritura', administrador: 'Administrador',
    admin: 'Administrador', colaborador: 'Colaborador',
    aplicacion: 'Aplicación', servidor: 'Servidor', red: 'Red', base_datos: 'Base de datos', endpoint: 'Equipo', nube: 'Nube',
    fuerza_bruta: 'Fuerza bruta', password_spraying: 'Password spraying',
    activo: 'Activo', inactivo: 'Inactivo', bloqueado: 'Bloqueado'
  };
  const etiqueta = v => ETIQUETAS[v] || v || '—';

  // Crea elementos del DOM de forma segura. el('td', {class:'x'}, 'texto', otroNodo)
  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const h of hijos.flat()) {
      if (h === null || h === undefined || h === false) continue;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    }
    return n;
  }

  const chip = (valor, clase) => el('span', { class: `chip chip--${clase || valor}` }, etiqueta(valor));
  const fmtNum = n => new Intl.NumberFormat('es-CL').format(n || 0);
  const fmtFecha = (f, conHora = true) => {
    if (!f) return '—';
    const d = new Date(f);
    return d.toLocaleString('es-CL', conHora
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const nombreDe = u => (u ? `${u.nombre} ${u.apellido}` : '—');

  // Cliente de la API REST
  async function api(metodo, url, cuerpo, { redirigir401 = true } = {}) {
    const opciones = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (cuerpo instanceof FormData) opciones.body = cuerpo;
    else if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let r;
    try {
      r = await fetch(url, opciones);
    } catch (_) {
      return { ok: false, status: 0, datos: { error: 'No hay conexión con el servidor' } };
    }
    let datos = {};
    try { datos = await r.json(); } catch (_) { /* respuesta sin cuerpo */ }
    if (r.status === 401 && redirigir401 && !location.pathname.match(/\/(index\.html)?$/)) {
      location.href = '/index.html?expirada=1';
    }
    return { ok: r.ok, status: r.status, datos };
  }

  let temporizadorToast;
  function toast(mensaje, error = false) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
    t.textContent = mensaje;
    t.classList.toggle('error', error);
    requestAnimationFrame(() => t.classList.add('visible'));
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('visible'), 4200);
  }

  // ----- Formularios -----
  function datosForm(form) {
    const d = {};
    new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v.trim() : v; });
    form.querySelectorAll('input[type="password"]').forEach(i => { d[i.name] = i.value; }); // sin trim
    return d;
  }

  function limpiarErrores(form) {
    form.querySelectorAll('.campo').forEach(c => c.classList.remove('invalido'));
    form.querySelectorAll('.campo .error').forEach(e => { e.textContent = ''; });
    const aviso = form.querySelector('.aviso');
    if (aviso) { aviso.textContent = ''; aviso.className = 'aviso'; }
  }

  function errorCampo(form, nombre, mensaje) {
    const input = form.querySelector(`[name="${nombre}"]`);
    const campo = input && input.closest('.campo');
    if (!campo) return false;
    campo.classList.add('invalido');
    let e = campo.querySelector('.error');
    if (!e) { e = el('small', { class: 'error' }); campo.append(e); }
    e.textContent = mensaje;
    input.setAttribute('aria-invalid', 'true');
    return true;
  }

  function aviso(form, mensaje, tipo = 'error') {
    const a = form.querySelector('.aviso');
    if (!a) return toast(mensaje, tipo === 'error');
    a.textContent = mensaje;
    a.className = `aviso aviso--${tipo}`;
  }

  // Validación en el navegador (la definitiva siempre ocurre en el servidor)
  function validarForm(form) {
    limpiarErrores(form);
    let ok = true;
    form.querySelectorAll('input, select, textarea').forEach(i => {
      i.removeAttribute('aria-invalid');
      if (!i.name || i.disabled || i.type === 'file') return;
      let msg = '';
      if (!i.checkValidity()) msg = i.dataset.msg || i.validationMessage;
      if (!msg && i.dataset.igualA) {
        const otro = form.querySelector(`[name="${i.dataset.igualA}"]`);
        if (otro && otro.value !== i.value) msg = 'Las contraseñas no coinciden';
      }
      if (!msg && i.dataset.regla === 'password' && !REGLA_PASSWORD.test(i.value)) {
        msg = 'Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo';
      }
      if (msg) { ok = false; errorCampo(form, i.name, msg); }
    });
    if (!ok) {
      const primero = form.querySelector('[aria-invalid="true"]');
      if (primero) primero.focus();
    }
    return ok;
  }

  // Muestra la respuesta de error de la API en el formulario
  function mostrarErrorApi(form, r) {
    if (r.datos && Array.isArray(r.datos.campos)) {
      r.datos.campos.forEach(c => { if (!errorCampo(form, c.campo, c.mensaje)) aviso(form, c.mensaje); });
    }
    aviso(form, (r.datos && r.datos.error) || 'No se pudo completar la operación');
  }

  async function enviando(boton, fn) {
    const texto = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Procesando…';
    try { return await fn(); } finally { boton.disabled = false; boton.textContent = texto; }
  }

  const REGLA_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,72}$/;

  // Medidor de fortaleza de contraseña
  function medidorPassword(input) {
    const cont = input.closest('.campo');
    if (!cont || cont.querySelector('.medidor')) return;
    const barra = el('span');
    const reglas = [
      ['10+ caracteres', v => v.length >= 10], ['mayúscula', v => /[A-Z]/.test(v)], ['minúscula', v => /[a-z]/.test(v)],
      ['número', v => /\d/.test(v)], ['símbolo', v => /[^A-Za-z0-9]/.test(v)]
    ];
    const items = reglas.map(([t]) => el('li', null, t));
    cont.append(el('div', { class: 'medidor', 'aria-hidden': 'true' }, barra), el('ul', { class: 'reglas' }, items));
    input.addEventListener('input', () => {
      const v = input.value;
      let n = 0;
      reglas.forEach(([, f], i) => { const c = f(v); items[i].classList.toggle('cumple', c); if (c) n++; });
      barra.style.width = `${n * 20}%`;
      barra.style.background = n <= 2 ? 'var(--peligro)' : n <= 4 ? 'var(--alerta)' : 'var(--ok)';
    });
  }

  // ----- Sesión y estructura de las páginas internas -----
  async function iniciarPagina({ rol } = {}) {
    const r = await api('GET', '/api/auth/me');
    if (!r.ok) return null;
    const u = r.datos.usuario;
    if (rol && u.rol !== rol) {
      location.href = u.rol === 'admin' ? '/admin.html' : '/panel.html';
      return null;
    }
    document.querySelectorAll('[data-usuario-nombre]').forEach(n => { n.textContent = `${u.nombre} ${u.apellido}`; });
    document.querySelectorAll('[data-usuario-rol]').forEach(n => { n.textContent = etiqueta(u.rol); });
    document.querySelectorAll('[data-inicio]').forEach(a => { a.href = u.rol === 'admin' ? '/admin.html' : '/panel.html'; });
    document.querySelectorAll('[data-solo-admin]').forEach(n => { n.hidden = u.rol !== 'admin'; });

    document.querySelectorAll('[data-salir]').forEach(b => b.addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      location.href = '/index.html';
    }));
    const app = document.querySelector('.app');
    const botonMenu = document.querySelector('.barra__menu');
    if (botonMenu) {
      botonMenu.addEventListener('click', () => {
        const abierto = app.classList.toggle('menu-abierto');
        botonMenu.setAttribute('aria-expanded', String(abierto));
      });
      document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => app.classList.remove('menu-abierto')));
    }
    document.querySelectorAll('input[data-regla="password"]').forEach(medidorPassword);
    return u;
  }

  // Navegación por hash entre vistas (#dashboard, #eventos, ...)
  function enrutador(manejadores, porDefecto) {
    function mostrar() {
      const vista = (location.hash || '').slice(1) || porDefecto;
      const existe = document.querySelector(`[data-vista="${vista}"]`);
      const actual = existe ? vista : porDefecto;
      document.querySelectorAll('[data-vista]').forEach(s => { s.hidden = s.dataset.vista !== actual; });
      document.querySelectorAll('.menu a').forEach(a => {
        if (a.getAttribute('href') === `#${actual}`) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      const seccion = document.querySelector(`[data-vista="${actual}"]`);
      const titulo = document.querySelector('[data-titulo]');
      if (titulo && seccion) titulo.textContent = seccion.dataset.nombre || '';
      if (seccion) document.title = `${seccion.dataset.nombre} · Centinela`;
      if (manejadores[actual]) manejadores[actual]();
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', mostrar);
    mostrar();
  }

  function filaVacia(tbody, columnas, texto = 'No hay registros para mostrar') {
    tbody.replaceChildren(el('tr', null, el('td', { class: 'vacio', colspan: columnas }, texto)));
  }

  // Crea una fila con atributos data-th (para la vista de tarjetas en móvil)
  function fila(encabezados, celdas, attrs) {
    return el('tr', attrs || null, celdas.map((c, i) => {
      if (c instanceof Node && c.tagName === 'TD') { c.dataset.th = encabezados[i]; return c; }
      return el('td', { dataset: { th: encabezados[i] } }, c);
    }));
  }

  function encabezadosDe(tabla) {
    return Array.from(tabla.querySelectorAll('thead th')).map(th => th.textContent);
  }

  function paginacion(contenedor, { pagina, paginas, total }, alCambiar) {
    contenedor.replaceChildren(
      el('span', null, `${fmtNum(total)} registros · página ${pagina} de ${paginas || 1}`),
      el('button', { class: 'btn btn--sec btn--chico', type: 'button', disabled: pagina <= 1, onclick: () => alCambiar(pagina - 1) }, '‹ Anterior'),
      el('button', { class: 'btn btn--sec btn--chico', type: 'button', disabled: pagina >= paginas, onclick: () => alCambiar(pagina + 1) }, 'Siguiente ›')
    );
  }

  function llenarSelect(select, opciones, { vacio } = {}) {
    const primero = vacio ? [el('option', { value: '' }, vacio)] : [];
    select.replaceChildren(...primero, ...opciones.map(o => el('option', { value: o.valor }, o.texto)));
  }

  window.C = {
    el, chip, etiqueta, fmtNum, fmtFecha, nombreDe, api, toast, datosForm, limpiarErrores, errorCampo, aviso,
    validarForm, mostrarErrorApi, enviando, medidorPassword, iniciarPagina, enrutador, filaVacia, fila,
    encabezadosDe, paginacion, llenarSelect, REGLA_PASSWORD
  };
})();

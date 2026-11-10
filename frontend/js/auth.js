// Lógica de las páginas públicas: login, registro, recuperar y restablecer contraseña
(function () {
  'use strict';
  const { api, validarForm, mostrarErrorApi, aviso, datosForm, enviando, medidorPassword } = window.C;
  const form = document.querySelector('form[data-form]');
  if (!form) return;
  const tipo = form.dataset.form;
  const boton = form.querySelector('button[type="submit"]');
  form.querySelectorAll('input[data-regla="password"]').forEach(medidorPassword);

  const params = new URLSearchParams(location.search);
  if (tipo === 'login') {
    if (params.get('expirada')) aviso(form, 'Tu sesión expiró. Vuelve a ingresar.', 'info');
    if (params.get('registrado')) aviso(form, 'Cuenta creada. Ya puedes iniciar sesión.', 'ok');
    if (params.get('restablecida')) aviso(form, 'Contraseña actualizada. Ingresa con tu nueva contraseña.', 'ok');
    // Si ya hay sesión activa, se envía directo al panel
    api('GET', '/api/auth/me', undefined, { redirigir401: false }).then(r => {
      if (r.ok) location.href = r.datos.usuario.rol === 'admin' ? '/admin.html' : '/panel.html';
    });
  }
  if (tipo === 'restablecer') {
    const token = params.get('token') || '';
    form.elements.token.value = token;
    history.replaceState(null, '', '/restablecer.html'); // saca el token de la barra de direcciones
    if (!/^[a-f0-9]{64}$/.test(token)) {
      aviso(form, 'El enlace no es válido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".');
      boton.disabled = true;
    }
  }

  const rutas = { login: '/api/auth/login', registro: '/api/auth/registro', recuperar: '/api/auth/recuperar', restablecer: '/api/auth/restablecer' };

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!validarForm(form)) return;
    await enviando(boton, async () => {
      const r = await api('POST', rutas[tipo], datosForm(form), { redirigir401: false });
      if (!r.ok) {
        mostrarErrorApi(form, r);
        if (tipo === 'login') form.elements.password.value = '';
        return;
      }
      if (tipo === 'login') location.href = r.datos.destino;
      else if (tipo === 'registro') location.href = '/index.html?registrado=1';
      else if (tipo === 'restablecer') location.href = '/index.html?restablecida=1';
      else { aviso(form, r.datos.mensaje, 'ok'); form.reset(); }
    });
  });
})();

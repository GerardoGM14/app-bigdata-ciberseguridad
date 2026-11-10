// Gestión del propio perfil (ambos roles)
(function () {
  'use strict';
  const C = window.C;

  function llenar(u) {
    const f = document.getElementById('form-perfil');
    f.elements.nombre.value = u.nombre;
    f.elements.apellido.value = u.apellido;
    f.elements.area.value = u.area || '';
    f.elements.cargo.value = u.cargo || '';
    f.elements.telefono.value = u.telefono || '';
    document.getElementById('p-email').value = u.email;
    document.getElementById('p-ultimo').textContent = C.fmtFecha(u.ultimoAcceso);
    document.getElementById('p-creada').textContent = C.fmtFecha(u.createdAt, false);
  }

  C.iniciarPagina().then(u => {
    if (!u) return;
    llenar(u);

    const fp = document.getElementById('form-perfil');
    fp.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!C.validarForm(fp)) return;
      await C.enviando(fp.querySelector('button'), async () => {
        const r = await C.api('PUT', '/api/perfil', C.datosForm(fp));
        if (!r.ok) return C.mostrarErrorApi(fp, r);
        llenar(r.datos.usuario);
        document.querySelectorAll('[data-usuario-nombre]').forEach(n => { n.textContent = `${r.datos.usuario.nombre} ${r.datos.usuario.apellido}`; });
        C.aviso(fp, r.datos.mensaje, 'ok');
      });
    });

    const fc = document.getElementById('form-password');
    fc.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!C.validarForm(fc)) return;
      await C.enviando(fc.querySelector('button'), async () => {
        const r = await C.api('PUT', '/api/perfil/password', C.datosForm(fc));
        if (!r.ok) return C.mostrarErrorApi(fc, r);
        fc.reset();
        fc.querySelectorAll('.medidor span').forEach(s => { s.style.width = '0'; });
        fc.querySelectorAll('.reglas li').forEach(li => li.classList.remove('cumple'));
        C.aviso(fc, r.datos.mensaje, 'ok');
      });
    });
  });
})();

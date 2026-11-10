// Envío de correos. Orden de preferencia:
// 1) API HTTP de Brevo (funciona en hostings que bloquean puertos SMTP)
// 2) SMTP con Nodemailer (por ejemplo Gmail con contraseña de aplicación)
// 3) Consola: en desarrollo el enlace se imprime en la terminal
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporteSmtp = null;
if (env.SMTP_HOST) {
  transporteSmtp = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
}

async function enviarCorreo({ para, asunto, html, texto }) {
  if (env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM_EMAIL },
        to: [{ email: para }],
        subject: asunto,
        htmlContent: html,
        textContent: texto
      })
    });
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}`);
    return;
  }
  if (transporteSmtp) {
    await transporteSmtp.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_EMAIL}>`,
      to: para, subject: asunto, html, text: texto
    });
    return;
  }
  console.log(`\n[correo:consola] Para: ${para}\nAsunto: ${asunto}\n${texto}\n`);
}

function plantillaRecuperacion(nombre, enlace) {
  const texto = `Hola ${nombre}:\n\nRecibimos una solicitud para restablecer tu contraseña en Centinela.\n` +
    `Abre este enlace (válido por 30 minutos): ${enlace}\n\n` +
    'Si no fuiste tú, ignora este mensaje; tu contraseña actual sigue funcionando.';
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1b2430">
    <h2 style="color:#0f4c81">Centinela · Transportes Cordillera</h2>
    <p>Hola ${nombre}:</p>
    <p>Recibimos una solicitud para restablecer tu contraseña. El enlace es válido por <b>30 minutos</b> y solo puede usarse una vez.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${enlace}" style="background:#0f4c81;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">Restablecer contraseña</a>
    </p>
    <p style="font-size:13px;color:#5b6675">Si no fuiste tú, ignora este mensaje. Tu contraseña actual sigue funcionando.</p>
  </div>`;
  return { texto, html };
}

module.exports = { enviarCorreo, plantillaRecuperacion };

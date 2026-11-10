const { validationResult, body } = require('express-validator');

// Devuelve 422 con la lista de errores si alguna regla de validación falló
function validar(req, res, next) {
  const errores = validationResult(req);
  if (errores.isEmpty()) return next();
  return res.status(422).json({
    error: 'Hay datos inválidos en el formulario',
    campos: errores.array().map(e => ({ campo: e.path, mensaje: e.msg }))
  });
}

// Política de contraseñas: mínimo 10 caracteres con mayúscula, minúscula, número y símbolo
const REGLA_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,72}$/;

function passwordSegura(campo = 'password') {
  return body(campo)
    .isString()
    .matches(REGLA_PASSWORD)
    .withMessage('La contraseña debe tener entre 10 y 72 caracteres e incluir mayúscula, minúscula, número y símbolo');
}

module.exports = { validar, passwordSegura, REGLA_PASSWORD };

// Escapa caracteres especiales para usar texto del usuario dentro de una expresión regular
// sin que pueda alterar la consulta (evita ReDoS e inyección de operadores regex).
function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { escaparRegex, escaparHtml };

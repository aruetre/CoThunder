"use strict";
// markdown.js — renderizador Markdown -> HTML propio (subconjunto de correo).
// Vanilla, sin dependencias. Produce SIEMPRE una cadena HTML segura: todo el
// texto va escapado y los enlaces se filtran por esquema. Reglas centralizadas.
// Se usa en content-compose.js (preview y cuerpo final) y en Node para pruebas.

const MD_SAFE_SCHEMES = /^(https?:|mailto:)/i;

function mdEscape(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  const codes = [];
  // 1) Aísla los code spans antes de escapar el resto.
  let s = String(text == null ? "" : text).replace(/`([^`]+)`/g, (m, c) => {
    codes.push("<code>" + mdEscape(c) + "</code>");
    // Centinela envuelto en NUL: no puede aparecer en texto de usuario real,
    // a diferencia de espacios (que colisionan con números sueltos en prosa).
    return "\x00" + (codes.length - 1) + "\x00";
  });
  // 2) Escapa el texto restante.
  s = mdEscape(s);
  // 3) Enlaces [texto](url) solo con esquema permitido; si no, texto plano.
  // Nota: una URL con un ")" literal (p. ej. cierta URL de Wikipedia) se
  // truncaría en ese paréntesis; aceptable para uso en correo.
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (m, label, url) =>
    MD_SAFE_SCHEMES.test(url) ? '<a href="' + url + '">' + label + "</a>" : label);
  // 4) Negrita y cursiva.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/__([^_]+)__/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>")
       .replace(/(^|[^A-Za-z0-9])_([^_]+)_/g, "$1<em>$2</em>");
  // 5) Restaura los code spans.
  return s.replace(/\x00(\d+)\x00/g, (m, i) => codes[Number(i)]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline };
}

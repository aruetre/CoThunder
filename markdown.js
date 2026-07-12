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

function renderMarkdown(src) {
  const lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isTableSep = (s) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
  const cells = (s) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }                          // línea vacía
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);                          // encabezado
    if (h) { const n = h[1].length; out.push(`<h${n}>${renderInline(h[2].trim())}</h${n}>`); i++; continue; }

    if (/^```/.test(line)) {                                            // bloque de código
      i++; const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out.push("<pre><code>" + mdEscape(buf.join("\n")) + "</code></pre>"); continue;
    }

    if (/^\s*>\s?/.test(line)) {                                        // cita
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push("<blockquote>" + renderMarkdown(buf.join("\n")) + "</blockquote>"); continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {       // listas
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      const marker = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length && marker.test(lines[i])) { items.push(renderInline(lines[i].match(marker)[1])); i++; }
      out.push(`<${tag}>` + items.map((t) => `<li>${t}</li>`).join("") + `</${tag}>`); continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {   // tabla
      const head = cells(line).map((c) => `<th>${renderInline(c)}</th>`).join("");
      i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        rows.push("<tr>" + cells(lines[i]).map((c) => `<td>${renderInline(c)}</td>`).join("") + "</tr>"); i++;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`); continue;
    }

    const buf = [];                                                    // párrafo
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push("<p>" + renderInline(buf.join(" ")) + "</p>");
  }
  return out.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline, renderMarkdown };
}

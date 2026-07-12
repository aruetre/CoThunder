"use strict";
// markdown.js — renderizador Markdown -> HTML propio (subconjunto de correo).
// Vanilla, sin dependencias. Produce SIEMPRE una cadena HTML segura: todo el
// texto va escapado y los enlaces se filtran por esquema. Reglas centralizadas.
// Se usa en content-compose.js (preview y cuerpo final) y en Node para pruebas.

const MD_SAFE_SCHEMES = /^(https?:|mailto:)/i;
// Esquemas permitidos en el origen de una imagen: web y las imágenes embebidas
// que inserta Thunderbird (data: en línea, cid: adjunto).
const MD_IMG_SCHEMES = /^(https?:|data:|cid:)/i;

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
  // 2.5) Imágenes ![alt](url) con esquema de imagen permitido; si no, se descartan.
  //      Va antes de los enlaces porque comparten la sintaxis [ ]( ).
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (m, alt, url) =>
    MD_IMG_SCHEMES.test(url) ? '<img src="' + url + '" alt="' + alt + '">' : "");
  // 3) Enlaces [texto](url) solo con esquema permitido; si no, texto plano.
  // Nota: una URL con un ")" literal (p. ej. cierta URL de Wikipedia) se
  // truncaría en ese paréntesis; aceptable para uso en correo.
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (m, label, url) =>
    MD_SAFE_SCHEMES.test(url) ? '<a href="' + url + '">' + label + "</a>" : label);
  // 3.5) Autoenlaces de URLs sueltas (http/https). Se salta las que ya están
  // dentro de un atributo href="..." o justo tras un ">" (ya son <a>...</a>
  // por la regla anterior), para no re-enlazar lo ya enlazado.
  s = s.replace(/(?<![">])https?:\/\/[^\s<)]+/g, (m) => {
    let url = m, trail = "";
    if (/[.,]$/.test(url)) { trail = url.slice(-1); url = url.slice(0, -1); }
    return '<a href="' + url + '">' + url + "</a>" + trail;
  });
  // 4) Tachado, negrita y cursiva.
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/__([^_]+)__/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>")
       .replace(/(^|[^A-Za-z0-9])_([^_]+)_/g, "$1<em>$2</em>");
  // 5) Restaura los code spans.
  return s.replace(/\x00(\d+)\x00/g, (m, i) => codes[Number(i)]);
}

const MD_HR_RE = /^\s*(---|\*\*\*|___)\s*$/;
const MD_TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;
const MD_UL_MARKER_RE = /^(\s*)[-*+]\s+(.*)$/;
const MD_OL_MARKER_RE = /^(\s*)\d+\.\s+(.*)$/;

function isTableSep(s) { return MD_TABLE_SEP_RE.test(s); }
function tableCells(s) { return s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()); }

function isListMarkerLine(s) { return MD_UL_MARKER_RE.test(s) || MD_OL_MARKER_RE.test(s); }

function listMarkerInfo(s) {
  const u = s.match(MD_UL_MARKER_RE);
  if (u) return { indent: u[1].length, ordered: false, text: u[2] };
  const o = s.match(MD_OL_MARKER_RE);
  return { indent: o[1].length, ordered: true, text: o[2] };
}

// Ítem de lista de tareas: "[ ] texto" o "[x] texto" (x insensible a mayúsculas).
const MD_TASK_RE = /^\[([ xX])\]\s+(.*)$/;

function taskItemHtml(text) {
  const t = text.match(MD_TASK_RE);
  if (!t) return null;
  const checked = t[1].toLowerCase() === "x";
  return (checked ? "☑" : "☐") + " " + renderInline(t[2]);
}

// Parsea una lista (anidada por indentación) a partir de lines[start].
// Devuelve el HTML de la lista y el índice tras el último renglón consumido.
function parseList(lines, start) {
  const baseIndent = listMarkerInfo(lines[start]).indent;
  const ordered = listMarkerInfo(lines[start]).ordered;
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let i = start;
  while (i < lines.length && isListMarkerLine(lines[i]) && listMarkerInfo(lines[i]).indent === baseIndent) {
    const info = listMarkerInfo(lines[i]);
    let itemHtml = taskItemHtml(info.text);
    if (itemHtml === null) itemHtml = renderInline(info.text);
    i++;
    if (i < lines.length && isListMarkerLine(lines[i]) && listMarkerInfo(lines[i]).indent > baseIndent) {
      const nested = parseList(lines, i);
      itemHtml += nested.html;
      i = nested.i;
    }
    items.push(`<li>${itemHtml}</li>`);
  }
  return { html: `<${tag}>${items.join("")}</${tag}>`, i };
}

function renderMarkdown(src) {
  const lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }                          // línea vacía
    if (MD_HR_RE.test(line)) { out.push("<hr>"); i++; continue; }

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

    if (isListMarkerLine(line)) {                                       // listas (anidadas)
      const list = parseList(lines, i);
      out.push(list.html);
      i = list.i;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {   // tabla
      const head = tableCells(line).map((c) => `<th>${renderInline(c)}</th>`).join("");
      i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        rows.push("<tr>" + tableCells(lines[i]).map((c) => `<td>${renderInline(c)}</td>`).join("") + "</tr>"); i++;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`); continue;
    }

    const buf = [];                                                    // párrafo
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i]) &&
           !MD_HR_RE.test(lines[i]) &&
           !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i]); i++;
    }
    out.push("<p>" + renderInline(buf.join(" ")) + "</p>");
  }
  return out.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline, renderMarkdown };
}

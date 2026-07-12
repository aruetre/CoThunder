"use strict";
// markdown.js — renderizador Markdown -> HTML propio (subconjunto de correo).
// Vanilla, sin dependencias. Produce SIEMPRE una cadena HTML segura: todo el
// texto va escapado y los enlaces se filtran por esquema. Reglas centralizadas.
// Se usa en content-compose.js (preview y cuerpo final) y en Node para pruebas.

const MD_SAFE_SCHEMES = /^(https?:|mailto:)/i;
// Esquemas permitidos en el origen de una imagen: web y las imágenes embebidas
// que inserta Thunderbird (data: en línea, cid: adjunto).
const MD_IMG_SCHEMES = /^(https?:|data:|cid:)/i;

// Emojis por código corto :shortcode: -> unicode. Solo códigos conocidos se
// sustituyen; el resto queda literal (así ":noexiste:" o una hora "12:30" no
// se tocan, al no formar parte de este mapa).
const MD_EMOJI = {
  fire: "🔥", joy: "😂", "+1": "👍", thumbsup: "👍", "-1": "👎", thumbsdown: "👎",
  heart: "❤️", tada: "🎉", rocket: "🚀", warning: "⚠️", bulb: "💡",
  white_check_mark: "✅", smile: "😄", eyes: "👀", "100": "💯",
  wave: "👋", ok_hand: "👌", pray: "🙏", clap: "👏", star: "⭐",
  sparkles: "✨", bug: "🐛", memo: "📝", email: "📧", calendar: "📅",
  thinking: "🤔", cry: "😢", laughing: "😆", wink: "😉", sunglasses: "😎",
  x: "❌", question: "❓", exclamation: "❗", check: "✔️", zap: "⚡",
  moneybag: "💰", gift: "🎁", coffee: "☕", pencil: "✏️", lock: "🔒",
  unlock: "🔓", key: "🔑", hourglass: "⏳", loudspeaker: "📢", bell: "🔔",
  point_right: "👉", point_left: "👈", muscle: "💪", raised_hands: "🙌",
  handshake: "🤝",
};

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
  // 1.5) Escapado con barra invertida: \X dado un X de puntuación se aísla
  // como literal, con el mismo mecanismo de centinela que los code spans
  // (comparten el mismo array `codes` y se restauran juntos al final), así
  // sobrevive intacto a todas las reglas siguientes (negrita, enlaces...).
  // Va después de aislar los code spans para no interpretar como escape una
  // barra invertida que en realidad está dentro de un `code span`.
  s = s.replace(/\\([\\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g, (m, ch) => {
    codes.push(mdEscape(ch));
    return "\x00" + (codes.length - 1) + "\x00";
  });
  // 2) Escapa el texto restante.
  s = mdEscape(s);
  // 2.5) Imágenes ![alt](url "título") con esquema de imagen permitido; si
  // no, se descartan. Va antes de los enlaces porque comparten [ ]( ). El
  // título es opcional; si el esquema no es válido se ignora también.
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;([\s\S]*?)&quot;)?\)/g, (m, alt, url, title) =>
    MD_IMG_SCHEMES.test(url)
      ? '<img src="' + url + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : "") + '>'
      : "");
  // 3) Enlaces [texto](url "título") solo con esquema permitido; si no,
  // texto plano. El título es opcional.
  // Nota: una URL con un ")" literal (p. ej. cierta URL de Wikipedia) se
  // truncaría en ese paréntesis; aceptable para uso en correo.
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+&quot;([\s\S]*?)&quot;)?\)/g, (m, label, url, title) =>
    MD_SAFE_SCHEMES.test(url)
      ? '<a href="' + url + '"' + (title ? ' title="' + title + '"' : "") + '>' + label + "</a>"
      : label);
  // 3.4) Autoenlaces angulares <url> y <email>. mdEscape ya convirtió < y >
  // en &lt;/&gt;, así que se buscan en su forma escapada. Va antes de los
  // autoenlaces de URL suelta (3.5) para que esa regla, gracias a su
  // lookbehind, no re-enlace el texto que ya queda dentro del <a> generado.
  s = s.replace(/&lt;(https?:\/\/[^\s&<>]+)&gt;/g, (m, url) => '<a href="' + url + '">' + url + "</a>")
       .replace(/&lt;([^\s&<>]+@[^\s&<>]+)&gt;/g, (m, email) => '<a href="mailto:' + email + '">' + email + "</a>");
  // 3.5) Autoenlaces de URLs sueltas (http/https). Se salta las que ya están
  // dentro de un atributo href="..." o justo tras un ">" (ya son <a>...</a>
  // por las reglas anteriores), para no re-enlazar lo ya enlazado.
  // Clase atemperada: la URL para ante `&gt;`/`&lt;` (entidades de `>`/`<`
  // escapados por mdEscape) pero conserva `&amp;` (query strings ?a=1&b=2); y
  // ante el centinela `\x00` (escapes/code spans aislados), para no engullir
  // entidades ni marcadores en el href.
  s = s.replace(/(?<![">])https?:\/\/(?:(?!&gt;|&lt;)[^\s<)\x00])+/g, (m) => {
    let url = m, trail = "";
    if (/[.,]$/.test(url)) { trail = url.slice(-1); url = url.slice(0, -1); }
    return '<a href="' + url + '">' + url + "</a>" + trail;
  });
  // 4) Tachado, negrita+cursiva, negrita y cursiva.
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>")
       .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
       .replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/__([^_]+)__/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>")
       .replace(/(^|[^A-Za-z0-9])_([^_]+)_/g, "$1<em>$2</em>");
  // 4.5) Extendida: resaltado, subíndice, superíndice, emoji. El tachado ya
  // se resolvió en el paso 4 (arriba), así que aquí no quedan "~~" sin
  // consumir: el subíndice de un solo "~" no puede confundirse con él.
  s = s.replace(/==([^=]+)==/g, '<mark style="background-color:#fff2a8;">$1</mark>')
       .replace(/~([^~]+)~/g, "<sub>$1</sub>")
       .replace(/\^([^\^]+)\^/g, "<sup>$1</sup>")
       .replace(/:([a-z0-9_+-]+):/g, (m, code) => (MD_EMOJI[code] !== undefined ? MD_EMOJI[code] : m));
  // 5) Restaura los code spans y los escapes con barra invertida.
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

// --- Notas al pie -----------------------------------------------------
// Las definiciones "[^id]: texto" se extraen del origen ANTES de partir en
// líneas (así una línea de definición nunca llega al bucle de bloques como
// párrafo suelto). Las referencias "[^id]" se sustituyen por un centinela
// "\x01N\x01" (N = número de aparición, 1-based) que sobrevive intacto a
// renderInline: usa un byte de control distinto del centinela \x00 que usa
// renderInline internamente para code spans, y ningún carácter de la marca
// (dígitos + \x01) coincide con las reglas de negrita/cursiva/superíndice/
// etc., así que atraviesa mdEscape y todas las sustituciones sin tocarse.
// Al final de renderMarkdown se resuelve el centinela a su <sup><a...>
// definitivo y, si hubo alguna nota, se añade el <ol> de pies de página.
const MD_FOOTNOTE_DEF_RE = /^\[\^([A-Za-z0-9_-]+)\]:\s*(.*)$/;
const MD_FOOTNOTE_REF_RE = /\[\^([A-Za-z0-9_-]+)\]/g;
const MD_FOOTNOTE_MARKER_RE = /\x01(\d+)\x01/g;

function extractFootnoteDefs(text) {
  const defs = new Map();
  const cleaned = text.split("\n").map((line) => {
    const m = line.match(MD_FOOTNOTE_DEF_RE);
    if (!m) return line;
    defs.set(m[1], m[2]);
    return "";
  }).join("\n");
  return { cleaned, defs };
}

function substituteFootnoteRefs(text, defs) {
  const order = new Map(); // id de nota -> número de aparición (1-based)
  const withMarkers = text.replace(MD_FOOTNOTE_REF_RE, (m, id) => {
    if (!defs.has(id)) return m; // sin definición: se deja el texto literal
    if (!order.has(id)) order.set(id, order.size + 1);
    return "\x01" + order.get(id) + "\x01";
  });
  return { withMarkers, order };
}

// Encabezado con ID opcional "{#id}" al final del texto visible.
const MD_HEADING_ID_RE = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

// Línea de definición ": texto" (lista de definición).
const MD_DEF_LINE_RE = /^:\s+(.*)$/;

function renderMarkdown(src) {
  const raw = String(src == null ? "" : src).replace(/\r\n?/g, "\n");
  const { cleaned, defs } = extractFootnoteDefs(raw);
  const { withMarkers, order } = substituteFootnoteRefs(cleaned, defs);
  const lines = withMarkers.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }                          // línea vacía
    if (MD_HR_RE.test(line)) { out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);                          // encabezado
    if (h) {
      const n = h[1].length;
      let text = h[2].trim();
      let idAttr = "";
      const idm = text.match(MD_HEADING_ID_RE);
      if (idm) { text = text.slice(0, idm.index).trim(); idAttr = ` id="${idm[1]}"`; }
      out.push(`<h${n}${idAttr}>${renderInline(text)}</h${n}>`);
      i++; continue;
    }

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

    if (i + 1 < lines.length && !/^\s*$/.test(line) && MD_DEF_LINE_RE.test(lines[i + 1])) {   // lista de definición
      const items = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && i + 1 < lines.length && MD_DEF_LINE_RE.test(lines[i + 1])) {
        items.push(`<dt>${renderInline(lines[i])}</dt>`);
        i++;
        while (i < lines.length && MD_DEF_LINE_RE.test(lines[i])) {
          items.push(`<dd>${renderInline(lines[i].match(MD_DEF_LINE_RE)[1])}</dd>`);
          i++;
        }
      }
      out.push(`<dl>${items.join("")}</dl>`); continue;
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
  let result = out.join("\n").replace(MD_FOOTNOTE_MARKER_RE, (m, n) =>
    `<sup><a href="#fn${n}" id="fnref${n}">${n}</a></sup>`);
  if (order.size > 0) {
    const items = [];
    for (const [id, n] of order) {
      items.push(`<li id="fn${n}">${renderInline(defs.get(id) || "")} <a href="#fnref${n}">↩</a></li>`);
    }
    result += "\n<hr>\n<ol>" + items.join("") + "</ol>";
  }
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline, renderMarkdown };
}

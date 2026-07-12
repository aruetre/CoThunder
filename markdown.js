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
  // Protege una cadena ya generada (URL o atributo de un enlace/imagen/
  // autoenlace) tras un centinela, para que las reglas de énfasis/resaltado/
  // emoji (pasos 4 y 4.5) no la reinterpreten y corrompan el HTML generado.
  // Comparte el mismo array `codes` y se restaura junto con los code spans
  // en el paso 5.
  const protect = (str) => { codes.push(str); return "\x00" + (codes.length - 1) + "\x00"; };
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
      ? protect('<img src="' + url + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : "") + '>')
      : "");
  // 3) Enlaces [texto](url "título") solo con esquema permitido; si no,
  // texto plano. El título es opcional.
  // Nota: una URL con un ")" literal (p. ej. cierta URL de Wikipedia) se
  // truncaría en ese paréntesis; aceptable para uso en correo.
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+&quot;([\s\S]*?)&quot;)?\)/g, (m, label, url, title) =>
    MD_SAFE_SCHEMES.test(url)
      ? '<a href="' + protect(url) + '"' + (title ? ' title="' + protect(title) + '"' : "") + '>' + label + "</a>"
      : label);
  // 3.4) Autoenlaces angulares <url> y <email>. mdEscape ya convirtió < y >
  // en &lt;/&gt;, así que se buscan en su forma escapada. Va antes de los
  // autoenlaces de URL suelta (3.5) para que esa regla, gracias a su
  // lookbehind, no re-enlace el texto que ya queda dentro del <a> generado.
  s = s.replace(/&lt;(https?:\/\/[^\s&<>]+)&gt;/g, (m, url) => protect('<a href="' + url + '">' + url + "</a>"))
       .replace(/&lt;([^\s&<>]+@[^\s&<>]+)&gt;/g, (m, email) => protect('<a href="mailto:' + email + '">' + email + "</a>"));
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
    return protect('<a href="' + url + '">' + url + "</a>") + trail;
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
  // 5) Restaura los code spans, escapes y valores protegidos. En bucle: un valor
  // protegido (p. ej. un título con un escape dentro) puede contener a su vez un
  // centinela, y una sola pasada dejaría bytes NUL en la salida. Se repite hasta
  // que no quede ninguno (la profundidad de anidamiento es finita y decreciente).
  while (/\x00\d+\x00/.test(s)) {
    s = s.replace(/\x00(\d+)\x00/g, (m, i) => codes[Number(i)]);
  }
  return s;
}

// --- Resaltado de sintaxis (bloques ```lang) -----------------------------
// El correo elimina CSS/clases, así que los tokens se colorean con
// `<span style="color:...">` en línea. Todo el texto se escapa SIEMPRE con
// mdEscape (dentro y fuera de los spans): un lenguaje desconocido, o código
// como `</script>` o `"><img>`, nunca produce HTML vivo.
const MD_HL_COLORS = {
  comment: "#6e7781",
  string: "#0a3069",
  number: "#0550ae",
  keyword: "#cf222e",
};

function mdHlSpan(kind, text) {
  return '<span style="color:' + MD_HL_COLORS[kind] + ';">' + mdEscape(text) + "</span>";
}

const MD_HL_JS_KEYWORDS = [
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
  "break", "continue", "switch", "case", "default", "class", "extends", "new", "this",
  "typeof", "instanceof", "in", "of", "try", "catch", "finally", "throw", "async", "await",
  "yield", "import", "export", "from", "as", "static", "get", "set", "super", "void",
  "delete", "null", "undefined", "true", "false",
];

const MD_HL_LANGS = {
  js: {
    keywords: new Set(MD_HL_JS_KEYWORDS),
    lineComments: ["//"],
    blockComments: true,
    stringChars: ['"', "'", "`"],
  },
  ts: {
    keywords: new Set([
      ...MD_HL_JS_KEYWORDS,
      "interface", "type", "enum", "implements", "public", "private", "protected",
      "readonly", "namespace", "declare", "is", "keyof", "abstract",
    ]),
    lineComments: ["//"],
    blockComments: true,
    stringChars: ['"', "'", "`"],
  },
  python: {
    keywords: new Set([
      "def", "class", "return", "if", "elif", "else", "for", "while", "break", "continue",
      "pass", "import", "from", "as", "try", "except", "finally", "raise", "with", "lambda",
      "yield", "global", "nonlocal", "in", "is", "not", "and", "or", "None", "True", "False",
      "async", "await", "del", "assert",
    ]),
    lineComments: ["#"],
    blockComments: false,
    stringChars: ['"', "'"],
  },
  json: {
    keywords: new Set(["true", "false", "null"]),
    lineComments: [],
    blockComments: false,
    stringChars: ['"'],
  },
  bash: {
    keywords: new Set([
      "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
      "function", "return", "export", "local", "in", "break", "continue", "echo", "exit",
      "select", "until", "time",
    ]),
    lineComments: ["#"],
    blockComments: false,
    stringChars: ['"', "'"],
  },
  sql: {
    keywords: new Set([
      "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
      "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "GROUP", "BY", "ORDER", "HAVING",
      "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE", "LIMIT", "AS", "CREATE", "TABLE",
      "DROP", "ALTER", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "DISTINCT", "UNION", "ALL",
    ]),
    lineComments: ["--"],
    blockComments: false,
    stringChars: ["'", '"'],
  },
  css: {
    keywords: new Set([
      "important", "media", "import", "keyframes", "supports", "charset",
      "inherit", "initial", "unset", "none", "auto", "block", "flex", "grid",
    ]),
    lineComments: ["//"],
    blockComments: true,
    stringChars: ['"', "'"],
  },
};

const MD_HL_ALIASES = {
  js: "js", javascript: "js",
  ts: "ts", typescript: "ts",
  python: "python", py: "python",
  json: "json",
  bash: "bash", sh: "bash", shell: "bash",
  sql: "sql",
  css: "css",
};

const MD_HL_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const MD_HL_NUMBER_RE = /^\d+(\.\d+)?/;

// Tokeniza `code` en una única pasada izquierda->derecha según `lang`
// (alias normalizado vía MD_HL_ALIASES). Prioridad: comentario de bloque >
// comentario de línea > cadena > número > palabra clave > texto plano. No es
// un parser real: aproximación suficiente para colorear código de correo.
// Un lenguaje desconocido o vacío devuelve el código solo escapado (sin spans).
function highlightCode(code, lang) {
  const src = String(code == null ? "" : code);
  const key = MD_HL_ALIASES[String(lang == null ? "" : lang).trim().toLowerCase()];
  const config = key ? MD_HL_LANGS[key] : null;
  if (!config) return mdEscape(src);

  const parts = [];
  let plain = "";
  const flushPlain = () => { if (plain) { parts.push(mdEscape(plain)); plain = ""; } };

  let i = 0;
  const n = src.length;
  while (i < n) {
    if (config.blockComments && src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      flushPlain();
      parts.push(mdHlSpan("comment", src.slice(i, stop)));
      i = stop;
      continue;
    }

    const lc = config.lineComments.find((marker) => src.startsWith(marker, i));
    if (lc) {
      let end = src.indexOf("\n", i);
      if (end === -1) end = n;
      flushPlain();
      parts.push(mdHlSpan("comment", src.slice(i, end)));
      i = end;
      continue;
    }

    const ch = src[i];

    if (config.stringChars.includes(ch)) {
      let j = i + 1;
      while (j < n && src[j] !== ch) {
        j += (src[j] === "\\" && j + 1 < n) ? 2 : 1;
      }
      const stop = j < n ? j + 1 : j;
      flushPlain();
      parts.push(mdHlSpan("string", src.slice(i, stop)));
      i = stop;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const m = MD_HL_NUMBER_RE.exec(src.slice(i));
      const stop = i + m[0].length;
      const nextCh = src[stop];
      if (!nextCh || !/[A-Za-z_]/.test(nextCh)) {
        flushPlain();
        parts.push(mdHlSpan("number", m[0]));
        i = stop;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      const m = MD_HL_IDENT_RE.exec(src.slice(i));
      const word = m[0];
      if (config.keywords.has(word)) {
        flushPlain();
        parts.push(mdHlSpan("keyword", word));
      } else {
        plain += word;
      }
      i += word.length;
      continue;
    }

    plain += ch;
    i++;
  }
  flushPlain();
  return parts.join("");
}

const MD_HR_RE = /^\s*(---|\*\*\*|___)\s*$/;
const MD_TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;
const MD_UL_MARKER_RE = /^(\s*)[-*+]\s+(.*)$/;
const MD_OL_MARKER_RE = /^(\s*)\d+\.\s+(.*)$/;

function isTableSep(s) { return MD_TABLE_SEP_RE.test(s); }
function tableCells(s) { return s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()); }
// Índice de la primera línea NO vacía a partir de `from` (o lines.length).
function nextNonBlank(lines, from) {
  let k = from;
  while (k < lines.length && /^\s*$/.test(lines[k])) k++;
  return k;
}
// Una tabla empieza en `i` si esa línea tiene "|" y la siguiente línea NO vacía es
// el separador (---). Tolera líneas en blanco entre cabecera y separador, típico de
// las tablas que genera Copilot.
function tableStartsAt(lines, i) {
  if (!lines[i].includes("|")) return false;
  const j = nextNonBlank(lines, i + 1);
  return j < lines.length && isTableSep(lines[j]);
}

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

// Admonitions estilo GitHub: cita cuyo primer renglón es "[!TYPE]". Estilos
// en línea (los clientes de correo eliminan el CSS externo) y emoji como
// icono (eliminan también <svg>).
const MD_ADMONITION_RE = /^\[!([A-Za-z]+)\]\s*$/;
const MD_ADMONITIONS = {
  NOTE: { border: "#0969da", bg: "#ddf4ff", emoji: "ℹ️", title: "Nota" },
  TIP: { border: "#1a7f37", bg: "#dafbe1", emoji: "💡", title: "Consejo" },
  IMPORTANT: { border: "#8250df", bg: "#fbefff", emoji: "❗", title: "Importante" },
  WARNING: { border: "#9a6700", bg: "#fff8c5", emoji: "⚠️", title: "Advertencia" },
  CAUTION: { border: "#cf222e", bg: "#ffebe9", emoji: "🛑", title: "Precaución" },
};

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
      const langMatch = line.match(/^```\s*([\w+-]*)/);
      const lang = langMatch ? langMatch[1] : "";
      i++; const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out.push("<pre><code>" + highlightCode(buf.join("\n"), lang) + "</code></pre>"); continue;
    }

    if (/^\s*>\s?/.test(line)) {                                        // cita
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      const admMatch = buf.length > 0 && buf[0].match(MD_ADMONITION_RE);
      const adm = admMatch ? MD_ADMONITIONS[admMatch[1].toUpperCase()] : null;
      if (adm) {
        const content = renderMarkdown(buf.slice(1).join("\n"));
        out.push(
          `<div style="border-left:4px solid ${adm.border};background:${adm.bg};padding:8px 12px;margin:8px 0;color:#1f2328;">` +
          `<p style="margin:0 0 6px;font-weight:bold;">${adm.emoji} ${adm.title}</p>${content}</div>`
        );
      } else {
        out.push("<blockquote>" + renderMarkdown(buf.join("\n")) + "</blockquote>");
      }
      continue;
    }

    if (isListMarkerLine(line)) {                                       // listas (anidadas)
      const list = parseList(lines, i);
      out.push(list.html);
      i = list.i;
      continue;
    }

    if (tableStartsAt(lines, i)) {   // tabla (tolera líneas en blanco entre filas)
      const head = tableCells(line).map((c) => `<th>${renderInline(c)}</th>`).join("");
      i = nextNonBlank(lines, i + 1) + 1;   // pasa cabecera y separador (saltando blancos)
      const rows = [];
      while (i < lines.length) {
        if (/^\s*$/.test(lines[i])) {
          // Línea en blanco: si la siguiente línea con contenido sigue siendo una
          // fila de tabla, la saltamos; si no, la tabla termina aquí.
          const k = nextNonBlank(lines, i);
          if (k < lines.length && lines[k].includes("|") && !isTableSep(lines[k])) { i = k; continue; }
          break;
        }
        if (!lines[i].includes("|") || isTableSep(lines[i])) break;
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
           !tableStartsAt(lines, i)) {
      buf.push(lines[i]); i++;
    }
    // Cada salto de línea dentro del párrafo se respeta como <br> (más intuitivo
    // al escribir correos que el colapso a espacio del Markdown estándar).
    out.push("<p>" + buf.map((l) => renderInline(l)).join("<br>") + "</p>");
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

// --- Estilos de correo -------------------------------------------------
// Los clientes de correo eliminan el CSS externo (y muchos también las
// etiquetas <style>), así que el HTML final necesita estilos EN LÍNEA en
// los bloques (código, tabla, cita, regla) para que se vea bien. Se aplica
// como pasada POSTERIOR a renderMarkdown (no toca su salida semántica) para
// no afectar a los tests existentes de renderMarkdown/renderInline.
const MD_EMAIL_STYLES = {
  pre: "background:#f6f8fa;padding:12px;border-radius:6px;overflow-x:auto;font-family:monospace;font-size:13px;line-height:1.45;",
  codeInline: "background:#f6f8fa;padding:2px 5px;border-radius:4px;font-family:monospace;font-size:90%;",
  table: "border-collapse:collapse;margin:8px 0;",
  td: "border:1px solid #d0d7de;padding:6px 12px;",
  hr: "border:none;border-top:1px solid #d0d7de;margin:12px 0;",
};

// Color de acento por defecto (configurable desde Opciones, ver DEFAULTS.emailAccent en common.js).
const MD_DEFAULT_ACCENT = "#0969da";

function styleEmail(html, opts) {
  const o = opts || {};
  let accent = (o && o.accent) || MD_DEFAULT_ACCENT;
  // Valida el acento (viene de storage): debe ser #rrggbb; si no, al por defecto,
  // para que un valor corrupto no rompa el atributo style del correo enviado.
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) accent = MD_DEFAULT_ACCENT;
  let s = String(html == null ? "" : html);
  // Protege los bloques <pre><code>...</code></pre> con un centinela \x01N\x01
  // antes de estilar el <code> en línea, así el <code> del bloque no se toca.
  const blocks = [];
  s = s.replace(/<pre><code>/g, () => {
    blocks.push('<pre style="' + MD_EMAIL_STYLES.pre + '"><code>');
    return "\x01" + (blocks.length - 1) + "\x01";
  });
  s = s.replace(/<code>/g, '<code style="' + MD_EMAIL_STYLES.codeInline + '">');
  s = s.replace(/\x01(\d+)\x01/g, (m, i) => blocks[Number(i)]);
  // Admite encabezados con atributos existentes (p. ej. id="..." de {#id}): el estilo se
  // antepone y los atributos previos se conservan tal cual.
  s = s.replace(/<h([1-6])(\s[^>]*)?>/g, (m, n, attrs) =>
    '<h' + n + ' style="color:' + accent + ';margin:12px 0 6px;"' + (attrs || "") + '>');
  s = s.replace(/<table>/g, '<table style="' + MD_EMAIL_STYLES.table + '">');
  s = s.replace(/<th>/g, '<th style="border:1px solid ' + accent + ';padding:6px 12px;background:' + accent + ';color:#fff;text-align:left;">');
  s = s.replace(/<td>/g, '<td style="' + MD_EMAIL_STYLES.td + '">');
  s = s.replace(/<blockquote>/g, '<blockquote style="border-left:4px solid ' + accent + ';margin:8px 0;padding:0 12px;color:#57606a;">');
  s = s.replace(/<hr>/g, '<hr style="' + MD_EMAIL_STYLES.hr + '">');
  return s;
}

// --- Motor de temas: parser CSS mínimo ----------------------------------
// Parser deliberadamente simple (sin anidamiento, sin selectores complejos
// más allá de lo que entiende querySelectorAll): basta para temas de correo
// (colores, bordes, fondos) aplicados luego como estilos en línea por
// content-compose.js::inlineCss. No interpreta @media ni reglas anidadas;
// las descarta.
function parseCss(css) {
  // 1) Quita comentarios /* ... */ antes de trocear (pueden contener "}" o ";").
  // Un comentario sin cerrar comenta el resto (semántica CSS real) y evita que
  // el "/*" quede pegado a un selector y produzca un selector inválido.
  const noComments = String(css == null ? "" : css).replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  const rules = [];
  // 2) Trocea en reglas por "}"; cada trozo es "selector { declaraciones".
  for (const chunk of noComments.split("}")) {
    const open = chunk.indexOf("{");
    if (open === -1) continue; // resto tras la última regla, o cierre de @media
    const selector = chunk.slice(0, open).trim();
    if (!selector || selector.startsWith("@")) continue; // vacío o at-rule (@media, @import...)
    const decls = [];
    for (const part of chunk.slice(open + 1).split(";")) {
      const p = part.trim();
      if (!p) continue;
      const colon = p.indexOf(":"); // split en el PRIMER ":" (los valores pueden llevar más, p. ej. url(...))
      if (colon === -1) continue;
      const prop = p.slice(0, colon).trim();
      let value = p.slice(colon + 1).trim();
      if (!prop || !value) continue;
      // Soporta "!important": se separa como priority para setProperty (si no,
      // setProperty descartaría toda la declaración al no entender el valor).
      let priority = "";
      const bang = value.match(/^([\s\S]*?)\s*!important$/i);
      if (bang) { value = bang[1].trim(); priority = "important"; }
      decls.push(priority ? { prop, value, priority } : { prop, value });
    }
    rules.push({ selector, decls });
  }
  return rules;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline, renderMarkdown, styleEmail, highlightCode, parseCss };
}

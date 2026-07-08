"use strict";

// Guía de estilo Markdown compartida por el prompt normal y el de plantilla (maquetación idéntica).
const MARKDOWN_STYLE =
  "Maqueta SIEMPRE la respuesta en Markdown de forma clara y con buen diseño, creativo pero sin recargar: " +
  "usa el formato para organizar y facilitar la lectura, no por adornar. Como MÍNIMO: el saludo inicial como " +
  "encabezado (por ejemplo '# Hola Juan'), la despedida en **negrita**, y la idea o dato más importante " +
  "destacado en una cita (>). Además, resalta términos clave con negrita y usa listas en enumeraciones o pasos. " +
  "Aprovecha también, según encajen con el contenido:\n" +
  "- Encabezados (#, ##, ###) para separar secciones cuando la respuesta lo pida.\n" +
  "- Énfasis: negrita (**texto**), cursiva (*texto*) y tachado (~~texto~~).\n" +
  "- Listas ordenadas (1., 2., 3.), con viñetas (-), anidadas y de tareas (- [ ] / - [x]).\n" +
  "- Tablas para comparar datos o presentar información estructurada.\n" +
  "- Citas (>), incluidas anidadas.\n" +
  "- Código en línea (`código`) y bloques de código con lenguaje (```).\n" +
  "- Enlaces [texto](url), imágenes ![alt](url) y líneas divisorias (---).";

// Directiva de formato que se añade SIEMPRE en buildPrompt (independiente de la plantilla editable,
// para que una plantilla guardada antigua no anule el Markdown de la respuesta).
const MARKDOWN_INSTRUCTION =
  "IMPORTANTE: devuelve solo el cuerpo del correo como código fuente Markdown SIN RENDERIZAR, dentro de un " +
  "único bloque de código que empiece por ```markdown y termine con ```, sin asunto ni explicaciones.";

const DEFAULT_PROMPT_TEMPLATE =
  "Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje.\n\n" +
  "De: {{author}}\nAsunto: {{subject}}\n\n{{body}}";

const DEFAULTS = {
  copilotUrl: "https://m365.cloud.microsoft/chat",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  newChatByDefault: true
};

function getConfig() {
  return messenger.storage.local.get(DEFAULTS);
}

// Rellena la plantilla base editable (instrucción + correo) con los datos del mensaje.
function buildPrompt(message, body, template) {
  return template
    .replaceAll("{{author}}", message.author || "")
    .replaceAll("{{subject}}", message.subject || "")
    .replaceAll("{{body}}", body || "");
}

// Instrucción opcional de tono y longitud, para añadir al prompt.
function toneLengthInstruction(tone, length) {
  const tones = {
    formal: "Usa un tono formal y profesional.",
    cercano: "Usa un tono cercano y cordial.",
    breve: "Usa un tono directo y sin rodeos.",
    negativa: "La respuesta es una negativa: comunícala de forma cordial y respetuosa, agradeciendo y explicando el motivo con tacto."
  };
  const lengths = {
    breve: "Que la respuesta sea breve (2-4 frases).",
    normal: "Longitud media, la justa para el asunto.",
    detallada: "Respuesta detallada y completa."
  };
  const parts = [];
  if (tones[tone]) parts.push(tones[tone]);
  if (lengths[length]) parts.push(lengths[length]);
  return parts.length ? parts.join(" ") : "";
}

function matchPatternFromUrl(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

const MAX_BODY = 12000;

// Caracteres invisibles a eliminar: formato Unicode (\p{Cf}: zero-width, BOM, soft hyphen, bidi)
// más rellenos y marcas invisibles que no son \p{Cf} (CGJ, braille en blanco, rellenos hangul).
const INVISIBLE = /[\p{Cf}\u034F\u2800\u115F\u1160\u3164\uFFA0]/gu;

// Limpia el texto: quita invisibles, nbsp, colapsa espacios y elimina las líneas en blanco.
function normalizeText(t) {
  return (t || "")
    .replace(INVISIBLE, "")
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head, noscript, title, link, meta").forEach((n) => n.remove());
  // Representa las imágenes por su texto alternativo (no se puede enviar la imagen en sí).
  doc.querySelectorAll("img").forEach((img) => {
    const alt = (img.getAttribute("alt") || "").trim();
    img.replaceWith(alt ? `[imagen: ${alt}]` : "");
  });
  // Convierte saltos y bloques en saltos de línea para conservar la estructura.
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote").forEach((el) => el.append("\n"));
  return normalizeText(doc.body ? doc.body.textContent : "");
}

function findPart(part, type) {
  if (part.contentType && part.contentType.startsWith(type) && part.body) return part.body;
  if (part.parts) {
    for (const p of part.parts) {
      const r = findPart(p, type);
      if (r) return r;
    }
  }
  return "";
}

async function extractBody(messageId) {
  const full = await messenger.messages.getFull(messageId);
  // Prioriza el HTML (extraer solo el texto visible excluye CSS/scripts); si no hay, usa el texto plano.
  const html = findPart(full, "text/html");
  let text = html ? htmlToText(html) : normalizeText(findPart(full, "text/plain"));
  text = text.trim();
  if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + "\n[correo truncado]";
  return text;
}

// Plantillas: mensajes de las carpetas de tipo "templates" (incluida la de Carpetas locales).
async function listTemplates() {
  const folders = await messenger.folders.query({ specialUse: ["templates"] }).catch(() => []);
  const out = [];
  for (const f of folders || []) {
    let source = f.name || "Plantillas";
    try {
      const acc = await messenger.accounts.get(f.accountId);
      if (acc && acc.name) source = acc.name;
    } catch (_) {}
    let page = await messenger.messages.list(f.id).catch(() => null);
    while (page) {
      for (const m of page.messages || []) out.push({ id: m.id, subject: m.subject || "(sin asunto)", source });
      page = page.id ? await messenger.messages.continueList(page.id).catch(() => null) : null;
    }
  }
  return out;
}

// Monta el prompt final combinando, en orden de prioridad:
// (1) el prompt prioritario del usuario, (2) la instrucción base + correo, (3) el formato de referencia,
// (4) tono/longitud, y (5) la maquetación Markdown. promptBody y formatBody son opcionales.
function buildComposedPrompt(message, body, opts) {
  const o = opts || {};
  const parts = [];
  if (o.promptBody && o.promptBody.trim()) {
    parts.push("INSTRUCCIÓN PRIORITARIA DEL USUARIO (tiene prioridad sobre el resto de indicaciones):\n" +
      o.promptBody.trim());
  }
  parts.push(buildPrompt(message, body, o.template || DEFAULT_PROMPT_TEMPLATE));
  if (o.formatBody && o.formatBody.trim()) {
    parts.push("Usa la siguiente plantilla como REFERENCIA de estructura y formato de la respuesta: síguela, " +
      "rellenando sus huecos o marcadores con los datos del correo y adaptando su estructura y tono; " +
      "aprovecha tu conocimiento para enriquecerla, sin limitarte a copiarla.\n" +
      "--- FORMATO DE REFERENCIA (Markdown) ---\n" + o.formatBody.trim() + "\n--- FIN FORMATO ---");
  }
  const tl = toneLengthInstruction(o.tone, o.length);
  if (tl) parts.push(tl);
  parts.push(MARKDOWN_INSTRUCTION);
  parts.push(MARKDOWN_STYLE);
  return parts.join("\n\n");
}

// Lee una plantilla conservando su Markdown fuente: prioriza texto plano y no colapsa los saltos de párrafo.
async function extractTemplateBody(messageId) {
  const full = await messenger.messages.getFull(messageId);
  let text = findPart(full, "text/plain");
  if (!text) {
    const html = findPart(full, "text/html");
    if (html) text = htmlToText(html);
  }
  text = (text || "")
    .replace(INVISIBLE, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + "\n[plantilla truncada]";
  return text;
}

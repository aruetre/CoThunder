"use strict";

// Guía de estilo Markdown compartida por el prompt normal y el de plantilla (maquetación idéntica).
const MARKDOWN_STYLE =
  "Usa los elementos y estilos de Markdown estándar más adecuados para mejorar la claridad y la organización " +
  "de la respuesta; no hace falta usarlos todos, elige solo los que encajen con el contenido. Tienes disponibles:\n" +
  "- Encabezados de nivel 1 a 6 (#, ##, ###, …) para estructurar.\n" +
  "- Énfasis: negrita (**texto**), cursiva (*texto*) y tachado (~~texto~~).\n" +
  "- Listas ordenadas (1., 2., 3.), con viñetas (-), anidadas y de tareas (- [ ] / - [x]).\n" +
  "- Tablas para comparar datos o presentar información estructurada.\n" +
  "- Citas (>), incluidas anidadas.\n" +
  "- Código en línea (`código`) y bloques de código con lenguaje (```).\n" +
  "- Enlaces [texto](url), imágenes ![alt](url) y líneas divisorias (---).";

const DEFAULT_PROMPT_TEMPLATE =
  "Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje. " +
  "Responde solo con el cuerpo del correo, en código fuente Markdown, sin asunto ni explicaciones.\n\n" +
  MARKDOWN_STYLE + "\n\n" +
  "De: {{author}}\nAsunto: {{subject}}\n\n{{body}}";

const DEFAULTS = {
  copilotUrl: "https://m365.cloud.microsoft/chat",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  newChatByDefault: true
};

function getConfig() {
  return messenger.storage.local.get(DEFAULTS);
}

function buildPrompt(message, body, template) {
  return template
    .replaceAll("{{author}}", message.author || "")
    .replaceAll("{{subject}}", message.subject || "")
    .replaceAll("{{body}}", body || "");
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

// Prompt cuando se elige una plantilla: mezcla el correo original + la plantilla (en Markdown) +
// el conocimiento del agente, y devuelve una respuesta enriquecida y maquetada en Markdown.
function buildTemplatePrompt(message, body, templateBody) {
  return "Redacta la respuesta a este correo combinando tres fuentes: (1) el correo original de abajo, " +
    "(2) la plantilla en Markdown de abajo, y (3) tu conocimiento y experiencia como agente especializado. " +
    "Usa la plantilla como base: si tiene huecos o marcadores (por ejemplo [nombre], [fecha], [motivo]), " +
    "rellénalos con los datos del correo; si es un modelo de estructura o de tono, síguelo. Aprovecha tu " +
    "conocimiento del tema para enriquecer y mejorar la respuesta, no te limites a copiar la plantilla. " +
    "Devuelve solo el cuerpo del correo en código fuente Markdown, sin asunto ni explicaciones.\n\n" +
    MARKDOWN_STYLE + "\n\n" +
    "--- PLANTILLA (Markdown) ---\n" + (templateBody || "") + "\n--- FIN PLANTILLA ---\n\n" +
    "--- CORREO ORIGINAL ---\nDe: " + (message.author || "") + "\nAsunto: " + (message.subject || "") + "\n\n" + (body || "");
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

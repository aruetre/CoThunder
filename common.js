"use strict";

const DEFAULT_PROMPT_TEMPLATE =
  "Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje. " +
  "Responde solo con el cuerpo del correo, en código fuente Markdown, sin asunto ni explicaciones.\n\n" +
  "Estilo Markdown a aplicar:\n" +
  "- Comienza con el saludo como encabezado de nivel 1 (por ejemplo: # Hola Juan).\n" +
  "- Resalta las ideas o datos clave con **negrita**.\n" +
  "- Usa listas cuando aporten claridad: ordenadas (1., 2., 3.) para pasos o secuencias, y con viñetas (-) para enumeraciones sin orden; elige el tipo según el contexto.\n" +
  "- Mantén párrafos cortos y no abuses del formato.\n\n" +
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

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Aplica formato Markdown en línea (negrita, cursiva, código, enlaces) sobre texto ya escapado.
function inlineMd(s) {
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

// Conversor Markdown -> HTML mínimo para el cuerpo de la respuesta (encabezados, listas, negrita, etc.).
function markdownToHtml(md) {
  const lines = (md || "").replace(/\r/g, "").split("\n");
  const out = [];
  let listType = null;
  const closeList = () => { if (listType) { out.push(listType === "ul" ? "</ul>" : "</ol>"); listType = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      closeList();
      const level = m[1].length;
      out.push(`<h${level}>${inlineMd(m[2])}</h${level}>`);
    } else if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inlineMd(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inlineMd(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
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

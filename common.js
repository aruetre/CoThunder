"use strict";

const DEFAULT_PROMPT_TEMPLATE =
  "Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje. " +
  "Responde solo con el cuerpo del correo, sin asunto ni explicaciones.\n\n" +
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

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head").forEach((n) => n.remove());
  return (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim();
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
  let text = findPart(full, "text/plain");
  if (!text) {
    const html = findPart(full, "text/html");
    if (html) text = htmlToText(html);
  }
  text = (text || "").trim();
  if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + "\n[correo truncado]";
  return text;
}

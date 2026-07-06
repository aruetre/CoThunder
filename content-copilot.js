"use strict";

// Selectores reales del chat de M365 Copilot (descubiertos en el spike, 2026-07-06).
const SELECTORS = {
  editor: "#m365-chat-editor-target-element",                 // editor Lexical (contenteditable)
  sendButton: "button.fai-SendButton, button.fai-ChatInput__send",
  newChat: '[data-testid="newChatButton"]'
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.addRange(range);
}

function clearEditor(el) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.addRange(range);
  document.execCommand("delete", false);
}

function typeIntoEditor(text) {
  const el = document.querySelector(SELECTORS.editor);
  if (!el) return false;
  clearEditor(el);
  placeCaretAtEnd(el);
  // Lexical registra el texto con un ÚNICO evento beforeinput; añadir 'input' lo duplica.
  el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true }));
  return true;
}

function clickSend() {
  const btn = document.querySelector(SELECTORS.sendButton);
  if (!btn) return false;
  btn.click();
  return true;
}

async function startNewChat() {
  const btn = document.querySelector(SELECTORS.newChat);
  if (!btn) return false;
  btn.click();
  await delay(800);
  return true;
}

// --- Sonda de Fase 2 (temporal): descubre el contenedor de respuesta del asistente ---
function _describe(el) {
  const attrs = [];
  for (const { name, value } of el.attributes) {
    if (name === "class" || name === "style") continue;
    attrs.push(`${name}="${(value || "").slice(0, 60)}"`);
  }
  const cls = typeof el.className === "string" && el.className
    ? "." + el.className.trim().split(/\s+/).slice(0, 5).join(".") : "";
  return `<${el.tagName.toLowerCase()}${cls}${attrs.length ? " " + attrs.join(" ") : ""}>`;
}

// Protocolo con el background: escribir (opcional nuevo chat) y enviar el prompt.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return;
  if (msg.type === "probeReply") {
    const re = /message|response|bot|assistant|turn|copilot|answer|markdown|reply/i;
    const candidates = [...document.querySelectorAll("[data-testid], [role], [aria-label]")]
      .filter((el) => {
        const key = (el.getAttribute("data-testid") || "") + " " + (el.getAttribute("role") || "") +
          " " + (el.getAttribute("aria-label") || "") + " " + (typeof el.className === "string" ? el.className : "");
        return re.test(key) && (el.textContent || "").trim().length > 25;
      })
      .slice(0, 30)
      .map((el) => ({ sel: _describe(el), text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70) }));
    return { candidates };
  }
  if (msg.type !== "sendPrompt") return;
  if (msg.newChat) await startNewChat();
  if (!typeIntoEditor(msg.prompt)) return { ok: false, reason: "no-editor" };
  await delay(300);
  if (!clickSend()) return { ok: false, reason: "no-send" };
  return { ok: true };
});

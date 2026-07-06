"use strict";

// Selectores reales del chat de M365 Copilot (descubiertos en el spike, 2026-07-06).
const SELECTORS = {
  editor: "#m365-chat-editor-target-element",                 // editor Lexical (contenteditable)
  sendButton: "button.fai-SendButton, button.fai-ChatInput__send",
  newChat: '[data-testid="newChatButton"]'
};

console.log("[CoThunder] content script activo en", location.href);
messenger.runtime.sendMessage({ type: "contentAlive", url: location.href }).catch(() => {});

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

// Cierre del spike: flujo completo escribir+enviar, disparable desde la consola del background.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "spikeSend") return { ignored: true };
  if (msg.newChat) await startNewChat();
  if (!typeIntoEditor(msg.text || "Hola desde CoThunder")) return { ok: false, reason: "no-editor" };
  await delay(300);
  const el = document.querySelector(SELECTORS.editor);
  const editorText = el ? el.textContent : "";
  if (!clickSend()) return { ok: false, reason: "no-send", editorText };
  return { ok: true, editorText };
});

"use strict";

// Selectores reales del chat de M365 Copilot (descubiertos en el spike, 2026-07-06).
const SELECTORS = {
  editor: "#m365-chat-editor-target-element",                 // editor Lexical (contenteditable)
  sendButton: "button.fai-SendButton, button.fai-ChatInput__send",
  newChat: '[data-testid="newChatButton"]',
  reply: '[data-testid="markdown-reply"]',                    // texto de la respuesta del asistente (el último)
  loading: '[data-testid="loading-message"]'                 // presente mientras Copilot genera
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

// Espera a que la respuesta del asistente aparezca (nodo nuevo o texto cambiado) y su texto se estabilice.
function waitForReply(baselineCount, baselineText, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let last = "";
    let stableSince = Date.now();
    let appeared = false;
    const tick = setInterval(() => {
      const nodes = document.querySelectorAll(SELECTORS.reply);
      const el = nodes[nodes.length - 1];
      const text = el ? el.textContent.trim() : "";
      if (nodes.length > baselineCount || (text && text !== baselineText)) appeared = true;
      if (appeared && text && text === last) {
        if (Date.now() - stableSince > 2000) { clearInterval(tick); resolve(text); }
      } else {
        last = text;
        stableSince = Date.now();
      }
      if (Date.now() - start > timeoutMs) { clearInterval(tick); resolve(appeared ? last : ""); }
    }, 500);
  });
}

// Protocolo con el background: escribir (opcional nuevo chat), enviar y capturar la respuesta.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "sendPrompt") return;
  if (msg.newChat) await startNewChat();
  if (!typeIntoEditor(msg.prompt)) return { ok: false, reason: "no-editor" };
  const baseNodes = document.querySelectorAll(SELECTORS.reply);
  const baseline = baseNodes.length;
  const baselineText = baseline ? baseNodes[baseline - 1].textContent.trim() : "";
  await delay(300);
  if (!clickSend()) return { ok: false, reason: "no-send" };
  // Fase 2: en segundo plano, espera la respuesta y avisa al background.
  waitForReply(baseline, baselineText).then((text) => {
    if (text) messenger.runtime.sendMessage({ type: "copilotReply", text }).catch(() => {});
  });
  return { ok: true };
});

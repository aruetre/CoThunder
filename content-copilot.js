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

// Inserta el texto en el editor Lexical reintentando y verificando que entró (al cambiar de agente
// el editor se rehace y tarda en estar listo; un único intento no basta).
async function typeIntoEditor(text, attempts = 4) {
  const probe = (text || "").slice(0, Math.min(8, (text || "").length));
  for (let i = 0; i < attempts; i++) {
    const el = document.querySelector(SELECTORS.editor);
    if (el) {
      clearEditor(el);
      placeCaretAtEnd(el);
      // Lexical registra el texto con un ÚNICO evento beforeinput; añadir 'input' lo duplica.
      el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true }));
      await delay(300);
      const check = document.querySelector(SELECTORS.editor);
      if (check && check.textContent && check.textContent.includes(probe)) return true;
    }
    await delay(500);
  }
  return false;
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

// Agentes del nav de Copilot. Los chats del historial comparten clase con los agentes,
// así que se filtra por el id: los agentes empiezan por P_/T_ o contienen "agent"/"gpt";
// las conversaciones del historial son GUID sueltos.
function isAgentId(id) {
  return !!id && (/^[PT]_/.test(id) || /agent|gpt/i.test(id));
}

function listAgents() {
  return [...document.querySelectorAll(".fai-CopilotNavSubItem")]
    .map((el) => ({ label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " "), id: el.id }))
    .filter((a) => a.label && isAgentId(a.id));
}

// Guarda la lista de agentes para que el popup pueda ofrecerla (la SPA tarda: se intenta a los 3 y 8 s).
function saveAgents() {
  const agents = listAgents();
  if (agents.length) messenger.storage.local.set({ agents }).catch(() => {});
}
setTimeout(saveAgents, 3000);
setTimeout(saveAgents, 8000);
setInterval(saveAgents, 60000); // refresco periódico por si el usuario crea agentes nuevos

// Selecciona un agente por id (estable) o, en su defecto, por nombre.
function selectAgent(id, label) {
  let el = id ? document.getElementById(id) : null;
  if (!el && label) {
    el = [...document.querySelectorAll(".fai-CopilotNavSubItem")].find((n) => (n.getAttribute("aria-label") || "").trim() === label);
  }
  if (el) { el.click(); return true; }
  return false;
}

// Extrae el texto de la respuesta conservando saltos de línea y quitando adornos del bloque de código.
function extractReplyText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll("button, [role='toolbar']").forEach((n) => n.remove());
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre").forEach((n) => n.append("\n"));
  let text = clone.textContent
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  text = text.replace(/^`{3,}\s*\w*\n?/, "").replace(/\n?`{3,}\s*$/, "");      // comillas del bloque de código
  text = text.replace(/^\s*(markdown|md|plaintext|text)\s*\n/i, "");           // etiqueta de idioma
  return text.trim();
}

// Espera a que la respuesta del asistente aparezca (nodo nuevo o texto cambiado) y su texto se estabilice.
function waitForReply(baselineCount, baselineText, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let last = "";
    let stableSince = Date.now();
    let appeared = false;
    const finish = () => {
      const n = document.querySelectorAll(SELECTORS.reply);
      const e = n[n.length - 1];
      return appeared && e ? extractReplyText(e) : "";
    };
    const tick = setInterval(() => {
      const nodes = document.querySelectorAll(SELECTORS.reply);
      const el = nodes[nodes.length - 1];
      const text = el ? el.textContent.trim() : "";
      if (nodes.length > baselineCount || (text && text !== baselineText)) appeared = true;
      if (appeared && text && text === last) {
        if (Date.now() - stableSince > 2000) { clearInterval(tick); resolve(finish()); }
      } else {
        last = text;
        stableSince = Date.now();
      }
      if (Date.now() - start > timeoutMs) { clearInterval(tick); resolve(finish()); }
    }, 500);
  });
}

// Protocolo con el background: escribir (opcional nuevo chat), enviar y capturar la respuesta.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return;
  if (msg.type === "getAgents") {
    const agents = listAgents();
    if (agents.length) messenger.storage.local.set({ agents }).catch(() => {});
    return { agents };
  }
  if (msg.type === "probeAgentsFull") {
    // Sonda temporal: enumera candidatos a agente (por id o clase) para descubrir el panel completo.
    const items = [...document.querySelectorAll("[id], [aria-label]")]
      .filter((el) => {
        const cls = typeof el.className === "string" ? el.className : "";
        return isAgentId(el.id) || /agent/i.test(cls) || /agent/i.test(el.getAttribute("aria-label") || "");
      })
      .slice(0, 80)
      .map((el) => ({
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 45),
        id: el.id || null,
        cls: (typeof el.className === "string" ? el.className : "").split(/\s+/).filter((c) => /agent|nav|item|card|grid|list/i.test(c)).slice(0, 4).join("."),
        tag: el.tagName.toLowerCase()
      }));
    return { items };
  }
  if (msg.type !== "sendPrompt") return;
  if (msg.agentId || msg.agentLabel) {
    selectAgent(msg.agentId, msg.agentLabel);
    await delay(1500);
  } else if (msg.newChat) {
    await startNewChat();
  }
  if (!(await typeIntoEditor(msg.prompt))) return { ok: false, reason: "no-editor" };
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

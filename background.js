"use strict";

// Registra el content script de Copilot en runtime, a partir de la URL configurada.
async function registerCopilotScript() {
  const { copilotUrl } = await getConfig();
  const match = matchPatternFromUrl(copilotUrl);
  try {
    await messenger.scripting.unregisterContentScripts({ ids: ["copilot"] }).catch(() => {});
    await messenger.scripting.registerContentScripts([{
      id: "copilot",
      matches: [match],
      js: ["content-copilot.js"],
      runAt: "document_idle"
    }]);
  } catch (e) {
    console.error("[CoThunder] registro content script:", e);
  }
}
registerCopilotScript();
messenger.storage.onChanged.addListener(registerCopilotScript);

// Mantiene una única ventana de Copilot: si existe la enfoca, si no la crea.
async function ensureCopilotTab() {
  const { copilotUrl } = await getConfig();
  const { copilotTabId } = await messenger.storage.session.get({ copilotTabId: null });
  if (copilotTabId != null) {
    try {
      const t = await messenger.tabs.get(copilotTabId);
      await messenger.windows.update(t.windowId, { focused: true });
      return copilotTabId;
    } catch (_) {
      // la pestaña ya no existe; se recrea abajo
    }
  }
  const win = await messenger.windows.create({ type: "popup", url: copilotUrl, width: 1200, height: 860 });
  const tabId = win.tabs[0].id;
  await messenger.storage.session.set({ copilotTabId: tabId });
  return tabId;
}

// Entrega el payload al content script reintentando hasta que responda (la SPA tarda en cargar).
async function deliverWithRetry(tabId, payload, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await messenger.tabs.sendMessage(tabId, payload);
      if (res) return res;
    } catch (_) {
      // content script aún no inyectado; reintentar
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, reason: "timeout" };
}

// Un único listener con ramas para no competir por la respuesta al popup.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return;
  if (msg.type === "sendToCopilot") {
    await messenger.storage.session.set({ pendingMessageId: msg.messageId ?? null });
    const tabId = await ensureCopilotTab();
    return deliverWithRetry(tabId, { type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat });
  }
  if (msg.type === "copilotReply") {
    const { pendingMessageId } = await messenger.storage.session.get({ pendingMessageId: null });
    if (pendingMessageId == null) return;
    // Composición HTML (mantiene barra de formato y complementos); texto tal cual, con saltos preservados.
    const html = (msg.text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    try {
      await messenger.compose.beginReply(pendingMessageId, "replyToSender", { body: html });
    } catch (e) {
      console.error("[CoThunder] beginReply falló:", e);
    }
    await messenger.storage.session.set({ pendingMessageId: null });
    return { ok: true };
  }
});

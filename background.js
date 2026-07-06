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
// El id se persiste en storage.session porque el background es event page no persistente.
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
  const win = await messenger.windows.create({ type: "popup", url: copilotUrl, width: 480, height: 900 });
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

// Puente desde el popup: asegura la ventana de Copilot y le pasa el prompt.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "sendToCopilot") return;
  const tabId = await ensureCopilotTab();
  return deliverWithRetry(tabId, { type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat });
});

"use strict";

// Registra el content script de Copilot en runtime, a partir de la URL configurada.
async function registerCopilotScript() {
  try {
    const { copilotUrl } = await getConfig();
    const match = matchPatternFromUrl(copilotUrl); // puede lanzar si la URL es inválida
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
// Solo re-registrar cuando cambia la URL de Copilot (no en cada escritura de storage.session).
messenger.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.copilotUrl) registerCopilotScript();
});

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

// Ids de pestañas/ventanas donde está cargado Copilot (id guardado, pestañas y ventanas popup).
async function findCopilotTabIds() {
  const ids = new Set();
  const { copilotTabId } = await messenger.storage.session.get({ copilotTabId: null });
  if (copilotTabId != null) ids.add(copilotTabId);
  for (const t of await messenger.tabs.query({})) {
    if ((t.url || "").includes("m365.cloud.microsoft")) ids.add(t.id);
  }
  try {
    for (const w of await messenger.windows.getAll({ populate: true })) {
      for (const t of w.tabs || []) {
        if ((t.url || "").includes("m365.cloud.microsoft")) ids.add(t.id);
      }
    }
  } catch (_) {}
  return [...ids];
}

// Sonda temporal (descubrimiento del panel completo de agentes).
async function probeAgentsFull() {
  for (const id of await findCopilotTabIds()) {
    try {
      const res = await messenger.tabs.sendMessage(id, { type: "probeAgentsFull" });
      if (res && res.items) {
        console.log("[CoThunder][probeAgentsFull] items:");
        res.items.forEach((it, i) => console.log(i, JSON.stringify(it)));
        return;
      }
    } catch (_) {}
  }
  console.log("[CoThunder][probeAgentsFull] no hay Copilot cargado; recarga su ventana (F5)");
}

// Un único listener con ramas para no competir por la respuesta al popup.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return;
  if (msg.type === "sendToCopilot") {
    try {
      await messenger.storage.session.set({ pendingMessageId: msg.messageId ?? null });
      const tabId = await ensureCopilotTab();
      return await deliverWithRetry(tabId, { type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat, agentId: msg.agentId, agentLabel: msg.agentLabel });
    } catch (e) {
      console.error("[CoThunder] sendToCopilot:", e);
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
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
  if (msg.type === "refreshAgents") {
    for (const id of await findCopilotTabIds()) {
      try {
        const res = await messenger.tabs.sendMessage(id, { type: "getAgents" });
        if (res && res.agents) return { ok: true, agents: res.agents };
      } catch (_) {}
    }
    return { ok: false, reason: "no-copilot" };
  }
});

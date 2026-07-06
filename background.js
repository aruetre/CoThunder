"use strict";
console.log("[CoThunder] background cargado");
const COPILOT_MATCHES = ["*://m365.cloud.microsoft/*"];

async function registerCopilotScript() {
  try {
    const existing = await messenger.scripting.getRegisteredContentScripts({ ids: ["copilot"] });
    if (existing.length) return;
    await messenger.scripting.registerContentScripts([{
      id: "copilot",
      matches: COPILOT_MATCHES,
      js: ["content-copilot.js"],
      runAt: "document_idle"
    }]);
    console.log("[CoThunder] content script registrado (scripting)");
  } catch (e) {
    console.error("[CoThunder] scripting.registerContentScripts falló:", e);
  }
}
registerCopilotScript();

// Instrumentación de spike: confirma en la consola del background que el content script se inyecta.
messenger.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "contentAlive") {
    console.log("[CoThunder] content script VIVO en", msg.url);
  }
});

// Helper de spike: llamable desde la consola del background.
// spikeSend()               -> escribe y envía en el chat actual
// spikeSend({ newChat:true }) -> abre chat nuevo, escribe y envía
async function spikeSend(opts = {}) {
  const tabs = await messenger.tabs.query({});
  const t = tabs.find((t) => (t.url || "").includes("m365.cloud.microsoft"));
  if (!t) { console.log("[CoThunder][spikeSend] no hay pestaña de Copilot"); return; }
  const res = await messenger.tabs.sendMessage(t.id, { type: "spikeSend", text: opts.text, newChat: opts.newChat });
  console.log("[CoThunder][spikeSend] resultado:", res);
}

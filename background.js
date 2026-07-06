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

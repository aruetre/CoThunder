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
  if (!msg) return;
  if (msg.type === "contentAlive") {
    console.log("[CoThunder] content script VIVO en", msg.url);
  } else if (msg.type === "probe") {
    console.log(`[CoThunder][SONDA ${msg.tag}] editors:`, msg.editors);
    console.log(`[CoThunder][SONDA ${msg.tag}] sendButtons:`, msg.sendButtons);
    console.log(`[CoThunder][SONDA ${msg.tag}] newChat:`, msg.newChat);
  }
});

// Helper de spike: llamable desde la consola del background. Escribe texto en Copilot
// y muestra qué botón de enviar aparece una vez hay texto.
async function spikeType(text = "Hola desde CoThunder") {
  const tabs = await messenger.tabs.query({});
  const t = tabs.find((t) => (t.url || "").includes("m365.cloud.microsoft"));
  if (!t) { console.log("[CoThunder][spikeType] no hay pestaña de Copilot"); return; }
  const res = await messenger.tabs.sendMessage(t.id, { type: "spikeType", text });
  console.log("[CoThunder][spikeType] ok:", res && res.ok, "| método que funcionó:", res && res.worked);
  console.log("[CoThunder][spikeType] resultados por método:", res && res.results);
  console.log("[CoThunder][spikeType] editorText final:", res && res.editorText);
  console.log("[CoThunder][spikeType] sendButtons:", res && res.sendButtons);
}

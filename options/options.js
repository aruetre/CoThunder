"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("save").addEventListener("click", async () => {
    const url = $("copilotUrl").value.trim();
    let host;
    try { host = new URL(url).host; } catch (_) { $("saved").textContent = "URL no válida"; return; }
    await messenger.storage.local.set({
      copilotUrl: url,
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked
    });
    $("saved").textContent = host === "m365.cloud.microsoft"
      ? "Guardado"
      : "Guardado — aviso: solo el dominio m365.cloud.microsoft tiene permiso; otro dominio no se inyectará";
    setTimeout(() => { $("saved").textContent = ""; }, 4000);
  });
})();

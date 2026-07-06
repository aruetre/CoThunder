"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("save").addEventListener("click", async () => {
    await messenger.storage.local.set({
      copilotUrl: $("copilotUrl").value.trim(),
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked
    });
    $("saved").textContent = "Guardado";
    setTimeout(() => { $("saved").textContent = ""; }, 2000);
  });
})();

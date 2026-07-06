"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };

  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  // TB 140 solo expone getDisplayedMessages (plural), que devuelve una MessageList; getDisplayedMessage se eliminó.
  const displayed = await messenger.messageDisplay.getDisplayedMessages(tab.id);
  const messages = Array.isArray(displayed) ? displayed : (displayed && displayed.messages) || [];
  const message = messages[0];
  if (!message) { setStatus("err", "No hay ningún correo abierto en esta pestaña"); return; }

  const cfg = await getConfig();
  const body = await extractBody(message.id);
  $("prompt").value = buildPrompt(message, body, cfg.promptTemplate);
  $("newChat").checked = cfg.newChatByDefault;
  setStatus("", "Listo");
  $("send").disabled = false;

  $("send").addEventListener("click", async () => {
    $("send").disabled = true;
    setStatus("busy", "Enviando a Copilot…");
    const res = await messenger.runtime.sendMessage({
      type: "sendToCopilot", prompt: $("prompt").value, newChat: $("newChat").checked
    });
    if (res && res.ok) {
      setStatus("ok", "Enviado");
      setTimeout(() => window.close(), 700);
    } else {
      try { await navigator.clipboard.writeText($("prompt").value); } catch (_) {}
      setStatus("err", "No se pudo escribir en Copilot; prompt copiado al portapapeles, pégalo a mano");
      $("send").disabled = false;
    }
  });
})();

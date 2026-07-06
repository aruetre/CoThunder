"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };

  let message;
  try {
    const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
    // TB 140 solo expone getDisplayedMessages (plural), que devuelve una MessageList; getDisplayedMessage se eliminó.
    const displayed = await messenger.messageDisplay.getDisplayedMessages(tab.id);
    const messages = Array.isArray(displayed) ? displayed : (displayed && displayed.messages) || [];
    message = messages[0];
    if (!message) { setStatus("err", "No hay ningún correo abierto en esta pestaña"); return; }

    const cfg = await getConfig();
    const body = await extractBody(message.id);
    $("prompt").value = buildPrompt(message, body, cfg.promptTemplate);
    $("newChat").checked = cfg.newChatByDefault;

    // Desplegable de agentes: se rellena con los que guardó el content script; recuerda el último elegido.
    const { agents = [], lastAgentId = "" } = await messenger.storage.local.get({ agents: [], lastAgentId: "" });
    const sel = $("agent");
    for (const a of agents) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      opt.dataset.label = a.label;
      sel.appendChild(opt);
    }
    if (lastAgentId && agents.some((a) => a.id === lastAgentId)) sel.value = lastAgentId;

    setStatus("", "Listo");
    $("send").disabled = false;
  } catch (e) {
    setStatus("err", "No se pudo preparar el prompt: " + (e && e.message ? e.message : e));
    return;
  }

  $("send").addEventListener("click", async () => {
    $("send").disabled = true;
    setStatus("busy", "Enviando a Copilot…");
    let res;
    try {
      const agentId = $("agent").value;
      const agentLabel = agentId && $("agent").selectedOptions[0] ? $("agent").selectedOptions[0].dataset.label || "" : "";
      await messenger.storage.local.set({ lastAgentId: agentId });
      res = await messenger.runtime.sendMessage({
        type: "sendToCopilot", prompt: $("prompt").value, newChat: $("newChat").checked, messageId: message.id, agentId, agentLabel
      });
    } catch (e) {
      res = { ok: false, reason: e && e.message ? e.message : String(e) };
    }
    if (res && res.ok) {
      setStatus("ok", "Enviado");
      setTimeout(() => window.close(), 700);
    } else {
      try { await navigator.clipboard.writeText($("prompt").value); } catch (_) {}
      setStatus("err", "No se pudo enviar a Copilot; prompt copiado al portapapeles, pégalo a mano");
      $("send").disabled = false;
    }
  });
})();

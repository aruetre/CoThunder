"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };

  const populateAgents = (agents, selectedId) => {
    const sel = $("agent");
    sel.length = 1; // conserva la primera opción "Copilot por defecto"
    for (const a of agents) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      opt.dataset.label = a.label;
      sel.appendChild(opt);
    }
    if (selectedId && agents.some((a) => a.id === selectedId)) sel.value = selectedId;
  };

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
    populateAgents(agents, lastAgentId);

    // Desplegable de plantillas: mensajes de las carpetas de plantillas de Thunderbird.
    const templates = await listTemplates().catch(() => []);
    const tsel = $("template");
    const multiSource = new Set(templates.map((t) => t.source)).size > 1;
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = multiSource ? `${t.subject} — ${t.source}` : t.subject;
      tsel.appendChild(opt);
    }
    tsel.addEventListener("change", async () => {
      if (!tsel.value) { $("prompt").value = buildPrompt(message, body, cfg.promptTemplate); return; }
      $("send").disabled = true;
      setStatus("busy", "Cargando plantilla…");
      try {
        const templateBody = await extractTemplateBody(Number(tsel.value));
        $("prompt").value = buildTemplatePrompt(message, body, templateBody);
        setStatus("", "Plantilla cargada");
      } catch (_) {
        setStatus("err", "No se pudo leer la plantilla");
      }
      $("send").disabled = false;
    });

    setStatus("", "Listo");
    $("send").disabled = false;
  } catch (e) {
    setStatus("err", "No se pudo preparar el prompt: " + (e && e.message ? e.message : e));
    return;
  }

  // Refresco manual: pide al content script la lista actual de agentes (por si creaste uno nuevo).
  $("refreshAgents").addEventListener("click", async () => {
    const prev = $("agent").value;
    $("refreshAgents").disabled = true;
    let res;
    try { res = await messenger.runtime.sendMessage({ type: "refreshAgents" }); } catch (_) { res = { ok: false }; }
    if (res && res.ok) {
      populateAgents(res.agents || [], prev);
      setStatus("", "Agentes actualizados");
    } else {
      setStatus("err", "Abre la ventana de Copilot para actualizar los agentes");
    }
    $("refreshAgents").disabled = false;
  });

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

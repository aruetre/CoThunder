"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };

  // Ajusta la ventana a la pantalla real (alta densidad / escalado del SO): que no se salga ni quede diminuta.
  try {
    const win = await messenger.windows.getCurrent();
    const availW = screen.availWidth;
    const availH = screen.availHeight;
    const w = Math.min(820, Math.round(availW * 0.9));
    const h = Math.min(820, Math.round(availH * 0.9));
    await messenger.windows.update(win.id, {
      width: w,
      height: h,
      left: Math.max(0, Math.round((availW - w) / 2)),
      top: Math.max(0, Math.round((availH - h) / 2))
    });
  } catch (_) {}

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
    // La ventana recibe el messageId por la URL (la abre el background al pulsar el botón).
    const params = new URLSearchParams(location.search);
    const messageId = params.get("messageId") != null ? Number(params.get("messageId")) : null;
    if (messageId == null || Number.isNaN(messageId)) { setStatus("err", "No hay ningún correo asociado"); return; }
    message = await messenger.messages.get(messageId);
    if (!message) { setStatus("err", "No se pudo cargar el correo"); return; }

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

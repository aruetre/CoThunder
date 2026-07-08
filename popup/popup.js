"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };

  // --- Ventana: recuerda tamaño/posición; si no hay, compacto 600x560 centrado (cabe en 1080p) ---
  try {
    const availW = screen.availWidth, availH = screen.availHeight;
    const { winBounds } = await messenger.storage.local.get({ winBounds: null });
    let w, h, left, top;
    if (winBounds && winBounds.width && winBounds.height) {
      w = Math.min(winBounds.width, availW);
      h = Math.min(winBounds.height, availH);
      left = Math.min(Math.max(0, winBounds.left || 0), Math.max(0, availW - w));
      top = Math.min(Math.max(0, winBounds.top || 0), Math.max(0, availH - h));
    } else {
      w = Math.min(600, availW);
      h = Math.min(560, availH);
      left = Math.max(0, Math.round((availW - w) / 2));
      top = Math.max(0, Math.round((availH - h) / 2));
    }
    const win = await messenger.windows.getCurrent();
    await messenger.windows.update(win.id, { width: w, height: h, left, top });
  } catch (_) {}

  // Guarda tamaño/posición al redimensionar/mover (con rebote) y al cerrar.
  let saveTimer = null;
  const saveBounds = () => {
    messenger.storage.local.set({
      winBounds: { width: window.outerWidth, height: window.outerHeight, left: window.screenX, top: window.screenY }
    }).catch(() => {});
  };
  window.addEventListener("resize", () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveBounds, 400); });
  window.addEventListener("pagehide", saveBounds);

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

  let message, body, cfg, templateBody = null;

  // Compone el prompt según plantilla + tono + longitud.
  const composePrompt = () => {
    const base = templateBody != null
      ? buildTemplatePrompt(message, body, templateBody)
      : buildPrompt(message, body, cfg.promptTemplate);
    const tl = toneLengthInstruction($("tone").value, $("length").value);
    return tl ? base + "\n\n" + tl : base;
  };
  const rebuildPrompt = () => { $("prompt").value = composePrompt(); };

  try {
    const params = new URLSearchParams(location.search);
    const messageId = params.get("messageId") != null ? Number(params.get("messageId")) : null;
    if (messageId == null || Number.isNaN(messageId)) { setStatus("err", "No hay ningún correo asociado"); return; }
    message = await messenger.messages.get(messageId);
    if (!message) { setStatus("err", "No se pudo cargar el correo"); return; }

    cfg = await getConfig();
    body = await extractBody(message.id);

    const prefs = await messenger.storage.local.get({
      lastAgentId: "", agents: [], prefTone: "", prefLength: "", prefSignature: true, prefQuote: false
    });
    $("tone").value = prefs.prefTone;
    $("length").value = prefs.prefLength;
    $("newChat").checked = cfg.newChatByDefault;
    $("includeSignature").checked = prefs.prefSignature;
    $("includeQuote").checked = prefs.prefQuote;

    rebuildPrompt();
    populateAgents(prefs.agents, prefs.lastAgentId);

    // Desplegable de plantillas.
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
      $("send").disabled = true;
      setStatus("busy", "Cargando plantilla…");
      try {
        templateBody = tsel.value ? await extractTemplateBody(Number(tsel.value)) : null;
        rebuildPrompt();
        setStatus("", tsel.value ? "Plantilla cargada" : "Sin plantilla");
      } catch (_) {
        setStatus("err", "No se pudo leer la plantilla");
      }
      $("send").disabled = false;
    });

    $("tone").addEventListener("change", () => { rebuildPrompt(); messenger.storage.local.set({ prefTone: $("tone").value }).catch(() => {}); });
    $("length").addEventListener("change", () => { rebuildPrompt(); messenger.storage.local.set({ prefLength: $("length").value }).catch(() => {}); });
    $("includeSignature").addEventListener("change", () => messenger.storage.local.set({ prefSignature: $("includeSignature").checked }).catch(() => {}));
    $("includeQuote").addEventListener("change", () => messenger.storage.local.set({ prefQuote: $("includeQuote").checked }).catch(() => {}));

    setStatus("", "Listo");
    $("send").disabled = false;
  } catch (e) {
    setStatus("err", "No se pudo preparar el prompt: " + (e && e.message ? e.message : e));
    return;
  }

  // Refresco manual de la lista de agentes.
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

  // Envío, compartido por "Enviar a Copilot" y "Regenerar" (este último fuerza chat nuevo).
  const doSend = async (forceNewChat) => {
    $("send").disabled = true;
    $("regen").disabled = true;
    setStatus("busy", "Enviando a Copilot…");
    let res;
    try {
      const agentId = $("agent").value;
      const agentLabel = agentId && $("agent").selectedOptions[0] ? $("agent").selectedOptions[0].dataset.label || "" : "";
      await messenger.storage.local.set({ lastAgentId: agentId });
      res = await messenger.runtime.sendMessage({
        type: "sendToCopilot",
        prompt: $("prompt").value,
        newChat: forceNewChat || $("newChat").checked,
        messageId: message.id,
        agentId,
        agentLabel,
        includeSignature: $("includeSignature").checked,
        includeQuote: $("includeQuote").checked
      });
    } catch (e) {
      res = { ok: false, reason: e && e.message ? e.message : String(e) };
    }
    if (res && res.ok) {
      setStatus("ok", "Enviado. La respuesta se abrirá en composición cuando Copilot termine. Puedes Regenerar para otra versión.");
      $("regen").hidden = false;
    } else {
      try { await navigator.clipboard.writeText($("prompt").value); } catch (_) {}
      setStatus("err", "No se pudo enviar a Copilot; prompt copiado al portapapeles, pégalo a mano");
    }
    $("send").disabled = false;
    $("regen").disabled = false;
  };

  $("send").addEventListener("click", () => doSend(false));
  $("regen").addEventListener("click", () => doSend(true));
})();

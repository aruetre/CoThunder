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

  // Botón de ayuda: abre la página de opciones (que incluye la guía de uso).
  $("help").addEventListener("click", () => { try { messenger.runtime.openOptionsPage(); } catch (_) {} });

  // Mini editor Markdown para el textarea del prompt (envuelve la selección o prefija las líneas).
  (() => {
    const ta = $("prompt");
    const surround = (before, after) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.setRangeText(before + ta.value.slice(s, e) + after, s, e, "select");
      ta.focus();
    };
    const prefixLines = (mk) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const start = ta.value.lastIndexOf("\n", s - 1) + 1;
      let end = ta.value.indexOf("\n", e);
      if (end === -1) end = ta.value.length;
      const block = ta.value.slice(start, end).split("\n").map((l, i) => mk(i + 1) + l).join("\n");
      ta.setRangeText(block, start, end, "select");
      ta.focus();
    };
    const actions = {
      bold: () => surround("**", "**"),
      italic: () => surround("*", "*"),
      code: () => surround("`", "`"),
      link: () => surround("[", "](url)"),
      h: () => prefixLines(() => "# "),
      ul: () => prefixLines(() => "- "),
      ol: () => prefixLines((n) => n + ". "),
      quote: () => prefixLines(() => "> ")
    };
    document.querySelectorAll(".mdbar button").forEach((b) => {
      b.addEventListener("click", () => { const a = actions[b.dataset.md]; if (a) a(); });
    });
  })();

  let message, body, cfg, promptBody = null, formatBody = null, threadBody = null;

  // Modo de la ventana: "create" (correo nuevo desde cero) o "reply" (respuesta al correo abierto).
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") === "create" ? "create" : "reply";
  if (mode === "create") {
    document.body.classList.add("mode-create");
    document.title = "Crear desde Copilot";
    $("title").textContent = "Crear desde Copilot";
  }

  // Compone el prompt según el modo: creación (brief/contexto/idioma) o respuesta (correo + hilo).
  const composePrompt = () => mode === "create"
    ? buildCreatePrompt({
        promptBody, formatBody,
        tone: $("tone").value, length: $("length").value,
        brief: $("create-brief").value, context: $("create-context").value, language: $("language").value
      })
    : buildComposedPrompt(message, body, {
        template: cfg.promptTemplate, promptBody, formatBody,
        thread: $("includeThread").checked ? threadBody : null,
        tone: $("tone").value, length: $("length").value
      });
  const rebuildPrompt = () => { $("prompt").value = composePrompt(); };

  try {
    cfg = await getConfig();
    if (mode === "reply") {
      const messageId = params.get("messageId") != null ? Number(params.get("messageId")) : null;
      if (messageId == null || Number.isNaN(messageId)) { setStatus("err", "No hay ningún correo asociado"); return; }
      message = await messenger.messages.get(messageId);
      if (!message) { setStatus("err", "No se pudo cargar el correo"); return; }
      body = await extractBody(message.id);
    } else {
      message = null;
      body = "";
    }

    const prefs = await messenger.storage.local.get({
      lastAgentId: "", agents: [], prefTone: "", prefLength: "", prefSignature: true, prefQuote: false, prefThread: false, prefLanguage: ""
    });
    $("tone").value = prefs.prefTone;
    $("length").value = prefs.prefLength;
    $("newChat").checked = cfg.newChatByDefault;
    $("includeSignature").checked = prefs.prefSignature;
    $("includeQuote").checked = prefs.prefQuote;
    $("includeThread").checked = prefs.prefThread;
    if (mode === "create") $("language").value = prefs.prefLanguage;

    rebuildPrompt();
    populateAgents(prefs.agents, prefs.lastAgentId);

    // Desplegables de Prompt y Formato: plantillas de Thunderbird distinguidas por el asunto
    // ("Prompt - ..." = instrucción prioritaria; "Formato - ..." o sin prefijo = referencia de formato).
    const templates = await listTemplates().catch(() => []);
    const multiSource = new Set(templates.map((t) => t.source)).size > 1;
    // "Prompt - …" son prompts de respuesta; "Prompt crear - …" son de creación (solo en modo create).
    const promptReplyRe = /^\s*prompt\s*-\s*/i;
    const promptCreateRe = /^\s*prompt\s+crear\s*-\s*/i;
    const formatRe = /^\s*formato\s*-\s*/i;
    const promptRe = mode === "create" ? promptCreateRe : promptReplyRe;
    const fill = (sel, items, re) => {
      for (const t of items) {
        const opt = document.createElement("option");
        opt.value = String(t.id);
        const label = t.subject.replace(re, "").trim() || t.subject;
        opt.textContent = multiSource ? `${label} — ${t.source}` : label;
        sel.appendChild(opt);
      }
    };
    fill($("prompt-sel"), templates.filter((t) => promptRe.test(t.subject)), promptRe);
    // Los formatos se comparten entre modos; se excluyen ambos tipos de Prompt.
    fill($("format-sel"), templates.filter((t) => formatRe.test(t.subject) ||
      (!promptReplyRe.test(t.subject) && !promptCreateRe.test(t.subject))), formatRe);

    const onSelChange = async (sel, assign, busyMsg) => {
      $("send").disabled = true;
      setStatus("busy", busyMsg);
      try {
        assign(sel.value ? await extractTemplateBody(Number(sel.value)) : null);
        rebuildPrompt();
        setStatus("", "Listo");
      } catch (_) {
        setStatus("err", "No se pudo leer la plantilla");
      }
      $("send").disabled = false;
    };
    $("prompt-sel").addEventListener("change", () => onSelChange($("prompt-sel"), (v) => { promptBody = v; }, "Cargando prompt…"));
    $("format-sel").addEventListener("change", () => onSelChange($("format-sel"), (v) => { formatBody = v; }, "Cargando formato…"));

    $("tone").addEventListener("change", () => { rebuildPrompt(); messenger.storage.local.set({ prefTone: $("tone").value }).catch(() => {}); });
    $("length").addEventListener("change", () => { rebuildPrompt(); messenger.storage.local.set({ prefLength: $("length").value }).catch(() => {}); });
    $("includeSignature").addEventListener("change", () => messenger.storage.local.set({ prefSignature: $("includeSignature").checked }).catch(() => {}));
    $("includeQuote").addEventListener("change", () => messenger.storage.local.set({ prefQuote: $("includeQuote").checked }).catch(() => {}));

    // Reconstruye el prompt al editar los campos de creación (solo existen en modo creación).
    ["create-brief", "create-context"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", rebuildPrompt);
    });
    if ($("language")) $("language").addEventListener("change", () => {
      rebuildPrompt(); messenger.storage.local.set({ prefLanguage: $("language").value }).catch(() => {});
    });

    // El hilo anterior y el aviso de inyección son solo del modo respuesta (el correo entrante son DATOS).
    if (mode === "reply") {
      // Carga (con caché) el hilo anterior; devuelve true si hay hilo, false si no lo hay o falla.
      const loadThread = async () => {
        if (threadBody != null) return threadBody.length > 0;
        threadBody = await buildThreadContext(message.id).catch(() => "");
        return threadBody.length > 0;
      };
      $("includeThread").addEventListener("change", async () => {
        const on = $("includeThread").checked;
        messenger.storage.local.set({ prefThread: on }).catch(() => {});
        if (on) {
          $("send").disabled = true; $("regen").disabled = true;
          setStatus("busy", "Cargando el hilo…");
          const has = await loadThread();
          if (!has) { $("includeThread").checked = false; setStatus("err", "El correo no tiene hilo anterior"); }
          else setStatus("", "Hilo cargado");
          $("send").disabled = false; $("regen").disabled = false;
        }
        rebuildPrompt();
      });

      // Carga inicial del hilo si la preferencia estaba activa (antes de avisar de inyección).
      if ($("includeThread").checked) {
        if (await loadThread()) rebuildPrompt(); else $("includeThread").checked = false;
      }

      // Aviso de posible inyección en el correo o el hilo (la píldora del prompt ya blinda a Copilot).
      const inj = detectInjection(body + "\n" + (threadBody || ""));
      if (inj.detected) {
        setStatus("err", inj.severity === "crit"
          ? "⚠️ Posible manipulación en el correo (protegido)"
          : "⚠️ Patrón sospechoso en el correo (protegido)");
      } else {
        setStatus("", "Listo");
      }
    } else {
      setStatus("", "Listo");
    }
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
      setStatus("err", "Abre Copilot para actualizar agentes");
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
      const base = {
        type: "sendToCopilot", prompt: $("prompt").value,
        newChat: forceNewChat || $("newChat").checked,
        agentId, agentLabel, includeSignature: $("includeSignature").checked
      };
      if (mode === "create") {
        const requestId = "c" + Date.now() + Math.floor(Math.random() * 1e6);
        res = await messenger.runtime.sendMessage({
          ...base, mode: "create", requestId,
          to: ($("recipient-to").value || "").trim(),
          cc: ($("recipient-cc").value || "").trim(),
          bcc: ($("recipient-bcc").value || "").trim()
        });
      } else {
        res = await messenger.runtime.sendMessage({ ...base, mode: "reply", messageId: message.id, includeQuote: $("includeQuote").checked });
      }
    } catch (e) {
      res = { ok: false, reason: e && e.message ? e.message : String(e) };
    }
    if (res && res.ok) {
      setStatus("ok", "Enviado; se abrirá la respuesta");
      $("regen").hidden = false;
    } else {
      try { await navigator.clipboard.writeText($("prompt").value); } catch (_) {}
      setStatus("err", "No se pudo enviar; prompt copiado al portapapeles");
    }
    $("send").disabled = false;
    $("regen").disabled = false;
  };

  $("send").addEventListener("click", () => doSend(false));
  $("regen").addEventListener("click", () => doSend(true));
})();

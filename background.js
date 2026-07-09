"use strict";

// Registra el content script de Copilot en runtime, a partir de la URL configurada.
async function registerCopilotScript() {
  try {
    const { copilotUrl } = await getConfig();
    const match = matchPatternFromUrl(copilotUrl); // puede lanzar si la URL es inválida
    await messenger.scripting.unregisterContentScripts({ ids: ["copilot"] }).catch(() => {});
    await messenger.scripting.registerContentScripts([{
      id: "copilot",
      matches: [match],
      js: ["content-copilot.js"],
      runAt: "document_idle"
    }]);
  } catch (e) {
    console.error("[CoThunder] registro content script:", e);
  }
}
registerCopilotScript();
// Solo re-registrar cuando cambia la URL de Copilot (no en cada escritura de storage.session).
messenger.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.copilotUrl) registerCopilotScript();
});

// El botón del visor abre la UI en una ventana propia (redimensionable), pasándole el messageId.
messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  let messageId = null;
  try {
    const displayed = await messenger.messageDisplay.getDisplayedMessages(tab.id);
    const messages = Array.isArray(displayed) ? displayed : (displayed && displayed.messages) || [];
    if (messages[0]) messageId = messages[0].id;
  } catch (_) {}
  const url = messenger.runtime.getURL("popup/popup.html") + (messageId != null ? "?messageId=" + messageId : "");
  await messenger.windows.create({ url, type: "popup", width: 600, height: 560, allowScriptsToClose: true });
});

// El botón de la barra principal abre la UI en modo creación (correo nuevo, sin messageId).
messenger.action.onClicked.addListener(async () => {
  const url = messenger.runtime.getURL("popup/popup.html") + "?mode=create";
  await messenger.windows.create({ url, type: "popup", width: 600, height: 560, allowScriptsToClose: true });
});

// Mantiene una única ventana de Copilot: si existe la enfoca, si no la crea.
async function ensureCopilotTab() {
  const { copilotUrl } = await getConfig();
  const { copilotTabId } = await messenger.storage.session.get({ copilotTabId: null });
  if (copilotTabId != null) {
    try {
      const t = await messenger.tabs.get(copilotTabId);
      await messenger.windows.update(t.windowId, { focused: true });
      return copilotTabId;
    } catch (_) {
      // la pestaña ya no existe; se recrea abajo
    }
  }
  const win = await messenger.windows.create({ type: "popup", url: copilotUrl, width: 1200, height: 860 });
  const tabId = win.tabs[0].id;
  await messenger.storage.session.set({ copilotTabId: tabId });
  return tabId;
}

// Entrega el payload al content script reintentando hasta que responda (la SPA tarda en cargar).
async function deliverWithRetry(tabId, payload, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await messenger.tabs.sendMessage(tabId, payload);
      if (res) return res;
    } catch (_) {
      // content script aún no inyectado; reintentar
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, reason: "timeout" };
}

// Ids de pestañas/ventanas donde está cargado Copilot (id guardado, pestañas y ventanas popup).
async function findCopilotTabIds() {
  const ids = new Set();
  const { copilotTabId } = await messenger.storage.session.get({ copilotTabId: null });
  if (copilotTabId != null) ids.add(copilotTabId);
  for (const t of await messenger.tabs.query({})) {
    if ((t.url || "").includes("m365.cloud.microsoft")) ids.add(t.id);
  }
  try {
    for (const w of await messenger.windows.getAll({ populate: true })) {
      for (const t of w.tabs || []) {
        if ((t.url || "").includes("m365.cloud.microsoft")) ids.add(t.id);
      }
    }
  } catch (_) {}
  return [...ids];
}

// Un único listener con ramas para no competir por la respuesta al popup.
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return;
  if (msg.type === "sendToCopilot") {
    try {
      // Token de correlación genérico: el messageId (respuesta) o el requestId (creación).
      const token = msg.messageId != null ? String(msg.messageId) : msg.requestId;
      // Guarda las opciones de composición asociadas a este token, para usarlas al llegar la respuesta.
      await messenger.storage.session.set({
        ["opts_" + token]: {
          mode: msg.mode || "reply",
          includeSignature: msg.includeSignature !== false,
          includeQuote: !!msg.includeQuote,
          recipient: (msg.recipient || "").trim()
        }
      });
      const tabId = await ensureCopilotTab();
      // El token viaja con el prompt y vuelve con la respuesta, así cada respuesta va a su destino.
      return await deliverWithRetry(tabId, {
        type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat,
        agentId: msg.agentId, agentLabel: msg.agentLabel, messageId: token
      });
    } catch (e) {
      console.error("[CoThunder] sendToCopilot:", e);
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }
  if (msg.type === "copilotReply") {
    if (msg.messageId == null) return;
    if (!msg.text) {
      // La captura falló (timeout o interfaz cambiada): avisar, ya que el popup se cerró tras "Enviado".
      messenger.notifications.create({
        type: "basic",
        iconUrl: messenger.runtime.getURL("icon.svg"),
        title: "CoThunder",
        message: "No se pudo capturar la respuesta de Copilot. Revísala en la ventana de Copilot."
      }).catch(() => {});
      return;
    }
    // Composición HTML (mantiene barra de formato y complementos); texto tal cual, con saltos preservados.
    const html = msg.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    // Recupera las opciones de composición (firma/cita) guardadas al enviar.
    const optsKey = "opts_" + msg.messageId;
    const store = await messenger.storage.session.get({ [optsKey]: { includeSignature: true, includeQuote: false } });
    const opts = store[optsKey] || { includeSignature: true, includeQuote: false };
    messenger.storage.session.remove(optsKey).catch(() => {});
    // Modo creación: abre un correo nuevo (beginNew) separando Asunto + cuerpo.
    if (opts.mode === "create") {
      try {
        const { subject, body } = parseCreateReply(msg.text);
        const bodyHtml = body
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        const tab = await messenger.compose.beginNew();
        const details = await messenger.compose.getComposeDetails(tab.id);
        let signature = "";
        if (opts.includeSignature) {
          try {
            const identity = details.identityId ? await messenger.identities.get(details.identityId) : null;
            if (identity && identity.signature) {
              signature = "<br><br>" + (identity.signatureIsPlainText
                ? identity.signature.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
                : identity.signature);
            }
          } catch (_) {}
        }
        const upd = { body: bodyHtml + signature };
        if (subject) upd.subject = subject;
        if (opts.recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.recipient)) upd.to = [opts.recipient];
        await messenger.compose.setComposeDetails(tab.id, upd);
      } catch (e) {
        console.error("[CoThunder] beginNew falló:", e);
        messenger.notifications.create({
          type: "basic", iconUrl: messenger.runtime.getURL("icon.svg"), title: "CoThunder",
          message: "No se pudo abrir el correo nuevo con el texto de Copilot."
        }).catch(() => {});
      }
      return { ok: true };
    }
    // Modo respuesta: abre una respuesta al correo original (beginReply necesita el id numérico).
    try {
      const tab = await messenger.compose.beginReply(Number(msg.messageId), "replyToSender");
      const details = await messenger.compose.getComposeDetails(tab.id);
      // Firma configurada del usuario (leída de la identidad de la respuesta), si se pidió incluirla.
      let signature = "";
      if (opts.includeSignature) {
        try {
          const identity = details.identityId ? await messenger.identities.get(details.identityId) : null;
          if (identity && identity.signature) {
            signature = "<br><br>" + (identity.signatureIsPlainText
              ? identity.signature.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
              : identity.signature);
          }
        } catch (_) {}
      }
      // Cita del original (el cuerpo por defecto de la respuesta, sin la firma que Thunderbird pudiera añadir).
      let quote = "";
      if (opts.includeQuote && details.body) {
        try {
          const doc = new DOMParser().parseFromString(details.body, "text/html");
          doc.querySelectorAll(".moz-signature").forEach((n) => n.remove());
          quote = "<br><br>" + (doc.body ? doc.body.innerHTML : "");
        } catch (_) {
          quote = "<br><br>" + details.body;
        }
      }
      await messenger.compose.setComposeDetails(tab.id, { body: html + signature + quote });
    } catch (e) {
      console.error("[CoThunder] beginReply falló:", e);
      messenger.notifications.create({
        type: "basic",
        iconUrl: messenger.runtime.getURL("icon.svg"),
        title: "CoThunder",
        message: "No se pudo abrir la ventana de respuesta con el texto de Copilot."
      }).catch(() => {});
    }
    return { ok: true };
  }
  if (msg.type === "refreshAgents") {
    let responded = false;
    for (const id of await findCopilotTabIds()) {
      try {
        const res = await messenger.tabs.sendMessage(id, { type: "getAgents" });
        if (res && res.agents) {
          responded = true;
          if (res.agents.length) return { ok: true, agents: res.agents };
        }
      } catch (_) {}
    }
    // Respondió pero sin agentes -> lista vacía (no error); nadie respondió -> Copilot no está cargado.
    return responded ? { ok: true, agents: [] } : { ok: false, reason: "no-copilot" };
  }
});

// --- Biblioteca inicial de Prompts y Formatos, sembrada en la carpeta Plantillas al instalar ---
const SEED_ITEMS = [
  { subject: "Prompt - Afirmación / Aceptación", body: "Redacta una respuesta afirmativa y cordial: confirma o acepta lo solicitado, deja claros los siguientes pasos y muestra disposición a colaborar." },
  { subject: "Prompt - Negación cordial", body: "Redacta una respuesta que declina lo solicitado de forma cordial y respetuosa: agradece el mensaje, explica el motivo con tacto y, si es posible, ofrece una alternativa." },
  { subject: "Prompt - Negociación", body: "Redacta una respuesta orientada a negociar: reconoce la propuesta recibida, expón tu posición y tus condiciones, plantea una contraoferta o un punto intermedio y mantén un tono constructivo." },
  { subject: "Prompt - Investigación / Petición de datos", body: "Redacta una respuesta solicitando la información o las aclaraciones necesarias para poder avanzar. Enumera de forma clara las preguntas o los datos que faltan." },
  { subject: "Prompt - Recopilación de documentación", body: "Redacta una respuesta pidiendo que se aporte la documentación o los datos requeridos. Enuméralos con claridad e indica, si procede, el plazo y el formato de entrega." },
  { subject: "Prompt - Acuse de recibo", body: "Redacta un acuse de recibo: confirma que se ha recibido el mensaje, indica que se revisará y da un plazo aproximado de respuesta." },
  { subject: "Prompt - Reclamación", body: "Redacta una reclamación firme pero educada: expón los hechos con fechas y datos concretos, indica claramente lo que solicitas y establece un plazo de respuesta." },
  { subject: "Prompt - Agradecimiento", body: "Redacta un agradecimiento sincero y breve por lo indicado en el correo, cerrando con una nota cordial." },
  { subject: "Prompt - Seguimiento / Recordatorio", body: "Redacta un recordatorio cordial sobre un asunto pendiente: referencia el mensaje anterior, resume lo que queda por resolver y pide una actualización." },
  { subject: "Prompt - Disculpa / Incidencia", body: "Redacta una disculpa profesional: reconoce el problema o el retraso, explica brevemente qué ha pasado y propón una solución o los próximos pasos." },
  { subject: "Formato - Carta institucional", body: "# [Saludo formal]\n\n[Introducción: motivo del mensaje]\n\n[Desarrollo: expón el asunto con detalle]\n\n**[Petición o conclusión concreta]**\n\n[Despedida formal]\n\n[Nombre y cargo]" },
  { subject: "Formato - Respuesta breve", body: "[Saludo]\n\n[Respuesta directa en 2-3 frases]\n\n[Despedida]" },
  { subject: "Formato - Lista de puntos", body: "# [Saludo]\n\n[Frase introductoria]\n\n- [Punto 1]\n- [Punto 2]\n- [Punto 3]\n\n[Cierre]" },
  { subject: "Formato - Tabla comparativa", body: "# [Saludo]\n\n[Introducción breve]\n\n| [Concepto] | [Detalle] |\n|---|---|\n| [elemento] | [valor] |\n| [elemento] | [valor] |\n\n[Cierre]" },
  { subject: "Formato - Propuesta / Oferta", body: "# [Saludo]\n\n[Contexto de la propuesta]\n\n## Propuesta\n- **Alcance:** [descripción]\n- **Plazo:** [plazo]\n- **Condiciones:** [condiciones]\n\n> [Nota o salvedad importante]\n\n[Cierre y llamada a la acción]" },
  { subject: "Prompt - Confirmación de reunión", body: "Confirma la reunión o cita propuesta, reiterando fecha, hora, lugar o enlace y, si procede, el orden del día." },
  { subject: "Prompt - Propuesta de reunión", body: "Propón una reunión: sugiere dos o tres franjas horarias, indica el objetivo y pide que confirmen la que mejor convenga." },
  { subject: "Prompt - Delegación / Reenvío", body: "Indica que trasladas el asunto a la persona o departamento competente: di a quién, por qué y qué puede esperar el remitente a continuación." },
  { subject: "Prompt - Explicación / Aclaración", body: "Explica con claridad y de forma didáctica el asunto planteado, evitando jerga innecesaria y con ejemplos si ayudan a entenderlo." },
  { subject: "Prompt - Oferta económica / Presupuesto", body: "Redacta una respuesta con una oferta económica: detalla los conceptos, los importes, las condiciones y la validez de la oferta." },
  { subject: "Prompt - Rechazo de oferta / candidatura", body: "Comunica de forma respetuosa que no se sigue adelante con la propuesta o candidatura, agradeciendo el interés y dejando la puerta abierta si procede." },
  { subject: "Prompt - Bienvenida / Onboarding", body: "Da la bienvenida y explica los primeros pasos, los recursos disponibles y a quién dirigirse ante cualquier duda." },
  { subject: "Prompt - Escalado / Urgencia", body: "Comunica que el asunto se escala por su urgencia o gravedad: indica a qué nivel se eleva y el plazo de actuación previsto." },
  { subject: "Prompt - Resumen ejecutivo", body: "Resume el correo o el hilo en los puntos clave, las decisiones tomadas y las acciones pendientes, de forma concisa." },
  { subject: "Prompt - Traducción", body: "Traduce el contenido del correo al idioma solicitado, manteniendo el tono, el registro y el significado del original." },
  { subject: "Formato - Correo formal con firma", body: "Estimado/a [Nombre]:\n\n[Párrafo 1]\n\n[Párrafo 2]\n\nQuedo a su disposición para cualquier aclaración.\n\nUn cordial saludo,\n[Nombre]\n[Cargo] · [Organización]\n[Teléfono] · [Correo]" },
  { subject: "Formato - Pasos numerados", body: "# [Título o saludo]\n\n[Contexto breve]\n\n1. [Paso 1]\n2. [Paso 2]\n3. [Paso 3]\n\n[Cierre]" },
  { subject: "Formato - Preguntas y respuestas", body: "# [Saludo]\n\n**[Pregunta 1]**\n[Respuesta 1]\n\n**[Pregunta 2]**\n[Respuesta 2]\n\n[Cierre]" },
  { subject: "Formato - Resumen con acciones", body: "# [Asunto]\n\n**Resumen:** [síntesis en 1-2 frases]\n\n## Puntos clave\n- [Punto 1]\n- [Punto 2]\n\n## Acciones pendientes\n- [ ] [Acción 1] — [responsable / plazo]\n- [ ] [Acción 2] — [responsable / plazo]" },
  { subject: "Formato - Confirmación de cita", body: "# [Saludo]\n\nConfirmo nuestra [reunión o cita]:\n\n- **Fecha:** [fecha]\n- **Hora:** [hora]\n- **Lugar / Enlace:** [lugar o enlace]\n- **Asunto:** [tema]\n\n[Cierre]" },
  { subject: "Formato - Propuesta comercial", body: "# [Saludo]\n\n[Presentación breve]\n\n## Propuesta\n| Concepto | Detalle | Importe |\n|---|---|---|\n| [elemento] | [detalle] | [importe] |\n| [elemento] | [detalle] | [importe] |\n\n**Total:** [total]\n\n**Condiciones:** [condiciones] · **Validez:** [validez]\n\n[Cierre y llamada a la acción]" },
  { subject: "Formato - Identidad UPO", body: "# [Saludo institucional]\n\n[Introducción breve y clara]\n\n[Cuerpo: desarrollo del asunto, con tono institucional]\n\n**[Idea o dato clave]**\n\n> [Nota o aviso destacado]\n\n[Despedida institucional]\n[Nombre]\n[Cargo] · Universidad Pablo de Olavide\n\n---\nIdentidad UPO (referencia de estilo): tono institucional, claro y cordial, con estructura de encabezado, cuerpo y despedida. Colores de marca (oficiales del MIC): azul corporativo #003772 (Pantone 281C) para títulos y acentos; amarillo #FCC100 (Pantone 123C) solo como acento puntual, nunca como fondo de texto de lectura; texto #1A1A1A sobre blanco. Tipografía Franklin Gothic (o Arial como alternativa). No inventes otros colores ni tipografías. Jerarquía: el azul manda, el amarillo resalta, el blanco respira." }
];

// Codifica el asunto en RFC 2047 (UTF-8/Base64) para permitir acentos en la cabecera.
function encodeSubject(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "=?UTF-8?B?" + btoa(bin) + "?=";
}

// Siembra los Prompts y Formatos de ejemplo en la carpeta Plantillas (solo los que aún no existan).
async function seedTemplates() {
  try {
    const folders = await messenger.folders.query({ specialUse: ["templates"] });
    if (!folders || !folders.length) return;
    const folder = folders[0];
    const existing = new Set();
    let page = await messenger.messages.list(folder.id).catch(() => null);
    while (page) {
      for (const m of page.messages || []) existing.add((m.subject || "").trim());
      page = page.id ? await messenger.messages.continueList(page.id).catch(() => null) : null;
    }
    const date = new Date().toUTCString();
    for (const it of SEED_ITEMS) {
      if (existing.has(it.subject)) continue;
      const eml =
        "From: CoThunder <cothunder@local>\r\n" +
        "Date: " + date + "\r\n" +
        "Subject: " + encodeSubject(it.subject) + "\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        "Content-Transfer-Encoding: 8bit\r\n\r\n" +
        it.body;
      const file = new File([eml], "seed.eml", { type: "message/rfc822" });
      await messenger.messages.import(file, folder.id, { read: true })
        .catch((e) => console.error("[CoThunder] seed import:", it.subject, e));
    }
  } catch (e) {
    console.error("[CoThunder] seedTemplates:", e);
  }
}

messenger.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") seedTemplates();
});

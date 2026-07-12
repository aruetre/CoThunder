"use strict";
const EMAIL_THEME_TEMPLATE_CSS = `/* Plantilla de tema para CoThunder.
   Edita los colores y pega este CSS en «CSS personalizado», o súbelo.
   Se aplica como estilos EN LÍNEA sobre el correo (los clientes de correo
   ignoran el CSS externo y las clases), usando selectores de etiqueta. */

h1, h2, h3, h4, h5, h6 { color: #003772; }
a { color: #003772; }
table { border-collapse: collapse; }
th { background: #003772; color: #ffffff; }
th, td { border: 1px solid #d0d7de; padding: 6px 12px; }
blockquote { border-left: 4px solid #FCC100; color: #444444; }
code { background: #f6f8fa; }
mark { background-color: #FCC100; }
`;
(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("mdEditorDefault").checked = cfg.mdEditorDefault;
  $("emailAccent").value = cfg.emailAccent;
  $("emailTheme").value = cfg.emailTheme;
  $("emailCustomCss").value = cfg.emailCustomCss;
  const prof = cfg.userProfile || {};
  $("userName").value = prof.name || "";
  $("userRole").value = prof.role || "";
  $("userOrg").value = prof.org || "";
  $("userAbout").value = prof.about || "";
  $("userStyle").value = prof.style || "";

  // Autorrelleno desde la identidad por defecto de Thunderbird (nombre, organización y firma).
  $("fillFromIdentity").addEventListener("click", async () => {
    try {
      const ids = await messenger.identities.list();
      const id = ids && ids[0];
      if (!id) { $("filled").textContent = "No hay identidad configurada"; return; }
      if (id.name && !$("userName").value.trim()) $("userName").value = id.name;
      if (id.organization && !$("userOrg").value.trim()) $("userOrg").value = id.organization;
      if (id.signature && !$("userStyle").value.trim()) {
        let sig = id.signature;
        if (!id.signatureIsPlainText) {
          const doc = new DOMParser().parseFromString(sig, "text/html");
          sig = (doc.body ? doc.body.textContent : sig);
        }
        sig = sig.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
        if (sig) $("userStyle").value = "Firmo así:\n" + sig;
      }
      $("filled").textContent = "Rellenado. Revisa y pulsa Guardar.";
      setTimeout(() => { $("filled").textContent = ""; }, 5000);
    } catch (_) {
      $("filled").textContent = "No se pudo leer la identidad.";
    }
  });
  $("save").addEventListener("click", async () => {
    const url = $("copilotUrl").value.trim();
    // Guarda SIEMPRE, aunque la URL de Copilot esté vacía o mal formada: así los
    // demás ajustes (tema del correo, acento, perfil...) no se bloquean por la URL.
    await messenger.storage.local.set({
      copilotUrl: url,
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked,
      mdEditorDefault: $("mdEditorDefault").checked,
      emailAccent: $("emailAccent").value,
      emailTheme: $("emailTheme").value,
      emailCustomCss: $("emailCustomCss").value,
      userProfile: {
        name: $("userName").value.trim(),
        role: $("userRole").value.trim(),
        org: $("userOrg").value.trim(),
        about: $("userAbout").value.trim(),
        style: $("userStyle").value.trim()
      }
    });
    let host = "";
    try { host = new URL(url).host; } catch (_) {}
    $("saved").textContent = (!url || host === "m365.cloud.microsoft")
      ? "Guardado"
      : "Guardado. Aviso: solo el dominio m365.cloud.microsoft tiene permiso; otro dominio no se inyectará";
    setTimeout(() => { $("saved").textContent = ""; }, 4000);
  });

  // --- Tema del correo: subir CSS desde fichero y descargar plantilla ---
  $("emailCssFile").addEventListener("change", () => {
    const file = $("emailCssFile").files && $("emailCssFile").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("emailCustomCss").value = String(reader.result || "");
      $("emailTheme").value = "custom";
    };
    reader.readAsText(file);
  });
  $("emailCssDownload").addEventListener("click", () => {
    const blob = new Blob([EMAIL_THEME_TEMPLATE_CSS], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cothunder-tema.css";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // --- Registro de actividad (auditoría local, opcional) ---
  const renderAuditCount = async () => {
    const { auditLog } = await messenger.storage.local.get({ auditLog: [] });
    $("auditCount").textContent = (Array.isArray(auditLog) ? auditLog.length : 0) + " entradas";
  };
  const { auditEnabled } = await messenger.storage.local.get({ auditEnabled: false });
  $("auditEnabled").checked = auditEnabled;
  await renderAuditCount();
  $("auditEnabled").addEventListener("change", () => {
    messenger.storage.local.set({ auditEnabled: $("auditEnabled").checked }).catch(() => {});
  });
  $("auditClear").addEventListener("click", async () => {
    await messenger.storage.local.set({ auditLog: [] });
    await renderAuditCount();
  });
  $("auditExport").addEventListener("click", async () => {
    const { auditLog } = await messenger.storage.local.get({ auditLog: [] });
    const blob = new Blob([JSON.stringify(auditLog || [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cothunder-auditoria.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

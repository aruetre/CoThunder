"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("mdEditorDefault").checked = cfg.mdEditorDefault;
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
    let host;
    try { host = new URL(url).host; } catch (_) { $("saved").textContent = "URL no válida"; return; }
    await messenger.storage.local.set({
      copilotUrl: url,
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked,
      mdEditorDefault: $("mdEditorDefault").checked,
      userProfile: {
        name: $("userName").value.trim(),
        role: $("userRole").value.trim(),
        org: $("userOrg").value.trim(),
        about: $("userAbout").value.trim(),
        style: $("userStyle").value.trim()
      }
    });
    $("saved").textContent = host === "m365.cloud.microsoft"
      ? "Guardado"
      : "Guardado. Aviso: solo el dominio m365.cloud.microsoft tiene permiso; otro dominio no se inyectará";
    setTimeout(() => { $("saved").textContent = ""; }, 4000);
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

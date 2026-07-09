"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("save").addEventListener("click", async () => {
    const url = $("copilotUrl").value.trim();
    let host;
    try { host = new URL(url).host; } catch (_) { $("saved").textContent = "URL no válida"; return; }
    await messenger.storage.local.set({
      copilotUrl: url,
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked
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

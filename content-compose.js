"use strict";
// content-compose.js — compose script: panel dividido (Markdown | preview) en la
// ventana de redacción. Toda la dependencia del DOM del editor de TB va aquí, en
// SELECTORS, para actualizarla en un solo sitio si TB cambia.
// NOTA: build con DIAGNÓSTICO TEMPORAL (barra verde + observador + window.__cothunder).
//       Retirar el diagnóstico tras cerrar el spike.
(function () {
  const SELECTORS = { body: "body" };            // el documento inyectado ES el cuerpo editable
  const IDS = {
    root: "cothunder-md-root", src: "cothunder-md-src",
    preview: "cothunder-md-preview", diag: "cothunder-md-diag"
  };

  let active = false;
  let reinjects = 0;

  // Preview STUB (se sustituye por markdown.js en la task 4).
  function stubRender(md) {
    const div = document.createElement("div");
    div.textContent = md;                          // escapa por textContent
    return div.innerHTML.replace(/\n/g, "<br>");   // lectura de innerHTML propia = segura
  }

  function currentMarkdown() {
    const src = document.getElementById(IDS.src);
    return src ? src.value : "";
  }

  function finalHtml() {
    return active ? stubRender(currentMarkdown()) : null;
  }

  function updateDiag() {
    const d = document.getElementById(IDS.diag);
    if (d) {
      d.textContent = "[CoThunder diag] readyState=" + document.readyState +
        " · reinyecciones=" + reinjects + " · active=" + active +
        " · md.len=" + currentMarkdown().length +
        " · previewNodos=" + ((document.getElementById(IDS.preview) || {}).childElementCount || 0) +
        " · url=" + location.href;
    }
  }

  function updatePreview() {
    const preview = document.getElementById(IDS.preview);
    if (!preview) return;
    // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
    const doc = new DOMParser().parseFromString(finalHtml() || "", "text/html");
    preview.replaceChildren(...doc.body.childNodes);
    updateDiag();
  }

  function activate() {
    const body = document.querySelector(SELECTORS.body);
    if (!body) return;
    // Semilla: conserva lo ya tecleado si re-inyectamos; si no, el texto del cuerpo.
    const prior = document.getElementById(IDS.src);
    const seed = prior ? prior.value : (body.innerText || "");

    const root = document.createElement("div");
    root.id = IDS.root;
    root.style.cssText = "display:flex;flex-direction:column;height:100%;margin:0;box-sizing:border-box;";

    const diag = document.createElement("div");
    diag.id = IDS.diag;
    diag.style.cssText = "font:11px/1.4 monospace;background:#111;color:#0f0;padding:4px 6px;flex:0 0 auto;white-space:pre-wrap;word-break:break-all;";

    const cols = document.createElement("div");
    cols.style.cssText = "display:flex;gap:10px;flex:1 1 auto;min-height:0;";

    const src = document.createElement("textarea");
    src.id = IDS.src;
    src.value = seed;
    src.style.cssText = "flex:1 1 50%;min-width:0;resize:none;border:1px solid #999;background:#fff;color:#111;font:13px/1.5 monospace;padding:8px;box-sizing:border-box;";

    const preview = document.createElement("div");
    preview.id = IDS.preview;
    preview.style.cssText = "flex:1 1 50%;min-width:0;overflow:auto;border:2px solid #c00;background:#fffbe6;color:#111;padding:8px;box-sizing:border-box;";

    cols.append(src, preview);
    root.append(diag, cols);
    body.replaceChildren(root);
    src.addEventListener("input", updatePreview);
    active = true;
    updatePreview();   // pinta preview + diag
    src.focus();
  }

  // Si TB (u otra cosa) borra nuestro panel del cuerpo, lo volvemos a montar.
  // Esto prueba y a la vez neutraliza la hipótesis "TB rellena la respuesta después".
  function ensurePanel() {
    if (document.getElementById(IDS.root)) { updateDiag(); return; }
    reinjects++;
    active = false;
    activate();
  }

  messenger.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === "cothunder-finalize") { respond({ html: finalHtml() }); return true; }
  });

  console.warn("[CoThunder][diag] compose script cargado. readyState=", document.readyState,
    "url=", location.href, "bodyLen=", (document.body && document.body.innerText || "").length);
  try {
    activate();
  } catch (e) {
    console.error("[CoThunder][diag] activate() LANZÓ:", e && e.message, e && e.stack);
  }

  const bodyEl = document.querySelector(SELECTORS.body);
  if (bodyEl) new MutationObserver(ensurePanel).observe(bodyEl, { childList: true });

  // Expuesto para depuración manual desde la consola del editor.
  window.__cothunder = { activate, ensurePanel, updatePreview, finalHtml, currentMarkdown };
})();

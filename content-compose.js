"use strict";
// content-compose.js — compose script: panel dividido (Markdown | preview) en la
// ventana de redacción. Toda la dependencia del DOM del editor de TB va aquí, en
// SELECTORS, para actualizarla en un solo sitio si TB cambia.
(function () {
  const SELECTORS = { body: "body" };            // el documento inyectado ES el cuerpo editable
  const IDS = { root: "cothunder-md-root", src: "cothunder-md-src", preview: "cothunder-md-preview" };

  let active = false;

  function currentMarkdown() {
    const src = document.getElementById(IDS.src);
    return src ? src.value : "";
  }

  // renderMarkdown viene de markdown.js (inyectado antes en el mismo documento).
  function finalHtml() {
    return active ? renderMarkdown(currentMarkdown()) : null;
  }

  function updatePreview() {
    const preview = document.getElementById(IDS.preview);
    if (!preview) return;
    // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
    const doc = new DOMParser().parseFromString(finalHtml() || "", "text/html");
    preview.replaceChildren(...doc.body.childNodes);
  }

  function activate() {
    if (active) return;
    const body = document.querySelector(SELECTORS.body);
    if (!body) return;
    const seed = body.innerText || "";

    const root = document.createElement("div");
    root.id = IDS.root;
    root.style.cssText = "display:flex;gap:10px;height:100%;margin:0;box-sizing:border-box;";

    const src = document.createElement("textarea");
    src.id = IDS.src;
    src.value = seed;
    src.style.cssText = "flex:1 1 50%;min-width:0;min-height:0;resize:none;border:1px solid #bbb;background:#fff;color:#111;font:13px/1.5 monospace;padding:8px;box-sizing:border-box;";

    const preview = document.createElement("div");
    preview.id = IDS.preview;
    preview.style.cssText = "flex:1 1 50%;min-width:0;min-height:0;overflow:auto;border:1px solid #bbb;background:#fff;color:#111;padding:8px;box-sizing:border-box;";

    root.append(src, preview);
    body.replaceChildren(root);
    src.addEventListener("input", updatePreview);
    active = true;
    updatePreview();
    src.focus();
  }

  messenger.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === "cothunder-finalize") { respond({ html: finalHtml() }); return true; }
  });

  activate();   // encendido por defecto (la task 5 añade el toggle configurable)
})();

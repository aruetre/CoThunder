"use strict";
// content-compose.js — compose script: editor Markdown con preview en vivo.
//
// PLAN B (§8 del spec): NO se inyecta ningún textarea. El editor NATIVO de
// Thunderbird es la fuente Markdown (el usuario escribe ahí, a la izquierda);
// añadimos a la derecha un preview NO editable que renderiza en vivo lo que se
// escribe. El textarea competía con el editor nativo por el tecleo, así que se
// descarta. renderMarkdown viene de markdown.js (inyectado antes, mismo scope).
// Toda la dependencia del DOM del editor de TB va aquí, en SELECTORS.
(function () {
  const SELECTORS = { body: "body" };
  const IDS = { preview: "cothunder-md-preview", style: "cothunder-md-style" };

  let active = false;
  let bodyEl = null;
  let previewEl = null;
  let timer = null;

  // Fuente Markdown = texto del cuerpo editable, EXCLUYENDO el preview (que
  // también vive dentro del cuerpo). Se oculta un instante para no leerlo.
  function markdownSource() {
    if (!bodyEl) return "";
    if (previewEl) previewEl.style.display = "none";
    const text = bodyEl.innerText || "";
    if (previewEl) previewEl.style.display = "";
    return text;
  }

  function finalHtml() {
    return active ? renderMarkdown(markdownSource()) : null;
  }

  function renderPreview() {
    if (!previewEl) return;
    try {
      // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
      const doc = new DOMParser().parseFromString(renderMarkdown(markdownSource()), "text/html");
      previewEl.replaceChildren(...doc.body.childNodes);
    } catch (e) {
      previewEl.textContent = "[CoThunder preview] " + (e && e.message);
    }
  }

  // Debounce: no re-renderizar en cada tecla.
  function scheduleRender() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; renderPreview(); }, 150);
  }

  function activate() {
    if (active) return;
    bodyEl = document.querySelector(SELECTORS.body);
    if (!bodyEl) return;

    // Reserva la mitad derecha del área de edición para el preview.
    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent =
      "body{margin-right:50% !important;}" +
      "#" + IDS.preview + "{position:fixed;top:0;right:0;width:50%;height:100%;" +
      "overflow:auto;box-sizing:border-box;border-left:1px solid #bbb;" +
      "background:#fff;color:#111;padding:10px;}";
    (document.head || document.documentElement).appendChild(style);

    previewEl = document.createElement("div");
    previewEl.id = IDS.preview;
    previewEl.contentEditable = "false";
    bodyEl.appendChild(previewEl);

    bodyEl.addEventListener("input", scheduleRender);
    active = true;
    renderPreview();
  }

  messenger.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === "cothunder-finalize") { respond({ html: finalHtml() }); return true; }
  });

  activate();   // encendido por defecto (la task 5 añade el toggle configurable)
})();

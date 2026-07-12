"use strict";
// content-compose.js — compose script: editor Markdown con preview en vivo.
//
// PLAN B (§8 del spec): NO se inyecta ningún textarea. El editor NATIVO de
// Thunderbird es la fuente Markdown (el usuario escribe ahí, a la izquierda);
// a la derecha un preview NO editable renderiza en vivo. renderMarkdown viene
// de markdown.js (inyectado antes, mismo scope). Selectores centralizados.
(function () {
  const SELECTORS = { body: "body" };
  const IDS = { preview: "cothunder-md-preview", style: "cothunder-md-style" };

  let active = false;
  let bodyEl = null;
  let previewEl = null;
  let timer = null;

  // Fuente Markdown: clona el cuerpo editable (sin el preview), convierte las
  // imágenes insertadas a sintaxis ![alt](src) —innerText las descartaría— y lee
  // el texto. Trabaja sobre un clon oculto para no tocar el cursor del editor.
  function markdownSource() {
    if (!bodyEl) return "";
    const holder = document.createElement("div");
    for (const child of bodyEl.childNodes) {
      if (child === previewEl) continue;
      holder.appendChild(child.cloneNode(true));
    }
    holder.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      const alt = img.getAttribute("alt") || "";
      img.replaceWith(document.createTextNode("![" + alt + "](" + src + ")"));
    });
    holder.style.cssText = "position:absolute;left:-99999px;top:0;";
    document.body.appendChild(holder);   // innerText necesita estar en el documento
    const text = holder.innerText || "";
    holder.remove();
    return text;
  }

  function finalHtml() {
    return active ? styleEmail(renderMarkdown(markdownSource())) : null;
  }

  function renderPreview() {
    if (!previewEl) return;
    try {
      // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
      const doc = new DOMParser().parseFromString(styleEmail(renderMarkdown(markdownSource())), "text/html");
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
      "background:#fff;color:#111;padding:10px;}" +
      "#" + IDS.preview + " img{max-width:100%;height:auto;}";
    (document.head || document.documentElement).appendChild(style);

    previewEl = document.createElement("div");
    previewEl.id = IDS.preview;
    previewEl.contentEditable = "false";
    bodyEl.appendChild(previewEl);

    bodyEl.addEventListener("input", scheduleRender);
    active = true;
    renderPreview();
  }

  // Apaga el preview y restaura el editor nativo a ancho completo; el texto Markdown
  // fuente permanece intacto (no se renderiza ni se sustituye el cuerpo).
  function deactivate() {
    if (!active) return;
    if (previewEl) previewEl.remove();
    const style = document.getElementById(IDS.style);
    if (style) style.remove();
    if (bodyEl) bodyEl.removeEventListener("input", scheduleRender);
    previewEl = null;
    active = false;
  }

  function toggle() {
    active ? deactivate() : activate();
  }

  messenger.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === "cothunder-finalize") { respond({ html: finalHtml() }); return true; }
    if (msg && msg.type === "cothunder-toggle") { toggle(); respond({ active }); return true; }
  });

  // Encendido por defecto según el ajuste de Opciones (activable/desactivable con el botón o el atajo).
  messenger.storage.local.get({ mdEditorDefault: true }).then((s) => {
    if (s.mdEditorDefault) activate();
  });
})();

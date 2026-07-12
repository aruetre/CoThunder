"use strict";
// content-compose.js — compose script: editor Markdown con preview en vivo.
//
// PLAN B (§8 del spec): NO se inyecta ningún textarea. El editor NATIVO de
// Thunderbird es la fuente Markdown (el usuario escribe ahí, a la izquierda);
// a la derecha un preview NO editable renderiza en vivo. renderMarkdown viene
// de markdown.js (inyectado antes, mismo scope). Selectores centralizados.
(function () {
  const SELECTORS = { body: "body" };
  const IDS = { preview: "cothunder-md-preview", style: "cothunder-md-style", toolbar: "cothunder-md-toolbar" };

  // Botones de la barra Markdown: etiqueta, título (tooltip) y acción.
  // "wrap" rodea la selección, "prefix" antepone al inicio de línea (v1: caret al inicio de línea)
  // y "block" inserta una plantilla en su propio bloque.
  const TOOLBAR_BUTTONS = [
    { label: "H1", title: "Título 1", kind: "prefix", value: "# " },
    { label: "H2", title: "Título 2", kind: "prefix", value: "## " },
    { label: "B", title: "Negrita", kind: "wrap", before: "**", after: "**" },
    { label: "I", title: "Cursiva", kind: "wrap", before: "*", after: "*" },
    { label: "S", title: "Tachado", kind: "wrap", before: "~~", after: "~~" },
    { label: "</>", title: "Código", kind: "wrap", before: "`", after: "`" },
    { label: "🔗", title: "Enlace", kind: "link" },
    { label: "🖼", title: "Imagen", kind: "image" },
    { label: "❝", title: "Cita", kind: "prefix", value: "> " },
    { label: "•", title: "Lista", kind: "prefix", value: "- " },
    { label: "1.", title: "Lista numerada", kind: "prefix", value: "1. " },
    { label: "☑", title: "Tarea", kind: "prefix", value: "- [ ] " },
    { label: "▦", title: "Tabla", kind: "block", template: "| Col 1 | Col 2 |\n| --- | --- |\n|  |  |" },
    { label: "{}", title: "Bloque de código", kind: "block", template: "```\n\n```" },
    { label: "―", title: "Regla", kind: "block", template: "---" },
    { label: "ℹ", title: "Nota", kind: "block", template: "> [!NOTE]\n> " },
  ];

  let active = false;
  let bodyEl = null;
  let previewEl = null;
  let toolbarEl = null;
  let timer = null;

  // --- Inserción de Markdown en el editor nativo (contenteditable) ---

  function selectedText() {
    const s = window.getSelection();
    return s && s.rangeCount ? s.toString() : "";
  }

  function insertMd(text) {
    bodyEl.focus();
    document.execCommand("insertText", false, text);
    scheduleRender();
  }

  function wrap(before, after) {
    insertMd(before + selectedText() + after);
  }

  // v1: aproximación — antepone al punto donde esté el cursor (funciona bien
  // cuando el cursor está al inicio de la línea; no reindenta la línea entera).
  function prefixLine(prefix) {
    insertMd(prefix + selectedText());
  }

  function insertBlock(template) {
    insertMd("\n" + template + "\n");
  }

  function buildToolbar() {
    const toolbar = document.createElement("div");
    toolbar.id = IDS.toolbar;
    toolbar.style.cssText =
      "position:fixed;top:0;left:0;width:50%;box-sizing:border-box;display:flex;" +
      "flex-wrap:wrap;gap:2px;padding:4px;background:#f6f8fa;border-bottom:1px solid #d0d7de;z-index:10;";

    TOOLBAR_BUTTONS.forEach((spec) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = spec.label;
      btn.title = spec.title;
      btn.style.cssText =
        "cursor:pointer;border:1px solid #d0d7de;background:#fff;border-radius:4px;padding:2px 7px;font:13px sans-serif;";

      const action = () => {
        switch (spec.kind) {
          case "wrap":
            wrap(spec.before, spec.after);
            break;
          case "prefix":
            prefixLine(spec.value);
            break;
          case "link":
            insertMd("[" + selectedText() + "](url)");
            break;
          case "image":
            insertMd("![" + selectedText() + "](url)");
            break;
          case "block":
            insertBlock(spec.template);
            break;
        }
      };

      // No robar la selección del editor al pulsar el botón.
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", action);
      toolbar.appendChild(btn);
    });

    return toolbar;
  }

  // Fuente Markdown: clona el cuerpo editable (sin el preview), convierte las
  // imágenes insertadas a sintaxis ![alt](src) —innerText las descartaría— y lee
  // el texto. Trabaja sobre un clon oculto para no tocar el cursor del editor.
  function markdownSource() {
    if (!bodyEl) return "";
    const holder = document.createElement("div");
    for (const child of bodyEl.childNodes) {
      if (child === previewEl || child === toolbarEl) continue;
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
      "body{margin-right:50% !important;margin-top:40px !important;}" +
      "#" + IDS.preview + "{position:fixed;top:40px;right:0;width:50%;height:calc(100% - 40px);" +
      "overflow:auto;box-sizing:border-box;border-left:1px solid #bbb;" +
      "background:#fff;color:#111;padding:10px;}" +
      "#" + IDS.preview + " img{max-width:100%;height:auto;}";
    (document.head || document.documentElement).appendChild(style);

    previewEl = document.createElement("div");
    previewEl.id = IDS.preview;
    previewEl.contentEditable = "false";
    bodyEl.appendChild(previewEl);

    toolbarEl = buildToolbar();
    bodyEl.appendChild(toolbarEl);

    bodyEl.addEventListener("input", scheduleRender);
    active = true;
    renderPreview();
  }

  // Apaga el preview y restaura el editor nativo a ancho completo; el texto Markdown
  // fuente permanece intacto (no se renderiza ni se sustituye el cuerpo).
  function deactivate() {
    if (!active) return;
    if (previewEl) previewEl.remove();
    if (toolbarEl) toolbarEl.remove();
    const style = document.getElementById(IDS.style);
    if (style) style.remove();
    if (bodyEl) bodyEl.removeEventListener("input", scheduleRender);
    previewEl = null;
    toolbarEl = null;
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

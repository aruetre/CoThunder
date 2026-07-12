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
    // Encabezados
    { label: "H1", title: "Título 1", kind: "prefix", value: "# " },
    { label: "H2", title: "Título 2", kind: "prefix", value: "## " },
    { label: "H3", title: "Título 3", kind: "prefix", value: "### " },
    // Énfasis
    { label: "B", title: "Negrita", kind: "wrap", before: "**", after: "**" },
    { label: "I", title: "Cursiva", kind: "wrap", before: "*", after: "*" },
    { label: "B+I", title: "Negrita y cursiva", kind: "wrap", before: "***", after: "***" },
    { label: "S", title: "Tachado", kind: "wrap", before: "~~", after: "~~" },
    { label: "🖍", title: "Resaltado", kind: "wrap", before: "==", after: "==" },
    { label: "x₂", title: "Subíndice", kind: "wrap", before: "~", after: "~" },
    { label: "x²", title: "Superíndice", kind: "wrap", before: "^", after: "^" },
    { label: "</>", title: "Código en línea", kind: "wrap", before: "`", after: "`" },
    // Enlaces y multimedia
    { label: "🔗", title: "Enlace", kind: "link" },
    { label: "🖼", title: "Imagen", kind: "image" },
    { label: "😀", title: "Emoji", kind: "insert", value: ":smile:" },
    // Listas y cita
    { label: "❝", title: "Cita", kind: "prefix", value: "> " },
    { label: "•", title: "Lista", kind: "prefix", value: "- " },
    { label: "1.", title: "Lista numerada", kind: "prefix", value: "1. " },
    { label: "☑", title: "Tarea", kind: "prefix", value: "- [ ] " },
    // Bloques
    { label: "▦", title: "Tabla", kind: "block", template: "| Col 1 | Col 2 |\n| --- | --- |\n|  |  |" },
    { label: "{}", title: "Bloque de código", kind: "block", template: "```\n\n```" },
    { label: "―", title: "Regla horizontal", kind: "block", template: "---" },
    { label: "Def", title: "Lista de definición", kind: "block", template: "término\n: definición" },
    { label: "†", title: "Nota al pie (añade la definición «[^1]: ...» al final del correo)", kind: "insert", value: "[^1]" },
    // Admonitions (cajas)
    { label: "ℹ", title: "Admonition: Nota", kind: "block", template: "> [!NOTE]\n> " },
    { label: "💡", title: "Admonition: Consejo", kind: "block", template: "> [!TIP]\n> " },
    { label: "❗", title: "Admonition: Importante", kind: "block", template: "> [!IMPORTANT]\n> " },
    { label: "⚠", title: "Admonition: Advertencia", kind: "block", template: "> [!WARNING]\n> " },
    { label: "🛑", title: "Admonition: Precaución", kind: "block", template: "> [!CAUTION]\n> " },
  ];

  let active = false;
  let bodyEl = null;
  let previewEl = null;
  let toolbarEl = null;
  let timer = null;
  let emailAccent = "#0969da";
  // Tema CSS del correo (§ motor de temas): "default" sin CSS extra, "upo" usa el
  // preset UPO_CSS de abajo, "custom" usa el CSS del usuario en emailCustomCss.
  let emailTheme = "default";
  let emailCustomCss = "";

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

  // --- Pegado de HTML como Markdown ---
  // Al pegar contenido con "flavor" HTML (copiado de otro correo o de una web),
  // lo convertimos a Markdown para mantener el editor consistente con el modelo
  // "Markdown como fuente". El pegado de texto plano sigue el comportamiento
  // por defecto del navegador (no se toca).

  function collapseWs(s) {
    return s.replace(/\s+/g, " ");
  }

  function nodeToMd(node) {
    let out = "";
    for (const child of node.childNodes) {
      out += childToMd(child);
    }
    return out;
  }

  function childToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return collapseWs(node.textContent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.nodeName.toLowerCase();
    const inner = () => nodeToMd(node);

    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const level = Number(tag[1]);
        return "\n" + "#".repeat(level) + " " + inner().trim() + "\n\n";
      }
      case "strong": case "b":
        return "**" + inner() + "**";
      case "em": case "i":
        return "*" + inner() + "*";
      case "del": case "s": case "strike":
        return "~~" + inner() + "~~";
      case "code":
        // Si está dentro de <pre>, el propio <pre> ya genera el bloque.
        return node.closest && node.closest("pre") ? node.textContent : "`" + node.textContent + "`";
      case "pre":
        return "\n```\n" + node.textContent + "\n```\n\n";
      case "a":
        return "[" + inner() + "](" + (node.getAttribute("href") || "") + ")";
      case "img":
        return "![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "") + ")";
      case "br":
        return "\n";
      case "hr":
        return "\n---\n\n";
      case "p": case "div":
        return "\n" + inner() + "\n\n";
      case "blockquote": {
        const lines = inner().split("\n").map((l) => (l.trim() ? "> " + l : l));
        return "\n" + lines.join("\n") + "\n\n";
      }
      case "ul": {
        let md = "\n";
        node.querySelectorAll(":scope > li").forEach((li) => {
          md += "- " + nodeToMd(li).trim() + "\n";
        });
        return md + "\n";
      }
      case "ol": {
        let md = "\n";
        node.querySelectorAll(":scope > li").forEach((li) => {
          md += "1. " + nodeToMd(li).trim() + "\n";
        });
        return md + "\n";
      }
      case "table": {
        const rows = Array.from(node.querySelectorAll("tr"));
        if (!rows.length) return inner();
        let md = "\n";
        rows.forEach((tr, i) => {
          const cells = Array.from(tr.querySelectorAll("th,td")).map((c) => nodeToMd(c).trim());
          md += "| " + cells.join(" | ") + " |\n";
          if (i === 0) {
            md += "| " + cells.map(() => "---").join(" | ") + " |\n";
          }
        });
        return md + "\n";
      }
      default:
        return inner();
    }
  }

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return nodeToMd(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  }

  function onPaste(e) {
    const html = e.clipboardData && e.clipboardData.getData("text/html");
    if (!html) return; // sin HTML: pegado normal (texto plano)
    e.preventDefault();
    const md = htmlToMarkdown(html);
    insertMd(md);
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
          case "insert":
            insertMd(spec.value);
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

  // --- Motor de temas CSS -------------------------------------------------
  // Los clientes de correo eliminan CSS externo/clases, así que un tema se
  // aplica como estilos EN LÍNEA sobre el HTML ya maquetado (parseCss viene
  // de markdown.js, mismo scope). Se ejecuta DESPUÉS de styleEmail: setProperty
  // fusiona/pisa sus estilos base regla a regla, en el orden del CSS de entrada.
  function inlineCss(html, css) {
    if (!css) return html;
    const rules = parseCss(css);
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const rule of rules) {
      let els;
      try { els = doc.querySelectorAll(rule.selector); } catch (e) { continue; }
      els.forEach((el) => { for (const d of rule.decls) el.style.setProperty(d.prop, d.value, d.priority || ""); });
    }
    return doc.body.innerHTML;
  }

  // Preset corporativo UPO (colores extraídos de docs/screenshots/upo.css):
  // azul UPO #003772 y amarillo UPO #FCC100. "code" se aplica antes que
  // "pre code" para que el bloque de código quede con SU propio estilo
  // (fondo azul) por encima del inline (fondo amarillo claro).
  const UPO_CSS =
    "h1, h2, h3, h4, h5, h6 { color: #003772; }\n" +
    "a { color: #003772; }\n" +
    "th { background: #003772; color: #ffffff; }\n" +
    "blockquote { border-left-color: #FCC100; background: #f5f9fc; color: #374151; }\n" +
    "hr { border-top-color: #003772; }\n" +
    "code { background-color: #fff4cc; border: 1px solid #FCC100; }\n" +
    "pre code { background: #003772; color: #ffffff; border: 2px solid #FCC100; }";

  // Devuelve el CSS activo según el tema elegido en Opciones.
  function activeThemeCss() {
    if (emailTheme === "upo") return UPO_CSS;
    if (emailTheme === "custom") return emailCustomCss;
    return "";
  }

  function finalHtml() {
    if (!active) return null;
    try {
      return inlineCss(styleEmail(renderMarkdown(markdownSource()), { accent: emailAccent }), activeThemeCss());
    } catch (e) {
      // Degrada con gracia: si el tema/inliner falla, envía al menos el HTML base.
      try { return styleEmail(renderMarkdown(markdownSource()), { accent: emailAccent }); } catch (e2) { return ""; }
    }
  }

  function renderPreview() {
    if (!previewEl) return;
    try {
      // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
      const doc = new DOMParser().parseFromString(inlineCss(styleEmail(renderMarkdown(markdownSource()), { accent: emailAccent }), activeThemeCss()), "text/html");
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
    bodyEl.addEventListener("paste", onPaste);
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
    if (bodyEl) {
      bodyEl.removeEventListener("input", scheduleRender);
      bodyEl.removeEventListener("paste", onPaste);
    }
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

  // Color de acento y tema CSS configurables en Opciones, aplicados al preview/envío.
  messenger.storage.local.get({ emailAccent: "#0969da", emailTheme: "default", emailCustomCss: "" }).then((s) => {
    emailAccent = s.emailAccent || "#0969da";
    emailTheme = s.emailTheme || "default";
    emailCustomCss = s.emailCustomCss || "";
    if (active) renderPreview();
  });
})();

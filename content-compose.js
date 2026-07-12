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
  // Tema CSS del correo (§ motor de temas): "default" sin CSS extra, el resto
  // de ids busca su CSS en el array PRESETS de abajo, "custom" usa el CSS del
  // usuario en emailCustomCss.
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
    // Envuelve el contenido en un contenedor con la clase de Markdown Here, para
    // que los temas MDHR (con selectores ".markdown-here-wrapper ...", como tu
    // upo.css) funcionen TAL CUAL; los selectores planos (h1, table...) también
    // casan como descendientes. La clase se retira al final: en el correo solo
    // quedan los estilos EN LÍNEA (los clientes eliminan clases/CSS externo).
    const wrapper = doc.createElement("div");
    wrapper.className = "markdown-here-wrapper";
    while (doc.body.firstChild) wrapper.appendChild(doc.body.firstChild);
    doc.body.appendChild(wrapper);
    for (const rule of rules) {
      let els;
      try { els = doc.querySelectorAll(rule.selector); } catch (e) { continue; }
      els.forEach((el) => { for (const d of rule.decls) el.style.setProperty(d.prop, d.value, d.priority || ""); });
    }
    wrapper.removeAttribute("class");
    return doc.body.innerHTML;
  }

  // Preset corporativo UPO: CSS completo de docs/screenshots/upo.css (verbatim),
  // ya escrito con selectores ".markdown-here-wrapper ..." — se aplica tal cual.
  const UPO_CSS = `/*
 * Markdown Here – Tema corporativo UPO
 * Colores:
 * Amarillo UPO: #FCC100
 * Azul UPO: #003772
 * Enfoque: documento limpio, profesional, apto para email
 */

.markdown-here-wrapper {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 14.5px;
  line-height: 1.6;
  color: #1f2937;
}

/* Enlaces */
.markdown-here-wrapper a {
  color: #003772;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Párrafos */
.markdown-here-wrapper p {
  margin: 0 0 1.1em 0 !important;
}

/* Separación bloques */
.markdown-here-wrapper table,
.markdown-here-wrapper pre,
.markdown-here-wrapper dl,
.markdown-here-wrapper blockquote,
.markdown-here-wrapper ul,
.markdown-here-wrapper ol,
.markdown-here-wrapper hr {
  margin: 1.1em 0;
}

/* Títulos */
.markdown-here-wrapper h1,
.markdown-here-wrapper h2,
.markdown-here-wrapper h3,
.markdown-here-wrapper h4,
.markdown-here-wrapper h5,
.markdown-here-wrapper h6 {
  margin: 1.3em 0 0.6em;
  font-weight: 700;
  line-height: 1.25;
  color: #003772;
}

.markdown-here-wrapper h1 {
  font-size: 1.7em;
  padding-bottom: 0.3em;
  border-bottom: 3px solid #FCC100;
}

.markdown-here-wrapper h2 {
  font-size: 1.4em;
  padding-bottom: 0.25em;
  border-bottom: 2px solid #003772;
}

.markdown-here-wrapper h3 { font-size: 1.2em; }
.markdown-here-wrapper h4 { font-size: 1.05em; }
.markdown-here-wrapper h5 { font-size: 1em; }
.markdown-here-wrapper h6 { font-size: 0.95em; color: #4b5563; }

/* Listas */
.markdown-here-wrapper ul,
.markdown-here-wrapper ol {
  padding-left: 1.6em;
}

.markdown-here-wrapper li {
  margin: 0.35em 0;
}

.markdown-here-wrapper li p {
  margin: 0.35em 0 !important;
}

/* Línea horizontal */
.markdown-here-wrapper hr {
  border: 0;
  border-top: 1px solid #003772;
  opacity: 0.2;
}

/* Citas */
.markdown-here-wrapper blockquote {
  margin: 1.2em 0;
  padding: 0.4em 0.8em;
  background: #f5f9fc;
  border-left: 5px solid #003772;
  color: #374151;
}

.markdown-here-wrapper blockquote blockquote {
  border-left-color: #FCC100;
  background: #fff9e6;
}

/* Código inline */
.markdown-here-wrapper code {
  margin: 0 0.15em;
  padding: 0.15em 0.35em;
  font-size: 0.95em;
  font-weight: 600;
  background-color: #fff4cc;
  border: 1px solid #FCC100;
  border-radius: 6px;
  white-space: pre-wrap;
  font-family: Consolas, Menlo, Monaco, monospace;
}

/* Bloques de código */
.markdown-here-wrapper pre {
  font-size: 0.95em;
  line-height: 1.45;
}

.markdown-here-wrapper pre code {
  display: block;
  padding: 0.9em 1em;
  white-space: pre;
  overflow: auto;
  background: #003772;
  color: #ffffff;
  border: 2px solid #FCC100;
  border-radius: 10px;
  font-weight: 500;
}

/* Tablas */
.markdown-here-wrapper table {
  width: 100%;
  border-collapse: collapse;
  border: 2px solid #003772;
  font-size: 0.98em;
}

.markdown-here-wrapper table th,
.markdown-here-wrapper table td {
  border: 1px solid #d1d5db;
  padding: 0.55em 0.75em;
  vertical-align: top;
}

.markdown-here-wrapper table th {
  background: #003772;
  color: #ffffff;
  font-weight: 700;
}

.markdown-here-wrapper table tr:nth-child(even) td {
  background: #f9fafb;
}

/* Definiciones */
.markdown-here-wrapper dl dt {
  font-weight: 700;
  color: #003772;
}

.markdown-here-wrapper dl dd {
  margin: 0.3em 0 0.9em;
  padding-left: 0.8em;
}

/* Imágenes */
.markdown-here-wrapper img {
  max-width: 100%;
  height: auto;
  border: 0;
}

/* Checkboxes */
.markdown-here-wrapper input[type="checkbox"] {
  margin-right: 0.4em;
  vertical-align: middle;
}

/* Resaltado de sintaxis, legible sobre el fondo #003772 de los bloques de código */
.markdown-here-wrapper .cthl-comment { color: #9fb6cf; }
.markdown-here-wrapper .cthl-string { color: #ffd479; }
.markdown-here-wrapper .cthl-number { color: #8be9fd; }
.markdown-here-wrapper .cthl-keyword { color: #fcc100; }

/* Resaltado de texto (==marca==) y admonitions (cajas ¡NOTA!/tip/etc.) */
.markdown-here-wrapper .cothunder-mark { background-color: #FCC100; color: #1f2937; }
.markdown-here-wrapper .cothunder-adm-note, .markdown-here-wrapper .cothunder-adm-tip, .markdown-here-wrapper .cothunder-adm-important, .markdown-here-wrapper .cothunder-adm-warning, .markdown-here-wrapper .cothunder-adm-caution { background: #f5f9fc; color: #374151; }
`;

  // Genera el CSS de un tema "famoso" a partir de una paleta de colores, con
  // el MISMO juego de selectores (prefijo ".markdown-here-wrapper", igual que
  // upo.css) para que todos cubran los mismos elementos de forma consistente.
  // "accent" es el color del borde inferior de h1/h2; "border" es el color de
  // los bordes de tabla/celdas (en algunos temas oscuros difieren de "accent").
  function buildThemeCss(p) {
    const markCss = p.markText
      ? "color: " + p.markText + "; background-color: " + p.mark + ";"
      : "background-color: " + p.mark + ";";
    return [
      ".markdown-here-wrapper { background: " + p.bg + "; color: " + p.text +
        "; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif; line-height: 1.6; }",
      ".markdown-here-wrapper a { color: " + p.link + "; }",
      ".markdown-here-wrapper h1, .markdown-here-wrapper h2, .markdown-here-wrapper h3, " +
        ".markdown-here-wrapper h4, .markdown-here-wrapper h5, .markdown-here-wrapper h6 { color: " + p.headings + "; }",
      ".markdown-here-wrapper h1 { border-bottom: 3px solid " + p.accent + "; padding-bottom: 0.3em; }",
      ".markdown-here-wrapper h2 { border-bottom: 2px solid " + p.accent + "; padding-bottom: 0.25em; }",
      ".markdown-here-wrapper blockquote { border-left: 4px solid " + p.bqBorder + "; background: " + p.bqBg +
        "; color: " + p.bqText + "; padding: 0.4em 0.8em; }",
      ".markdown-here-wrapper code { background-color: " + p.codeBg + "; color: " + p.codeText +
        "; border: 1px solid " + p.codeBorder + "; border-radius: 4px; padding: 0.15em 0.35em; " +
        "font-family: Consolas, Menlo, Monaco, monospace; }",
      ".markdown-here-wrapper pre code { display: block; background: " + p.preBg + "; color: " + p.preText +
        "; padding: 0.9em 1em; border-radius: 8px; white-space: pre; overflow: auto; }",
      ".markdown-here-wrapper table { border-collapse: collapse; border: 1px solid " + p.border + "; width: 100%; }",
      ".markdown-here-wrapper th, .markdown-here-wrapper td { border: 1px solid " + p.border + "; padding: 0.5em 0.75em; }",
      ".markdown-here-wrapper th { background: " + p.thBg + "; color: " + p.thText + "; }",
      ".markdown-here-wrapper tr:nth-child(even) td { background: " + p.evenRow + "; }",
      ".markdown-here-wrapper hr { border: 0; border-top: 2px solid " + p.hr + "; }",
      ".markdown-here-wrapper p { margin: 0 0 1.1em; }",
      ".markdown-here-wrapper ul, .markdown-here-wrapper ol { padding-left: 1.6em; }",
      ".markdown-here-wrapper li { margin: 0.35em 0; }",
      ".markdown-here-wrapper dl dt { font-weight: 700; color: " + p.headings + "; }",
      ".markdown-here-wrapper dl dd { margin: 0.3em 0 0.9em; padding-left: 0.8em; }",
      ".markdown-here-wrapper img { max-width: 100%; height: auto; }",
      ".markdown-here-wrapper mark { " + markCss + " }",
      ".markdown-here-wrapper .cothunder-mark { background-color: " + p.mark + "; color: " + p.markText + "; }",
      ".markdown-here-wrapper .cothunder-adm-note, .markdown-here-wrapper .cothunder-adm-tip, " +
        ".markdown-here-wrapper .cothunder-adm-important, .markdown-here-wrapper .cothunder-adm-warning, " +
        ".markdown-here-wrapper .cothunder-adm-caution { background: " + p.admBg + "; color: " + p.admText + "; }",
      ".markdown-here-wrapper .cthl-comment { color: " + p.hlComment + "; }",
      ".markdown-here-wrapper .cthl-string { color: " + p.hlString + "; }",
      ".markdown-here-wrapper .cthl-number { color: " + p.hlNumber + "; }",
      ".markdown-here-wrapper .cthl-keyword { color: " + p.hlKeyword + "; }",
    ].join("\n");
  }

  // Paletas de los temas "famosos" (claro/oscuro), un color por elemento.
  const THEME_PALETTES = [
    { id: "github-light", name: "GitHub (claro)",
      bg: "#ffffff", text: "#1f2328", headings: "#1f2328", accent: "#d0d7de", link: "#0969da",
      codeBg: "#f6f8fa", codeText: "#1f2328", codeBorder: "#d0d7de",
      preBg: "#f6f8fa", preText: "#1f2328",
      bqBorder: "#d0d7de", bqBg: "#f6f8fa", bqText: "#57606a",
      border: "#d0d7de", thBg: "#f6f8fa", thText: "#1f2328", evenRow: "#f6f8fa",
      hr: "#d0d7de", mark: "#fff8c5",
      hlComment: "#6e7781", hlString: "#0a3069", hlNumber: "#0550ae", hlKeyword: "#cf222e",
      admBg: "#f6f8fa", admText: "#1f2328" },
    { id: "github-dark", name: "GitHub (oscuro)",
      bg: "#0d1117", text: "#c9d1d9", headings: "#e6edf3", accent: "#30363d", link: "#2f81f7",
      codeBg: "#161b22", codeText: "#c9d1d9", codeBorder: "#30363d",
      preBg: "#161b22", preText: "#c9d1d9",
      bqBorder: "#30363d", bqBg: "#161b22", bqText: "#8b949e",
      border: "#30363d", thBg: "#161b22", thText: "#e6edf3", evenRow: "#161b22",
      hr: "#30363d", mark: "#bb8009", markText: "#ffffff",
      hlComment: "#8b949e", hlString: "#a5d6ff", hlNumber: "#79c0ff", hlKeyword: "#ff7b72",
      admBg: "#161b22", admText: "#c9d1d9" },
    { id: "solarized-light", name: "Solarized (claro)",
      bg: "#fdf6e3", text: "#657b83", headings: "#586e75", accent: "#93a1a1", link: "#268bd2",
      codeBg: "#eee8d5", codeText: "#657b83", codeBorder: "#93a1a1",
      preBg: "#eee8d5", preText: "#586e75",
      bqBorder: "#268bd2", bqBg: "#eee8d5", bqText: "#657b83",
      border: "#93a1a1", thBg: "#268bd2", thText: "#fdf6e3", evenRow: "#eee8d5",
      hr: "#93a1a1", mark: "#b58900", markText: "#fdf6e3",
      hlComment: "#93a1a1", hlString: "#2aa198", hlNumber: "#d33682", hlKeyword: "#859900",
      admBg: "#eee8d5", admText: "#073642" },
    { id: "solarized-dark", name: "Solarized (oscuro)",
      bg: "#002b36", text: "#839496", headings: "#93a1a1", accent: "#073642", link: "#268bd2",
      codeBg: "#073642", codeText: "#839496", codeBorder: "#586e75",
      preBg: "#073642", preText: "#93a1a1",
      bqBorder: "#268bd2", bqBg: "#073642", bqText: "#839496",
      border: "#586e75", thBg: "#268bd2", thText: "#fdf6e3", evenRow: "#073642",
      hr: "#586e75", mark: "#b58900", markText: "#002b36",
      hlComment: "#586e75", hlString: "#2aa198", hlNumber: "#d33682", hlKeyword: "#859900",
      admBg: "#073642", admText: "#93a1a1" },
    { id: "monokai", name: "Monokai (oscuro)",
      bg: "#272822", text: "#f8f8f2", headings: "#a6e22e", accent: "#f92672", link: "#66d9ef",
      codeBg: "#3e3d32", codeText: "#f8f8f2", codeBorder: "#75715e",
      preBg: "#1e1f1c", preText: "#f8f8f2",
      bqBorder: "#fd971f", bqBg: "#3e3d32", bqText: "#cfcfc2",
      border: "#75715e", thBg: "#f92672", thText: "#272822", evenRow: "#3e3d32",
      hr: "#75715e", mark: "#e6db74", markText: "#272822",
      hlComment: "#75715e", hlString: "#e6db74", hlNumber: "#ae81ff", hlKeyword: "#f92672",
      admBg: "#3e3d32", admText: "#f8f8f2" },
    { id: "dracula", name: "Dracula (oscuro)",
      bg: "#282a36", text: "#f8f8f2", headings: "#bd93f9", accent: "#ff79c6", link: "#8be9fd",
      codeBg: "#44475a", codeText: "#f8f8f2", codeBorder: "#6272a4",
      preBg: "#21222c", preText: "#f8f8f2",
      bqBorder: "#ff79c6", bqBg: "#44475a", bqText: "#f8f8f2",
      border: "#6272a4", thBg: "#bd93f9", thText: "#282a36", evenRow: "#44475a",
      hr: "#6272a4", mark: "#f1fa8c", markText: "#282a36",
      hlComment: "#6272a4", hlString: "#f1fa8c", hlNumber: "#bd93f9", hlKeyword: "#ff79c6",
      admBg: "#44475a", admText: "#f8f8f2" },
    { id: "nord", name: "Nord (oscuro)",
      bg: "#2e3440", text: "#d8dee9", headings: "#88c0d0", accent: "#5e81ac", link: "#88c0d0",
      codeBg: "#3b4252", codeText: "#eceff4", codeBorder: "#4c566a",
      preBg: "#3b4252", preText: "#eceff4",
      bqBorder: "#5e81ac", bqBg: "#3b4252", bqText: "#d8dee9",
      border: "#4c566a", thBg: "#5e81ac", thText: "#eceff4", evenRow: "#3b4252",
      hr: "#4c566a", mark: "#ebcb8b", markText: "#2e3440",
      hlComment: "#616e88", hlString: "#a3be8c", hlNumber: "#b48ead", hlKeyword: "#81a1c1",
      admBg: "#3b4252", admText: "#d8dee9" },
    { id: "onedark", name: "One Dark (oscuro)",
      bg: "#282c34", text: "#abb2bf", headings: "#61afef", accent: "#3e4451", link: "#61afef",
      codeBg: "#3e4451", codeText: "#abb2bf", codeBorder: "#5c6370",
      preBg: "#21252b", preText: "#abb2bf",
      bqBorder: "#c678dd", bqBg: "#3e4451", bqText: "#abb2bf",
      border: "#5c6370", thBg: "#61afef", thText: "#282c34", evenRow: "#2c313a",
      hr: "#3e4451", mark: "#e5c07b", markText: "#282c34",
      hlComment: "#5c6370", hlString: "#98c379", hlNumber: "#d19a66", hlKeyword: "#c678dd",
      admBg: "#3e4451", admText: "#abb2bf" },
    { id: "upo-light", name: "UPO claro",
      bg: "#ffffff", text: "#1f2937", headings: "#003772", accent: "#FCC100", link: "#003772",
      codeBg: "#fff4cc", codeText: "#663c00", codeBorder: "#FCC100",
      preBg: "#f5f9fc", preText: "#1f2937",
      bqBorder: "#003772", bqBg: "#f5f9fc", bqText: "#374151",
      border: "#d1d5db", thBg: "#003772", thText: "#ffffff", evenRow: "#f5f9fc",
      hr: "#003772", mark: "#FCC100", markText: "#1f2937",
      hlComment: "#6e7781", hlString: "#0a3069", hlNumber: "#0550ae", hlKeyword: "#cf222e",
      admBg: "#f5f9fc", admText: "#374151" },
    { id: "upo-dark", name: "UPO oscuro",
      bg: "#001a33", text: "#dce7f0", headings: "#FCC100", accent: "#FCC100", link: "#7dc4f0",
      codeBg: "#002b4d", codeText: "#ffe9a8", codeBorder: "#FCC100",
      preBg: "#00284a", preText: "#e6eef5",
      bqBorder: "#FCC100", bqBg: "#002b4d", bqText: "#cbd8e5",
      border: "#24557f", thBg: "#003772", thText: "#ffffff", evenRow: "#002b4d",
      hr: "#FCC100", mark: "#FCC100", markText: "#1f2937",
      hlComment: "#7f9cb5", hlString: "#ffd479", hlNumber: "#8be9fd", hlKeyword: "#FCC100",
      admBg: "#002b4d", admText: "#dce7f0" },
    { id: "upo-mixed", name: "UPO mixto",
      bg: "#ffffff", text: "#1f2937", headings: "#003772", accent: "#FCC100", link: "#003772",
      codeBg: "#fff4cc", codeText: "#663c00", codeBorder: "#FCC100",
      preBg: "#003772", preText: "#ffffff",
      bqBorder: "#003772", bqBg: "#f5f9fc", bqText: "#374151",
      border: "#d1d5db", thBg: "#003772", thText: "#ffffff", evenRow: "#f5f9fc",
      hr: "#003772", mark: "#FCC100", markText: "#1f2937",
      hlComment: "#9fb6cf", hlString: "#ffd479", hlNumber: "#8be9fd", hlKeyword: "#FCC100",
      admBg: "#f5f9fc", admText: "#374151" },
  ];

  // Lista de presets del selector de Opciones: { id (valor guardado), name (español), css }.
  const PRESETS = [
    { id: "default", name: "Por defecto", css: "" },
    { id: "upo", name: "UPO corporativo", css: UPO_CSS },
  ].concat(THEME_PALETTES.map((p) => ({ id: p.id, name: p.name, css: buildThemeCss(p) })));

  // Devuelve el CSS activo según el tema elegido en Opciones: "custom" usa el
  // CSS del usuario (emailCustomCss); el resto busca el preset por id ("" si
  // no se encuentra, p. ej. "default").
  function activeThemeCss() {
    if (emailTheme === "custom") return emailCustomCss;
    const preset = PRESETS.find((p) => p.id === emailTheme);
    return preset ? preset.css : "";
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

  // Aplica EN VIVO los cambios de tema/acento hechos en Opciones, sin tener que
  // reabrir la redacción: si no, una ventana ya abierta se quedaría con el tema
  // que tenía al abrirse (p. ej. seguiría en UPO tras cambiar a Dracula).
  messenger.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.emailAccent) emailAccent = changes.emailAccent.newValue || "#0969da";
    if (changes.emailTheme) emailTheme = changes.emailTheme.newValue || "default";
    if (changes.emailCustomCss) emailCustomCss = changes.emailCustomCss.newValue || "";
    if (active && (changes.emailAccent || changes.emailTheme || changes.emailCustomCss)) renderPreview();
  });
})();

# Editor Markdown con preview en la ventana de redacción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a CoThunder un panel dividido en la ventana de redacción de Thunderbird (Markdown editable a la izquierda, preview HTML en vivo a la derecha), con motor Markdown propio, que sustituye a Markdown Here Revival y se integra con el flujo de Copilot.

**Architecture:** Un *compose script* (`content-compose.js`) inyectado en el documento del cuerpo editable monta el panel y renderiza el preview con `markdown.js` (renderizador vanilla propio). El renderizado ocurre **solo en el compose script**: el `onBeforeSend` del background le pide el HTML final y lo devuelve con `{ cancel: true, details: { body } }`, reemplazando el cuerpo entero, de modo que el andamiaje del panel nunca se envía por construcción. El flujo de Copilot deja el Markdown fuente en el cuerpo y, como el panel está encendido por defecto, se muestra ya maquetado.

**Tech Stack:** JavaScript vanilla `"use strict"`, MailExtension MV3, API `messenger` (`composeScripts`/`scripting.compose`, `compose.onBeforeSend`, `composeAction`), `node --test` para la lógica pura.

## Global Constraints

- Manifest V3, `browser_specific_settings.gecko`, `strict_min_version: "140.0"` (TB ESR 140; objetivo 150+ retrocompatible con 140).
- API de Thunderbird siempre por el objeto global `messenger` (nunca `browser`/`chrome`).
- JavaScript vanilla con `"use strict"`. Sin frameworks, bundlers ni dependencias npm en runtime. Node solo para pruebas/tooling.
- Sin permisos nuevos: `compose` y `scripting` ya están declarados.
- Sin `eval`, `new Function` ni `innerHTML` con contenido remoto. HTML se procesa solo con `DOMParser`.
- Toda dependencia del DOM del editor de TB vive en `content-compose.js` con selectores centralizados en un único objeto.
- Textos de UI en español; código y nombres de variables en inglés. Prosa de commits en español, imperativo, resumen en una línea.
- El contenido no viaja a ningún destino nuevo (todo local en la ventana de redacción).

---

### Task 1: Spike — mecanismo del panel dividido en el editor nativo

Valida el mayor riesgo antes de invertir en el motor: que se puede inyectar un layout de dos columnas en el editor de redacción, editar en la izquierda, ver un preview a la derecha y que **al enviar sale HTML limpio**, en TB 140 y 150+. Usa un preview *stub* (texto escapado); el motor real llega en las tasks 2–4.

**Files:**
- Modify: `manifest.json`
- Create: `content-compose.js`
- Create: `compose.css`
- Modify: `background.js`

**Interfaces:**
- Produces:
  - Mensaje runtime `{ type: "cothunder-finalize" }` (background → compose tab) al que el compose script responde con `{ html: string | null }` (`null` si el panel está apagado).
  - `background.js` registra el compose script en runtime y añade un listener `messenger.compose.onBeforeSend`.

- [ ] **Step 1: Declarar el botón de redacción en el manifest**

En `manifest.json`, añade la clave `compose_action` (junto a `action`/`message_display_action`):

```json
  "compose_action": { "default_title": "Editor Markdown", "default_icon": "icon.svg" },
```

- [ ] **Step 2: Validar el manifest**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"`
Expected: imprime `manifest OK`.

- [ ] **Step 3: Crear el compose script stub con el panel de dos columnas**

Crea `content-compose.js`:

```js
"use strict";
// content-compose.js — compose script: panel dividido (Markdown | preview) en la
// ventana de redacción. Toda la dependencia del DOM del editor de TB va aquí, en
// SELECTORS, para actualizarla en un solo sitio si TB cambia.
(function () {
  const SELECTORS = { body: "body" };            // el documento inyectado ES el cuerpo editable
  const IDS = { root: "cothunder-md-root", src: "cothunder-md-src", preview: "cothunder-md-preview" };

  let active = false;

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

  function updatePreview() {
    const preview = document.getElementById(IDS.preview);
    if (!preview) return;
    // DOMParser: convierte nuestra cadena segura en nodos sin ejecutar scripts.
    const doc = new DOMParser().parseFromString(finalHtml() || "", "text/html");
    preview.replaceChildren(...doc.body.childNodes);
  }

  function activate() {
    if (active) return;
    const seed = document.body.innerText || "";
    const root = document.createElement("div");
    root.id = IDS.root;
    root.style.cssText = "display:flex;gap:12px;height:100%;box-sizing:border-box;";
    const src = document.createElement("textarea");
    src.id = IDS.src;
    src.value = seed;
    src.style.cssText = "flex:1;min-width:0;resize:none;border:0;outline:none;font-family:monospace;";
    const preview = document.createElement("div");
    preview.id = IDS.preview;
    preview.style.cssText = "flex:1;min-width:0;overflow:auto;";
    root.append(src, preview);
    document.body.replaceChildren(root);
    src.addEventListener("input", updatePreview);
    active = true;
    updatePreview();
    src.focus();
  }

  messenger.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === "cothunder-finalize") { respond({ html: finalHtml() }); return true; }
  });

  activate();   // encendido por defecto (la task 5 añade el toggle)
})();
```

- [ ] **Step 4: Crear la hoja de estilos mínima**

Crea `compose.css` (contenido mínimo para el spike; el tema real llega en la task 7):

```css
#cothunder-md-preview { border-left: 1px solid #ccc; padding-left: 12px; }
```

- [ ] **Step 5: Registrar el compose script y el onBeforeSend en el background**

En `background.js`, añade cerca del arranque (tras `"use strict"`, junto al resto de inicialización):

```js
// --- Editor Markdown en la ventana de redacción -------------------------------
messenger.composeScripts.register({
  js: [{ file: "content-compose.js" }],
  css: [{ file: "compose.css" }]
});

// Al enviar con el panel activo: pide el HTML final al compose script, cancela
// ese envío y deja el HTML en el cuerpo (el usuario revisa y envía).
messenger.compose.onBeforeSend.addListener(async (tab) => {
  try {
    const res = await messenger.tabs.sendMessage(tab.id, { type: "cothunder-finalize" });
    if (res && res.html != null) {
      return { cancel: true, details: { body: res.html } };
    }
  } catch (e) {
    console.error("[CoThunder] onBeforeSend Markdown falló:", e);
  }
});
```

- [ ] **Step 6: Validar sintaxis JS**

Run: `for f in common.js background.js content-copilot.js content-compose.js popup/popup.js options/options.js; do node --check "$f"; done`
Expected: sin salida (todos válidos).

- [ ] **Step 7: Prueba manual en Thunderbird 140 y 150+ (gate del spike)**

Carga la extensión como complemento temporal en **TB ESR 140** y en **TB 150+**. En cada una:
1. Abre una ventana de redacción nueva → aparecen **dos columnas**; escribe en la izquierda → la derecha refleja el texto.
2. Escribe varias líneas y pulsa **Enviar** (a un correo de prueba propio) → el envío **se cancela**, el cuerpo queda con el HTML (sin `<textarea>` ni andamiaje). Vuelve a Enviar → sale un correo limpio.
3. Escribe una respuesta a un correo existente → mismo comportamiento.

Criterio de aceptación: en 140 y 150+ el panel se monta y el envío sale limpio. Si la edición en dos columnas resulta inviable en el editor nativo, **para y aplica el plan B** (cuerpo nativo solo-Markdown + preview como overlay no editable): en `activate()`, en vez de `document.body.replaceChildren(root)`, deja el `textarea` como cuerpo y añade el preview como `position:fixed` a la derecha; el resto del plan no cambia (el HTML final se sigue obteniendo por `finalHtml()`).

- [ ] **Step 8: Commit**

```bash
git add manifest.json content-compose.js compose.css background.js
git commit -m "Spike: panel dividido Markdown en la ventana de redacción (stub)"
```

---

### Task 2: `markdown.js` — renderizado en línea

Motor propio, capa en línea: escapado seguro, código, enlaces con esquema permitido, negrita y cursiva. Lógica pura, probada en Node.

**Files:**
- Create: `markdown.js`
- Test: `test/markdown.test.js`

**Interfaces:**
- Produces: `renderInline(text: string) -> string` (HTML en línea seguro). Exportado en `module.exports` para Node; global en el navegador. Se usa desde `renderMarkdown` (task 3).

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `test/markdown.test.js`:

```js
"use strict";
// Pruebas del renderizador Markdown (lógica pura, sin Thunderbird).
// Ejecutar con: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderInline } = require("../markdown.js");

test("renderInline escapa HTML", () => {
  assert.equal(renderInline("a < b & c"), "a &lt; b &amp; c");
});

test("renderInline: negrita y cursiva", () => {
  assert.equal(renderInline("**hola**"), "<strong>hola</strong>");
  assert.equal(renderInline("_eso_"), "<em>eso</em>");
});

test("renderInline: código en línea escapa su contenido", () => {
  assert.equal(renderInline("usa `a < b`"), "usa <code>a &lt; b</code>");
});

test("renderInline: enlace con esquema permitido", () => {
  assert.equal(renderInline("[web](https://x.io)"), '<a href="https://x.io">web</a>');
});

test("renderInline: enlace con esquema no permitido queda como texto", () => {
  assert.equal(renderInline("[x](javascript:alert(1))"), "x");
});
```

- [ ] **Step 2: Ejecutar las pruebas y verificar que fallan**

Run: `node --test test/markdown.test.js`
Expected: FAIL con `Cannot find module '../markdown.js'`.

- [ ] **Step 3: Implementar `markdown.js` (capa en línea)**

Crea `markdown.js`:

```js
"use strict";
// markdown.js — renderizador Markdown -> HTML propio (subconjunto de correo).
// Vanilla, sin dependencias. Produce SIEMPRE una cadena HTML segura: todo el
// texto va escapado y los enlaces se filtran por esquema. Reglas centralizadas.
// Se usa en content-compose.js (preview y cuerpo final) y en Node para pruebas.

const MD_SAFE_SCHEMES = /^(https?:|mailto:)/i;

function mdEscape(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  const codes = [];
  // 1) Aísla los code spans antes de escapar el resto.
  let s = String(text == null ? "" : text).replace(/`([^`]+)`/g, (m, c) => {
    codes.push("<code>" + mdEscape(c) + "</code>");
    return " " + (codes.length - 1) + " ";
  });
  // 2) Escapa el texto restante.
  s = mdEscape(s);
  // 3) Enlaces [texto](url) solo con esquema permitido; si no, texto plano.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
    MD_SAFE_SCHEMES.test(url) ? '<a href="' + url + '">' + label + "</a>" : label);
  // 4) Negrita y cursiva.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/__([^_]+)__/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>")
       .replace(/(^|[^A-Za-z0-9])_([^_]+)_/g, "$1<em>$2</em>");
  // 5) Restaura los code spans.
  return s.replace(/ (\d+) /g, (m, i) => codes[Number(i)]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mdEscape, renderInline };
}
```

- [ ] **Step 4: Ejecutar las pruebas y verificar que pasan**

Run: `node --test test/markdown.test.js`
Expected: PASS (5 pruebas). Ajusta las regex hasta que pasen exactamente.

- [ ] **Step 5: Commit**

```bash
git add markdown.js test/markdown.test.js
git commit -m "Renderizador Markdown: capa en línea (escape, código, enlaces, énfasis)"
```

---

### Task 3: `markdown.js` — renderizado de bloques y tablas

Capa de bloque sobre `renderInline`: encabezados, párrafos, listas (con anidación), citas, regla horizontal, bloques de código y tablas.

**Files:**
- Modify: `markdown.js`
- Test: `test/markdown.test.js`

**Interfaces:**
- Consumes: `renderInline` (task 2).
- Produces: `renderMarkdown(src: string) -> string` (HTML de bloque seguro; bloques unidos por `\n`, sin salto final). Exportado en `module.exports`. Lo consume `content-compose.js` (task 4).

- [ ] **Step 1: Añadir las pruebas de bloque que fallan**

Añade a `test/markdown.test.js`:

```js
const { renderMarkdown } = require("../markdown.js");

test("renderMarkdown: encabezados", () => {
  assert.equal(renderMarkdown("# Hola"), "<h1>Hola</h1>");
  assert.equal(renderMarkdown("### Sub"), "<h3>Sub</h3>");
});

test("renderMarkdown: párrafo con énfasis", () => {
  assert.equal(renderMarkdown("Texto **fuerte**"), "<p>Texto <strong>fuerte</strong></p>");
});

test("renderMarkdown: lista desordenada", () => {
  assert.equal(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
});

test("renderMarkdown: cita y regla", () => {
  assert.equal(renderMarkdown("> cita"), "<blockquote><p>cita</p></blockquote>");
  assert.equal(renderMarkdown("---"), "<hr>");
});

test("renderMarkdown: bloque de código escapa su contenido", () => {
  assert.equal(renderMarkdown("```\na < b\n```"), "<pre><code>a &lt; b</code></pre>");
});

test("renderMarkdown: tabla de pipes", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  assert.equal(
    renderMarkdown(md),
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
  );
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `node --test test/markdown.test.js`
Expected: FAIL con `renderMarkdown is not a function` (las de la task 2 siguen en PASS).

- [ ] **Step 3: Implementar `renderMarkdown` en `markdown.js`**

Añade a `markdown.js`, **antes** del bloque `module.exports`:

```js
function renderMarkdown(src) {
  const lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isTableSep = (s) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
  const cells = (s) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }                          // línea vacía
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);                          // encabezado
    if (h) { const n = h[1].length; out.push(`<h${n}>${renderInline(h[2].trim())}</h${n}>`); i++; continue; }

    if (/^```/.test(line)) {                                            // bloque de código
      i++; const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out.push("<pre><code>" + mdEscape(buf.join("\n")) + "</code></pre>"); continue;
    }

    if (/^\s*>\s?/.test(line)) {                                        // cita
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push("<blockquote>" + renderMarkdown(buf.join("\n")) + "</blockquote>"); continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {       // listas
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      const marker = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length && marker.test(lines[i])) { items.push(renderInline(lines[i].match(marker)[1])); i++; }
      out.push(`<${tag}>` + items.map((t) => `<li>${t}</li>`).join("") + `</${tag}>`); continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {   // tabla
      const head = cells(line).map((c) => `<th>${renderInline(c)}</th>`).join("");
      i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        rows.push("<tr>" + cells(lines[i]).map((c) => `<td>${renderInline(c)}</td>`).join("") + "</tr>"); i++;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`); continue;
    }

    const buf = [];                                                    // párrafo
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push("<p>" + renderInline(buf.join(" ")) + "</p>");
  }
  return out.join("\n");
}
```

Y amplía el `module.exports` a `{ mdEscape, renderInline, renderMarkdown }`.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `node --test test/markdown.test.js`
Expected: PASS (todas). Itera sobre las regex hasta cuadrar las cadenas exactas.

- [ ] **Step 5: Commit**

```bash
git add markdown.js test/markdown.test.js
git commit -m "Renderizador Markdown: bloques (encabezados, listas, citas, código, tablas)"
```

---

### Task 4: Conectar el motor real al compose script

Sustituye el *stub* por `renderMarkdown` real en el preview y en el HTML final.

**Files:**
- Modify: `manifest.json`
- Modify: `content-compose.js`

**Interfaces:**
- Consumes: `renderMarkdown` (task 3).

- [ ] **Step 1: Cargar `markdown.js` antes del compose script**

En `background.js`, en la llamada `messenger.composeScripts.register`, añade `markdown.js` **antes** de `content-compose.js`:

```js
  js: [{ file: "markdown.js" }, { file: "content-compose.js" }],
```

- [ ] **Step 2: Usar el motor real en `content-compose.js`**

En `content-compose.js`, sustituye la función `stubRender` y la línea de `finalHtml` que la usa:

```js
  function finalHtml() {
    return active ? renderMarkdown(currentMarkdown()) : null;   // renderMarkdown viene de markdown.js
  }
```

Borra `stubRender` (ya no se usa).

- [ ] **Step 3: Validar sintaxis**

Run: `node --check content-compose.js && node --test test/markdown.test.js`
Expected: sin errores de sintaxis; pruebas en PASS.

- [ ] **Step 4: Prueba manual**

En TB (140 o 150+): abre redacción, escribe `# Título`, `- uno`, `- dos`, `**negrita**` y una tabla; la derecha muestra el HTML maquetado. Envía → el correo sale maquetado.

- [ ] **Step 5: Commit**

```bash
git add manifest.json background.js content-compose.js
git commit -m "Conecta el renderizador Markdown real al panel de redacción"
```

---

### Task 5: Activación — botón, atajo, toggle y ajuste por defecto

Convierte el "siempre encendido" en un toggle real: botón `composeAction`, atajo `Ctrl+Alt+M`, y un ajuste en Opciones para el estado por defecto.

**Files:**
- Modify: `manifest.json`
- Modify: `background.js`
- Modify: `content-compose.js`
- Modify: `options/options.html`
- Modify: `options/options.js`

**Interfaces:**
- Consumes: mensaje `{ type: "cothunder-finalize" }` (task 1).
- Produces: mensaje `{ type: "cothunder-toggle" }` (background → compose tab); ajuste `storage.local` `mdEditorDefault` (boolean, por defecto `true`).

- [ ] **Step 1: Declarar el atajo de teclado en el manifest**

En `manifest.json`, añade la clave `commands`:

```json
  "commands": {
    "toggle-markdown": {
      "suggested_key": { "default": "Ctrl+Alt+M" },
      "description": "Alternar el editor Markdown en la ventana de redacción"
    }
  },
```

- [ ] **Step 2: Toggle por mensaje en el compose script**

En `content-compose.js`, añade una función `deactivate` y amplía el listener de mensajes:

```js
  function deactivate() {
    if (!active) return;
    const html = renderMarkdown(currentMarkdown());
    const doc = new DOMParser().parseFromString(html, "text/html");
    document.body.replaceChildren(...doc.body.childNodes);   // deja el HTML como cuerpo real
    active = false;
  }

  function toggle() { active ? deactivate() : activate(); }
```

Y en el listener, añade el caso:

```js
    if (msg && msg.type === "cothunder-toggle") { toggle(); respond({ active }); return true; }
```

Sustituye la llamada final `activate();` por un arranque que consulta el ajuste:

```js
  messenger.storage.local.get({ mdEditorDefault: true }).then((s) => { if (s.mdEditorDefault) activate(); });
```

- [ ] **Step 3: Cablear el botón y el atajo en el background**

En `background.js`, añade:

```js
async function toggleMarkdownPanel() {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  if (tab) { try { await messenger.tabs.sendMessage(tab.id, { type: "cothunder-toggle" }); } catch (e) {} }
}
messenger.composeAction.onClicked.addListener(toggleMarkdownPanel);
messenger.commands.onCommand.addListener((name) => { if (name === "toggle-markdown") toggleMarkdownPanel(); });
```

- [ ] **Step 4: Añadir el ajuste en Opciones**

En `options/options.html`, añade dentro del formulario:

```html
<label><input type="checkbox" id="mdEditorDefault"> Activar el editor Markdown por defecto en la redacción</label>
```

En `options/options.js`, en la carga y el guardado de ajustes, incluye `mdEditorDefault` (checkbox) con el resto: al cargar, `messenger.storage.local.get({ mdEditorDefault: true })` y `document.getElementById("mdEditorDefault").checked = value`; al guardar, `mdEditorDefault: document.getElementById("mdEditorDefault").checked`. Sigue el patrón exacto de los ajustes ya existentes en ese fichero.

- [ ] **Step 5: Validar sintaxis**

Run: `for f in background.js content-compose.js options/options.js; do node --check "$f"; done && node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"`
Expected: sin salida ni error.

- [ ] **Step 6: Prueba manual**

En TB: el botón "Editor Markdown" y `Ctrl+Alt+M` **alternan** el panel (encendido↔apagado, conservando el contenido). En Opciones, desmarca el ajuste; una redacción nueva abre **sin** panel; el botón lo enciende.

- [ ] **Step 7: Commit**

```bash
git add manifest.json background.js content-compose.js options/options.html options/options.js
git commit -m "Activación del editor Markdown: botón, atajo Ctrl+Alt+M y ajuste por defecto"
```

---

### Task 6: Integración con el flujo de Copilot

Que la respuesta de Copilot llegue al cuerpo como **Markdown fuente** (no HTML escapado), para que el panel la muestre ya maquetada.

**Files:**
- Modify: `background.js:152-226`

**Interfaces:**
- Consumes: el panel encendido por defecto (task 5) lee el cuerpo como Markdown.

- [ ] **Step 1: Dejar Markdown fuente en respuesta y creación**

En `background.js`, en el manejo de `copilotReply` / composición: sustituye las conversiones `escapeHtmlWithBreaks(msg.text)` y `escapeHtmlWithBreaks(body)` que fijan el cuerpo por el **texto Markdown en crudo**. En `beginReply`/`beginNew`, fija `body` al Markdown fuente tal cual (sin escapar). Mantén el escapado solo donde de verdad se necesite HTML sin panel (p. ej. firma/cita, si aplica). El panel, encendido por defecto, tomará ese Markdown y lo renderizará; al enviar, `onBeforeSend` produce el HTML final.

Nota: revisa que el Markdown fuente entra íntegro (los `#`, `-`, `|`, `>` deben sobrevivir a `setComposeDetails`). Si TB reformatea el texto plano, fija el cuerpo con saltos preservados y confía en que `activate()` lo lee por `document.body.innerText`.

- [ ] **Step 2: Validar sintaxis**

Run: `node --check background.js`
Expected: sin salida.

- [ ] **Step 3: Prueba manual (flujo completo)**

Desde un correo abierto, usa "Preguntar a Copilot", envía y espera la respuesta. La ventana de respuesta se abre con el panel **encendido**, el Markdown de Copilot a la izquierda y el preview maquetado a la derecha. Ajusta y envía → correo maquetado. Repite con "Crear desde Copilot".

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "Copilot entrega Markdown fuente al panel de redacción en vez de HTML escapado"
```

---

### Task 7: Tema visual del HTML y estado del botón

Estilo del panel y del HTML de salida (tema tipo MDHR) e indicador de estado del botón.

**Files:**
- Modify: `compose.css`
- Modify: `content-compose.js`
- Modify: `background.js`

**Interfaces:**
- Consumes: `activate`/`deactivate` (tasks 1, 5).

- [ ] **Step 1: Tema del panel y del correo**

En `compose.css`, define estilos legibles para el panel dividido y para el HTML renderizado del preview (encabezados, listas, `blockquote`, `table` con bordes, `pre`/`code` con fondo). Ámbito bajo `#cothunder-md-root` y `#cothunder-md-preview` para no afectar a otras redacciones.

- [ ] **Step 2: Reflejar el estado en el botón**

En `background.js`, al alternar, actualiza el título del `composeAction` según el estado devuelto por el compose script:

```js
async function toggleMarkdownPanel() {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await messenger.tabs.sendMessage(tab.id, { type: "cothunder-toggle" });
    const on = !!(res && res.active);
    messenger.composeAction.setTitle({ tabId: tab.id, title: on ? "Editor Markdown (activo)" : "Editor Markdown" });
  } catch (e) {}
}
```

- [ ] **Step 3: Validar sintaxis**

Run: `node --check background.js && node --check content-compose.js`
Expected: sin salida.

- [ ] **Step 4: Prueba manual**

El panel y el correo se ven maquetados y legibles; el botón indica cuándo está activo.

- [ ] **Step 5: Commit**

```bash
git add compose.css content-compose.js background.js
git commit -m "Tema visual del editor Markdown e indicador de estado del botón"
```

---

### Task 8: Revisión, documentación y empaquetado

Cierre: revisión de calidad, versión, CHANGELOG y `.xpi`.

**Files:**
- Modify: `manifest.json` (versión)
- Modify: `CHANGELOG.md`
- Modify: `README.md`

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Revisión de calidad**

Aplica la skill `revision-mailextension` sobre todos los cambios (manifest, permisos, background, compose script, opciones, seguridad). Corrige lo que señale.

- [ ] **Step 2: Ejecutar todas las pruebas**

Run: `node --test`
Expected: todas las pruebas (common + markdown) en PASS.

- [ ] **Step 3: Subir versión y documentar**

En `manifest.json`, sube la versión a `2.5.0` (feature nueva, SemVer minor). Añade la entrada `[2.5.0]` al `CHANGELOG.md` describiendo el editor Markdown con preview en la redacción y la sustitución de Markdown Here. Actualiza el `README.md` con la nueva funcionalidad.

- [ ] **Step 4: Empaquetar**

Aplica la skill `empaquetado-xpi` (valida y genera `cothunder-2.5.0.xpi`).

- [ ] **Step 5: Commit**

```bash
git add manifest.json CHANGELOG.md README.md
git commit -m "v2.5.0: editor Markdown con preview en la ventana de redacción"
```

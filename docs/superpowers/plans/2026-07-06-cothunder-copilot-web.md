# CoThunder (automatización de Copilot web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensión MailExtension de Thunderbird que, al pulsar un botón sobre un correo, abre Microsoft 365 Copilot dentro de Thunderbird, escribe un prompt editable con el contenido del correo y lo envía, usando la sesión ya iniciada del usuario (sin API).

**Architecture:** Manifest V3 en TB ESR 140. Un popup del botón del visor (`message_display_action`) monta el prompt y lo manda al background (event page no persistente). El background gestiona una única ventana/pestaña de Copilot y registra en runtime un content script que pilota el DOM de Copilot (escribir + enviar, opcional "chat nuevo"). Fase 2: el content script captura la respuesta y el background abre composición. Toda la fragilidad del DOM de Copilot vive centralizada en `content-copilot.js`.

**Tech Stack:** JavaScript vanilla `"use strict"`, API WebExtension de Thunderbird (`messenger.*`), sin frameworks, sin bundlers, sin dependencias npm en runtime. Node solo para validación.

## Global Constraints

- Thunderbird ESR 140.0+, `strict_min_version: "140.0"`, id `cothunder@local`.
- **Manifest V3.** Background como event page: `background: { scripts: ["common.js","background.js"] }` (no persistente por definición en MV3; **no declarar `persistent`**). No service worker. Id y versión mínima van en `browser_specific_settings.gecko` (no `applications`).
- Sin key `content_scripts` (no existe en MV3): el content script se registra en runtime desde el background.
- Permisos: `["messagesRead","compose","storage","scripting"]`. `host_permissions` (key separado) con el patrón del dominio de M365 Copilot.
- API de Thunderbird siempre vía el objeto global `messenger`, nunca `browser`/`chrome`.
- JavaScript vanilla con `"use strict"` en todos los ficheros. Sin dependencias externas en runtime.
- El contenido de correos solo viaja a M365 Copilot. Sin telemetría ni terceros. Sin `eval`/`new Function`. En UI propia, nunca `innerHTML` con contenido de correos o de Copilot.
- Textos de UI en español; código y nombres de variables en inglés. Commits en español, imperativo, resumen en una línea, terminando con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Fuente de verdad: `spec/docs/ESPECIFICACION.md` (v2.0.0). Si el plan y el spec divergen, gana el spec.
- Verificación de cada tarea: `node --check` de los JS tocados + validación JSON del manifest + prueba manual en Thunderbird descrita en la tarea. No hay runner de tests unitarios; no lo introduzcas.

## Estructura de ficheros (objetivo)

```
manifest.json          MV3, permisos, host_permissions, message_display_action, options_ui, background
common.js              DEFAULTS, getConfig, extractBody, buildPrompt, matchPatternFromUrl (compartido background+popup)
background.js          registro del content script, ventana única de Copilot, puente popup<->content, compose (fase 2)
content-copilot.js     SELECTORS + automatización del DOM de Copilot (escribir, enviar, nuevo chat, capturar)
popup/popup.html       UI del botón: textarea + check + botón + estado
popup/popup.css        estilos claro/oscuro
popup/popup.js         monta prompt del correo mostrado y envía al background
options/options.html   URL de Copilot, plantilla, check "nuevo chat" por defecto
options/options.js     carga/guarda configuración
icon.svg               icono
```

---

## FASE 0 — Spike bloqueante (puerta de decisión)

Objetivo: demostrar en TB 140 que se puede (a) registrar/inyectar un content script en el dominio de Copilot con MV3, y (b) escribir texto en el chat de Copilot y enviarlo. Si no se logra, **parar** y decidir MV2 antes de seguir. De aquí sale además el objeto `SELECTORS` real.

### Task 0.1: Esqueleto mínimo instalable (manifest + background vacío)

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `common.js` (vacío con `"use strict";` por ahora, para respetar el orden de carga)
- Create: `icon.svg` (placeholder simple)

**Interfaces:**
- Produces: una extensión que instala en TB 140 sin advertencias y cuyo background carga.

- [ ] **Step 1: Escribir `manifest.json` mínimo MV3**

```json
{
  "manifest_version": 3,
  "name": "CoThunder",
  "description": "Envía el correo abierto a Microsoft 365 Copilot y trae la respuesta.",
  "version": "2.0.0",
  "browser_specific_settings": { "gecko": { "id": "cothunder@local", "strict_min_version": "140.0" } },
  "permissions": ["messagesRead", "compose", "storage", "scripting"],
  "host_permissions": ["*://m365.cloud.microsoft/*", "*://*.cloud.microsoft/*", "*://copilot.cloud.microsoft/*"],
  "background": { "scripts": ["common.js", "background.js"] },
  "message_display_action": { "default_title": "Preguntar a Copilot" },
  "icons": { "32": "icon.svg", "64": "icon.svg" }
}
```
Nota: los patrones de `host_permissions` son un primer intento; el spike confirma la URL real del chat de M365 Copilot y se ajustan.

- [ ] **Step 2: `common.js` y `background.js` mínimos**

`common.js`:
```javascript
"use strict";
```
`background.js`:
```javascript
"use strict";
console.log("[CoThunder] background cargado");
```

- [ ] **Step 3: `icon.svg` placeholder**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1a5fb4"/><text x="32" y="42" font-size="32" text-anchor="middle" fill="#fff" font-family="sans-serif">C</text></svg>
```

- [ ] **Step 4: Validar sintaxis y manifest**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"
for f in common.js background.js; do node --check "$f" && echo "$f OK"; done
```
Expected: `manifest OK`, `common.js OK`, `background.js OK`.

- [ ] **Step 5: Prueba manual en Thunderbird**

Cargar temporalmente: `Herramientas > Depuración de complementos > Cargar complemento temporal` (o `about:debugging`), seleccionar `manifest.json`. Verificar: instala sin advertencias, aparece el botón "Preguntar a Copilot" en la barra del visor de mensajes, y en la consola del background se ve `[CoThunder] background cargado`.
Expected: los tres puntos se cumplen. Si hay advertencia de manifest, corregir antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add manifest.json common.js background.js icon.svg
git commit -m "Añade esqueleto MV3 instalable de CoThunder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 0.2: Registrar e inyectar el content script en Copilot (spike técnico)

**Files:**
- Modify: `background.js`
- Create: `content-copilot.js`

**Interfaces:**
- Produces: confirmación de que `content-copilot.js` se inyecta en la pestaña de Copilot en TB 140, y el mecanismo (`scripting.registerContentScripts` o `contentScripts.register`) que funciona.

- [ ] **Step 1: `content-copilot.js` que solo se anuncia**

```javascript
"use strict";
console.log("[CoThunder] content script activo en", location.href);
```

- [ ] **Step 2: Registrar el content script desde el background al arrancar**

Intento A (API scripting MV3). Añadir a `background.js`:
```javascript
const COPILOT_MATCHES = ["*://m365.cloud.microsoft/*", "*://*.cloud.microsoft/*"];

async function registerCopilotScript() {
  try {
    const existing = await messenger.scripting.getRegisteredContentScripts({ ids: ["copilot"] });
    if (existing.length) return;
    await messenger.scripting.registerContentScripts([{
      id: "copilot",
      matches: COPILOT_MATCHES,
      js: ["content-copilot.js"],
      runAt: "document_idle"
    }]);
    console.log("[CoThunder] content script registrado (scripting)");
  } catch (e) {
    console.error("[CoThunder] scripting.registerContentScripts falló:", e);
  }
}
registerCopilotScript();
```

- [ ] **Step 3: Probar inyección en Thunderbird**

Recargar el complemento temporal. Abrir una pestaña en Thunderbird con la URL del chat de M365 Copilot (menú de una carpeta/mensaje no aplica; usar `messenger.tabs.create` desde la consola del background o abrir manualmente una pestaña de contenido). Iniciar sesión si hace falta. Revisar la consola de esa pestaña.
Expected: aparece `[CoThunder] content script activo en ...`. Si NO aparece y el registro dio error, pasar al Step 4 (intento B).

- [ ] **Step 4: Fallback — `contentScripts.register` (si el intento A falla)**

Sustituir el cuerpo de `registerCopilotScript` por:
```javascript
async function registerCopilotScript() {
  try {
    await messenger.contentScripts.register({
      matches: COPILOT_MATCHES,
      js: [{ file: "content-copilot.js" }],
      runAt: "document_idle"
    });
    console.log("[CoThunder] content script registrado (contentScripts)");
  } catch (e) {
    console.error("[CoThunder] contentScripts.register falló:", e);
  }
}
```
Repetir el Step 3.

- [ ] **Step 5: PUERTA DE DECISIÓN**

Si tras A y B el content script no se inyecta en Copilot en TB 140: **DETENER el plan**. Documentar el error en `spec/docs/ESPECIFICACION.md` §15.1 y abrir la decisión de migrar a MV2 (que soporta `content_scripts` declarativo) con el usuario. No continuar con el resto de tareas.
Si se inyecta: anotar en el commit qué API funcionó y continuar.

- [ ] **Step 6: Commit**

```bash
git add background.js content-copilot.js
git commit -m "Registra el content script de Copilot en runtime (MV3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 0.3: Escribir y enviar un texto fijo en el chat de Copilot (spike + captura de selectores)

**Files:**
- Modify: `content-copilot.js`

**Interfaces:**
- Produces: el objeto `SELECTORS` real (editor, botón enviar, control "nuevo chat", contenedor de respuestas) y la técnica de escritura que Copilot registra. Consumido por las Tasks de Fase 1/2.

- [ ] **Step 1: Inspeccionar el DOM de Copilot y rellenar `SELECTORS`**

En la pestaña de Copilot logueada, con las devtools, identificar los selectores reales del editor de entrada (`contenteditable`), el botón de enviar, el control de "nuevo chat" y el contenedor del último mensaje del asistente. Escribir al principio de `content-copilot.js`:
```javascript
"use strict";
const SELECTORS = {
  editor: "<selector real del contenteditable de entrada>",
  sendButton: "<selector real del botón enviar>",
  newChat: "<selector real de 'nuevo chat'>",
  assistantMessage: "<selector real del contenedor de respuesta del asistente>"
};
```
Nota: son valores descubiertos aquí; no inventarlos antes de mirar el DOM real.

- [ ] **Step 2: Función de escritura que Copilot registre**

```javascript
function typeIntoEditor(text) {
  const el = document.querySelector(SELECTORS.editor);
  if (!el) return false;
  el.focus();
  // Preferir execCommand insertText: dispara los eventos de input que el editor escucha.
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
  return true;
}
```

- [ ] **Step 3: Función de envío**

```javascript
function clickSend() {
  const btn = document.querySelector(SELECTORS.sendButton);
  if (!btn) return false;
  btn.click();
  return true;
}
```

- [ ] **Step 4: Disparador temporal para probar desde la consola**

Añadir al final, de forma temporal:
```javascript
messenger.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "spikeSend") {
    const wrote = typeIntoEditor("Hola desde CoThunder");
    const sent = wrote && clickSend();
    return Promise.resolve({ wrote, sent });
  }
});
```

- [ ] **Step 5: Prueba manual en Thunderbird**

Con la pestaña de Copilot abierta y logueada, desde la consola del background enviar el mensaje al content script (usando el id de esa pestaña):
```javascript
messenger.tabs.query({}).then(ts => console.log(ts.map(t => [t.id, t.url])));
// tomar el id de la pestaña de Copilot y:
messenger.tabs.sendMessage(<id>, { type: "spikeSend" }).then(console.log);
```
Expected: en Copilot aparece escrito "Hola desde CoThunder" y se envía; la respuesta del `sendMessage` es `{ wrote: true, sent: true }`. Si `wrote` es true pero `sent` false, ajustar `SELECTORS.sendButton` (o probar Enter). Iterar hasta que funcione.

- [ ] **Step 6: Commit (cierre del spike)**

```bash
git add content-copilot.js
git commit -m "Escribe y envía texto en el chat de Copilot (spike verde)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Tras este commit el enfoque está validado; retirar el disparador `spikeSend` se hará al integrar la Fase 1.

---

## FASE 1 — Envío del correo a Copilot

### Task 1.1: Configuración y utilidades compartidas (`common.js`)

**Files:**
- Modify: `common.js`

**Interfaces:**
- Produces:
  - `DEFAULTS` (objeto con `copilotUrl`, `promptTemplate`, `newChatByDefault`).
  - `getConfig(): Promise<object>` → `messenger.storage.local.get(DEFAULTS)`.
  - `buildPrompt(message, body, template): string` (sustituye `{{author}}`, `{{subject}}`, `{{body}}`).
  - `matchPatternFromUrl(url): string` → patrón de host para el registro del content script.

- [ ] **Step 1: Definir DEFAULTS y getConfig**

```javascript
"use strict";

const DEFAULT_PROMPT_TEMPLATE =
  "Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje. " +
  "Responde solo con el cuerpo del correo, sin asunto ni explicaciones.\n\n" +
  "De: {{author}}\nAsunto: {{subject}}\n\n{{body}}";

const DEFAULTS = {
  copilotUrl: "https://m365.cloud.microsoft/chat",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  newChatByDefault: true
};

function getConfig() {
  return messenger.storage.local.get(DEFAULTS);
}
```
Nota: el valor de `copilotUrl` por defecto se fija al que el spike (Task 0.2/0.3) confirmó como URL real del chat.

- [ ] **Step 2: buildPrompt**

```javascript
function buildPrompt(message, body, template) {
  return template
    .replaceAll("{{author}}", message.author || "")
    .replaceAll("{{subject}}", message.subject || "")
    .replaceAll("{{body}}", body || "");
}
```

- [ ] **Step 3: matchPatternFromUrl**

```javascript
function matchPatternFromUrl(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}
```

- [ ] **Step 4: Validación**

Run:
```bash
node --check common.js && echo "common.js OK"
node -e "global.messenger={storage:{local:{get:async d=>d}}};" # smoke: sintaxis cargable
```
Expected: `common.js OK`.

- [ ] **Step 5: Commit**

```bash
git add common.js
git commit -m "Añade configuración y utilidades compartidas en common.js

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Extracción del cuerpo del correo (`common.js`)

**Files:**
- Modify: `common.js`

**Interfaces:**
- Produces: `extractBody(messageId): Promise<string>` — texto plano del correo, HTML convertido con `DOMParser`, truncado a ~12000 chars con marca "[correo truncado]".

- [ ] **Step 1: Implementar extractBody**

```javascript
const MAX_BODY = 12000;

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head").forEach(n => n.remove());
  return (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim();
}

function findPart(part, type) {
  if (part.contentType && part.contentType.startsWith(type) && part.body) return part.body;
  if (part.parts) for (const p of part.parts) { const r = findPart(p, type); if (r) return r; }
  return "";
}

async function extractBody(messageId) {
  const full = await messenger.messages.getFull(messageId);
  let text = findPart(full, "text/plain");
  if (!text) { const html = findPart(full, "text/html"); if (html) text = htmlToText(html); }
  text = (text || "").trim();
  if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + "\n[correo truncado]";
  return text;
}
```

- [ ] **Step 2: Validación**

Run: `node --check common.js && echo OK`
Expected: `OK`. (La lógica de `DOMParser`/`messenger` se prueba en Thunderbird en la Task 1.5.)

- [ ] **Step 3: Commit**

```bash
git add common.js
git commit -m "Extrae el cuerpo textual del correo con conversión HTML

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Content script definitivo (`content-copilot.js`)

**Files:**
- Modify: `content-copilot.js`

**Interfaces:**
- Consumes: `SELECTORS`, `typeIntoEditor`, `clickSend` (de la Fase 0).
- Produces: listener `runtime.onMessage` que atiende `{ type: "sendPrompt", prompt, newChat }` → `{ ok, reason? }`; función `startNewChat()`.

- [ ] **Step 1: startNewChat**

```javascript
async function startNewChat() {
  const btn = document.querySelector(SELECTORS.newChat);
  if (!btn) return false;
  btn.click();
  await new Promise(r => setTimeout(r, 600));
  return true;
}
```

- [ ] **Step 2: Listener sendPrompt (sustituye el disparador `spikeSend`)**

```javascript
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "sendPrompt") return;
  if (msg.newChat) await startNewChat();
  if (!typeIntoEditor(msg.prompt)) return { ok: false, reason: "no-editor" };
  await new Promise(r => setTimeout(r, 100));
  if (!clickSend()) return { ok: false, reason: "no-send" };
  return { ok: true };
});
```
Retirar el listener temporal `spikeSend` de la Task 0.3.

- [ ] **Step 3: Validación**

Run: `node --check content-copilot.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add content-copilot.js
git commit -m "Atiende sendPrompt en el content script con nuevo chat opcional

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Ventana única de Copilot y puente en el background (`background.js`)

**Files:**
- Modify: `background.js`

**Interfaces:**
- Consumes: `getConfig`, `matchPatternFromUrl` (common.js); `sendPrompt` del content script.
- Produces: listener `runtime.onMessage` que atiende `{ type: "sendToCopilot", prompt, newChat }` desde el popup → `{ ok, reason? }`. Gestiona `ensureCopilotTab()` y `deliverWithRetry()`.

- [ ] **Step 1: Registro del content script desde la config**

Reemplazar `COPILOT_MATCHES` fijo por el patrón derivado de `copilotUrl`:
```javascript
async function registerCopilotScript() {
  const { copilotUrl } = await getConfig();
  const match = matchPatternFromUrl(copilotUrl);
  try {
    await messenger.scripting.unregisterContentScripts({ ids: ["copilot"] }).catch(() => {});
    await messenger.scripting.registerContentScripts([{
      id: "copilot", matches: [match], js: ["content-copilot.js"], runAt: "document_idle"
    }]);
  } catch (e) {
    console.error("[CoThunder] registro content script:", e);
  }
}
registerCopilotScript();
messenger.storage.onChanged.addListener(registerCopilotScript);
```
Nota: si en la Fase 0 funcionó `contentScripts.register` y no `scripting`, usar esa variante aquí.

- [ ] **Step 2: ensureCopilotTab (ventana única, estado en storage.session)**

```javascript
async function ensureCopilotTab() {
  const { copilotUrl } = await getConfig();
  const { copilotTabId } = await messenger.storage.session.get({ copilotTabId: null });
  if (copilotTabId != null) {
    try { const t = await messenger.tabs.get(copilotTabId); await messenger.windows.update(t.windowId, { focused: true }); return copilotTabId; }
    catch (_) { /* pestaña cerrada, recrear */ }
  }
  const win = await messenger.windows.create({ type: "popup", url: copilotUrl, width: 480, height: 900 });
  const tabId = win.tabs[0].id;
  await messenger.storage.session.set({ copilotTabId: tabId });
  return tabId;
}
```
Nota: si el spike §8.1 mostró que la ventana `popup` no aloja content scripts, sustituir por `messenger.tabs.create({ url: copilotUrl })` y guardar ese `tab.id`.

- [ ] **Step 3: deliverWithRetry (handshake con la SPA)**

```javascript
async function deliverWithRetry(tabId, payload, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await messenger.tabs.sendMessage(tabId, payload);
      if (res) return res;
    } catch (_) { /* content script aún no listo */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, reason: "timeout" };
}
```

- [ ] **Step 4: Listener sendToCopilot**

```javascript
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "sendToCopilot") return;
  const tabId = await ensureCopilotTab();
  return deliverWithRetry(tabId, { type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat });
});
```

- [ ] **Step 5: Validación**

Run: `node --check background.js && echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add background.js
git commit -m "Gestiona ventana única de Copilot y puente popup-content

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.5: Popup del botón (`popup/`)

**Files:**
- Create: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`
- Modify: `manifest.json` (`message_display_action.default_popup`)

**Interfaces:**
- Consumes: `extractBody`, `buildPrompt`, `getConfig` (common.js, cargado en el popup); `sendToCopilot` (background).

- [ ] **Step 1: Añadir default_popup al manifest**

En `manifest.json`, `message_display_action`:
```json
"message_display_action": { "default_title": "Preguntar a Copilot", "default_popup": "popup/popup.html" }
```

- [ ] **Step 2: popup.html**

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
<body>
  <div id="status"><span id="dot"></span><span id="statusText">Preparando…</span></div>
  <textarea id="prompt" rows="12"></textarea>
  <label><input type="checkbox" id="newChat"> Empezar chat nuevo</label>
  <button id="send" disabled>Enviar a Copilot</button>
  <script src="../common.js"></script>
  <script src="popup.js"></script>
</body></html>
```

- [ ] **Step 3: popup.css**

```css
:root { color-scheme: light dark; }
body { width: 420px; margin: 0; padding: 10px; font: 13px system-ui; }
#status { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
#dot { width: 10px; height: 10px; border-radius: 50%; background: #888; }
#dot.busy { background: #e5a50a; } #dot.ok { background: #26a269; } #dot.err { background: #c01c28; }
textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 180px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 6px; padding: 6px; }
label { display: block; margin: 8px 0; }
button { width: 100%; padding: 8px; border: 0; border-radius: 6px; background: #1a5fb4; color: #fff; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
```

- [ ] **Step 4: popup.js**

```javascript
"use strict";
(async () => {
  const $ = id => document.getElementById(id);
  const setStatus = (cls, text) => { $("dot").className = cls; $("statusText").textContent = text; };
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
  if (!message) { setStatus("err", "No hay ningún correo abierto en esta pestaña"); return; }

  const cfg = await getConfig();
  const body = await extractBody(message.id);
  $("prompt").value = buildPrompt(message, body, cfg.promptTemplate);
  $("newChat").checked = cfg.newChatByDefault;
  setStatus("", "Listo");
  $("send").disabled = false;

  $("send").addEventListener("click", async () => {
    $("send").disabled = true;
    setStatus("busy", "Enviando a Copilot…");
    const res = await messenger.runtime.sendMessage({
      type: "sendToCopilot", prompt: $("prompt").value, newChat: $("newChat").checked
    });
    if (res && res.ok) { setStatus("ok", "Enviado"); setTimeout(() => window.close(), 700); }
    else { setStatus("err", "Error: " + ((res && res.reason) || "desconocido")); $("send").disabled = false; }
  });
})();
```

- [ ] **Step 5: Validación**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"
node --check popup/popup.js && echo OK
```
Expected: `manifest OK`, `OK`.

- [ ] **Step 6: Prueba manual en Thunderbird (extremo a extremo, Fase 1)**

Recargar el complemento. Abrir un correo, pulsar "Preguntar a Copilot": el popup muestra el prompt montado con remitente/asunto/cuerpo. Marcar/desmarcar "Empezar chat nuevo". Pulsar "Enviar a Copilot": se abre/enfoca la ventana de Copilot, se escribe el prompt y se envía; el popup pasa a "Enviado". Probar también un correo solo-HTML (texto limpio) y una pestaña sin correo (mensaje de error).
Expected: los criterios de aceptación 2, 3, 4, 5 del spec §14.

- [ ] **Step 7: Commit**

```bash
git add popup/ manifest.json
git commit -m "Añade el popup del botón que monta y envía el prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.6: Degradación al portapapeles

**Files:**
- Modify: `content-copilot.js`, `background.js`, `popup/popup.js`

**Interfaces:**
- Consumes: la razón de fallo (`no-editor`/`no-send`/`timeout`).
- Produces: cuando la automatización falla, el prompt acaba en el portapapeles y el popup lo avisa.

- [ ] **Step 1: Copiar al portapapeles en el popup cuando hay fallo**

En `popup.js`, en la rama de error del click:
```javascript
else {
  try { await navigator.clipboard.writeText($("prompt").value); } catch (_) {}
  setStatus("err", "No se pudo escribir en Copilot; prompt copiado al portapapeles, pégalo a mano");
  $("send").disabled = false;
}
```

- [ ] **Step 2: Validación**

Run: `node --check popup/popup.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Prueba manual**

Forzar un fallo temporal (p. ej. estropear `SELECTORS.editor`), recargar, enviar: debe copiar el prompt al portapapeles y mostrar el aviso. Restaurar el selector.
Expected: criterio de aceptación 6 del spec §14. Sin fallo silencioso.

- [ ] **Step 4: Commit**

```bash
git add popup/popup.js content-copilot.js background.js
git commit -m "Degrada al portapapeles si la automatización de Copilot falla

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.7: Página de opciones (`options/`)

**Files:**
- Create: `options/options.html`, `options/options.js`
- Modify: `manifest.json` (`options_ui`)

**Interfaces:**
- Consumes: `getConfig`, `DEFAULTS` (common.js).
- Produces: persistencia de `copilotUrl`, `promptTemplate`, `newChatByDefault` en `storage.local`.

- [ ] **Step 1: options_ui en el manifest**

```json
"options_ui": { "page": "options/options.html", "open_in_tab": false }
```

- [ ] **Step 2: options.html**

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head><body style="font:13px system-ui;max-width:560px;padding:10px">
  <label>URL del chat de Copilot<br><input id="copilotUrl" type="url" style="width:100%"></label>
  <p><label>Plantilla del prompt<br><textarea id="promptTemplate" rows="8" style="width:100%"></textarea></label></p>
  <label><input id="newChatByDefault" type="checkbox"> Empezar chat nuevo por defecto</label>
  <p><button id="save">Guardar</button> <span id="saved"></span></p>
  <script src="../common.js"></script>
  <script src="options.js"></script>
</body></html>
```

- [ ] **Step 3: options.js**

```javascript
"use strict";
(async () => {
  const $ = id => document.getElementById(id);
  const cfg = await getConfig();
  $("copilotUrl").value = cfg.copilotUrl;
  $("promptTemplate").value = cfg.promptTemplate;
  $("newChatByDefault").checked = cfg.newChatByDefault;
  $("save").addEventListener("click", async () => {
    await messenger.storage.local.set({
      copilotUrl: $("copilotUrl").value.trim(),
      promptTemplate: $("promptTemplate").value,
      newChatByDefault: $("newChatByDefault").checked
    });
    $("saved").textContent = "Guardado";
    setTimeout(() => { $("saved").textContent = ""; }, 2000);
  });
})();
```

- [ ] **Step 4: Validación**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"
node --check options/options.js && echo OK
```
Expected: `manifest OK`, `OK`.

- [ ] **Step 5: Prueba manual**

Abrir opciones desde el gestor de complementos, cambiar la URL de Copilot y la plantilla, Guardar (aparece "Guardado"). Reabrir: persisten. Cambiar la URL debe re-registrar el content script (Task 1.4 Step 1) — verificar en consola del background.
Expected: valores persistidos; sin errores.

- [ ] **Step 6: Aplicar skill de revisión y commit**

Aplicar `revision-mailextension` sobre todo el código. Corregir lo que marque. Luego:
```bash
git add options/ manifest.json
git commit -m "Añade página de opciones (URL, plantilla, chat nuevo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FASE 2 — Traer la respuesta a composición

### Task 2.1: Capturar el fin de la respuesta en el content script

**Files:**
- Modify: `content-copilot.js`

**Interfaces:**
- Consumes: `SELECTORS.assistantMessage`.
- Produces: tras enviar, cuando la respuesta deja de crecer, emite al background `{ type: "copilotReply", text }`.

- [ ] **Step 1: Observar el fin del streaming**

```javascript
function waitForReply(timeoutMs = 90000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let lastText = "", stableSince = Date.now();
    const tick = setInterval(() => {
      const nodes = document.querySelectorAll(SELECTORS.assistantMessage);
      const el = nodes[nodes.length - 1];
      const text = el ? el.textContent.trim() : "";
      if (text && text === lastText) {
        if (Date.now() - stableSince > 1500) { clearInterval(tick); resolve(text); }
      } else { lastText = text; stableSince = Date.now(); }
      if (Date.now() - start > timeoutMs) { clearInterval(tick); resolve(lastText); }
    }, 500);
  });
}
```

- [ ] **Step 2: Emitir la respuesta tras enviar**

En el listener `sendPrompt`, tras `clickSend()` correcto:
```javascript
  waitForReply().then(text => {
    if (text) messenger.runtime.sendMessage({ type: "copilotReply", text });
  });
  return { ok: true };
```

- [ ] **Step 3: Validación**

Run: `node --check content-copilot.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add content-copilot.js
git commit -m "Captura la respuesta de Copilot al terminar el streaming

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Abrir composición con la respuesta (`background.js`)

**Files:**
- Modify: `background.js`

**Interfaces:**
- Consumes: `copilotReply` del content script; el `messageId` de origen (persistido al enviar).

- [ ] **Step 1: Recordar el messageId de origen al enviar**

En el listener `sendToCopilot`, antes de entregar:
```javascript
  await messenger.storage.session.set({ pendingMessageId: msg.messageId });
```
Y en `popup.js` añadir `messageId: message.id` al `sendMessage` de `sendToCopilot`.

- [ ] **Step 2: Abrir beginReply al recibir copilotReply**

```javascript
messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "copilotReply") return;
  const { pendingMessageId } = await messenger.storage.session.get({ pendingMessageId: null });
  if (pendingMessageId == null) return;
  await messenger.compose.beginReply(pendingMessageId, "replyToSender", {
    plainTextBody: msg.text, isPlainText: true
  });
  await messenger.storage.session.set({ pendingMessageId: null });
});
```

- [ ] **Step 3: Validación**

Run: `node --check background.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Prueba manual (extremo a extremo, Fase 2)**

Abrir un correo, enviar a Copilot, esperar la respuesta: al terminar, se abre una ventana de composición en texto plano dirigida al remitente con el texto de Copilot.
Expected: criterio de aceptación 7 del spec §14.

- [ ] **Step 5: Aplicar skill de revisión y commit**

Aplicar `revision-mailextension`. Corregir. Luego:
```bash
git add background.js popup/popup.js
git commit -m "Abre composición con la respuesta capturada de Copilot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Cierre — Empaquetado

- [ ] Aplicar la skill `empaquetado-xpi` (incluye `content-copilot.js` en la validación). Genera `cothunder-2.0.0.xpi`, verifica el contenido y reporta ruta/tamaño.

## Notas de verificación del plan (autorrevisión)

- Cobertura del spec: §5 config → Task 1.1; §6 extractBody → Task 1.2; §7 buildPrompt → Task 1.1; §8 background/registro/ventana/handshake → Tasks 0.2, 1.4; §8.1 ventana → Task 1.4 Step 2 (con fallback a pestaña); §9 content script/SELECTORS → Tasks 0.3, 1.3; §10 popup → Task 1.5; §11 compose fase 2 → Task 2.2; §12 degradación portapapeles → Task 1.6; opciones (§10 config) → Task 1.7; §15.1 spike bloqueante → Fase 0. Criterios de aceptación §14: 1 (Task 0.1), 2–5 (Task 1.5), 6 (Task 1.6), 7 (Task 2.2).
- Consistencia de tipos: mensajes entre componentes: popup→background `sendToCopilot {prompt,newChat,messageId}`; background→content `sendPrompt {prompt,newChat}`; content→background `copilotReply {text}`. `getConfig`/`buildPrompt`/`extractBody`/`matchPatternFromUrl` definidos en Task 1.1/1.2 y usados en 1.4/1.5.
- Selectores de Copilot: deliberadamente no fijados hasta la Task 0.3 (salen del DOM real). Es la única parte "por descubrir"; el resto es código concreto.

# Crear desde Copilot — Fase 1 (v2.3) — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea a tarea. Los pasos usan checkbox (`- [ ]`).

**Objetivo:** Añadir un botón "Crear desde Copilot" en la barra principal de Thunderbird que abre el popup en modo creación y genera un correo nuevo (asunto + cuerpo) desde cero, reutilizando toda la tubería de Copilot.

**Arquitectura:** Un segundo botón (`action`) abre `popup/popup.html?mode=create`. El popup detecta el modo por la URL, muestra campos de creación (qué crear, contexto/destinatario, idioma) y oculta los de respuesta (citado/hilo). `buildCreatePrompt` monta un prompt que pide `Asunto:` + cuerpo Markdown; el background separa asunto y cuerpo y abre `compose.beginNew`. El content script (`content-copilot.js`) no cambia: el `messageId` se reutiliza como token de correlación genérico (un `requestId` en creación).

**Tech stack:** JavaScript vanilla (`"use strict"`), WebExtensions de Thunderbird (`messenger.*`), Manifest V3. Sin frameworks ni dependencias. Node solo para validación.

## Restricciones globales (de CLAUDE.md y spec §19)

- Manifest V3; API siempre vía `messenger` (nunca `browser`/`chrome`).
- Sin permisos nuevos: `action` no lleva permiso propio; `compose` (para `beginNew`) ya está declarado.
- Textos de UI en español; código y variables en inglés.
- Sin `eval`/`new Function`/`innerHTML` con contenido remoto; HTML solo con `DOMParser`.
- Toda dependencia del DOM de Copilot vive en `content-copilot.js` (aquí NO se toca).
- El flujo de datos no cambia: el contenido solo viaja a M365 Copilot.
- Coherencia con la spec: el diseño está en `spec/docs/ESPECIFICACION.md` §19. Si la implementación refina algo, actualizar §19 en el mismo commit.

**Nota de proceso:** el proyecto no tiene framework de tests. Para lógica pura (Tarea 1) se validan con aserciones `node -e`. Para el resto (APIs WebExtension y DOM) la verificación es `node --check` + validación del manifest + una **lista de prueba manual en Thunderbird** (no hay forma de test automatizado sin TB).

---

### Tarea 1: Lógica de creación en `common.js` (pura, testeable)

**Files:**
- Modify: `common.js` (añadir constantes y funciones cerca de `buildComposedPrompt`)
- Test: aserciones inline con `node -e`

**Interfaces:**
- Produce: `MARKDOWN_INSTRUCTION_CREATE` (const), `buildCreatePrompt(opts)` → `string`, `parseCreateReply(text)` → `{ subject, body }`.
- Consume: `INJECTION_GUARD`, `SECTION_SEP`, `MARKDOWN_STYLE`, `toneLengthInstruction`, `buildPrompt` ya existentes.

`buildCreatePrompt(opts)` donde `opts = { promptBody, formatBody, tone, length, brief, context, language }`. Orden de bloques (unidos con `SECTION_SEP`):
1. Guarda anti-inyección ligera (solo si `context`/`brief` pudieran traer texto pegado): reutiliza `INJECTION_GUARD` pero con nota de que aquí el contenido es del propio usuario. Para mantenerlo simple se antepone `INJECTION_GUARD` igual que en respuesta.
2. Prompt prioritario del usuario (si `promptBody`).
3. Instrucción de creación (idioma + contexto + qué crear).
4. Formato de referencia (si `formatBody`) — mismo texto que `buildComposedPrompt`.
5. Tono/longitud (`toneLengthInstruction`).
6. `MARKDOWN_INSTRUCTION_CREATE`.
7. `MARKDOWN_STYLE`.

- [ ] **Paso 1: Escribir las aserciones (test) primero**

Crear `scratch-test-create.js` en la raíz (temporal, se borra al final):

```js
"use strict";
// Copias mínimas de las dependencias para poder testear en Node sin `messenger`.
const INJECTION_GUARD = "GUARD";
const SECTION_SEP = "\n\n---SEP---\n\n";
const MARKDOWN_STYLE = "STYLE";
function toneLengthInstruction(t, l) { return [t, l].filter(Boolean).join(" "); }
function buildPrompt() { return "BASE"; } // no se usa en creación

// >>> Pegar aquí las funciones reales de common.js para la prueba <<<
const MARKDOWN_INSTRUCTION_CREATE =
  "IMPORTANTE: empieza tu respuesta con una única línea que comience por \"Asunto: \" y un asunto breve; " +
  "después deja una línea en blanco y devuelve el cuerpo del correo como código fuente Markdown SIN RENDERIZAR " +
  "dentro de un único bloque de código que empiece por ```markdown y termine con ```, sin explicaciones.";
const LANGS = { es: "Escribe el correo en español.", en: "Write the email in English.", fr: "Écris l'e-mail en français.", de: "Schreibe die E-Mail auf Deutsch." };
function buildCreateBase(o) {
  const lines = ["Redacta un correo nuevo (no una respuesta) desde cero con estas indicaciones."];
  if (LANGS[o.language]) lines.push(LANGS[o.language]);
  if (o.context && o.context.trim()) lines.push("Destinatario y contexto: " + o.context.trim());
  lines.push("Qué crear:\n" + (o.brief || "").trim());
  return lines.join("\n\n");
}
function buildCreatePrompt(opts) {
  const o = opts || {};
  const parts = [INJECTION_GUARD];
  if (o.promptBody && o.promptBody.trim()) parts.push("INSTRUCCIÓN PRIORITARIA DEL USUARIO:\n" + o.promptBody.trim());
  parts.push(buildCreateBase(o));
  if (o.formatBody && o.formatBody.trim()) parts.push("FORMATO DE REFERENCIA:\n" + o.formatBody.trim());
  const tl = toneLengthInstruction(o.tone, o.length);
  if (tl) parts.push(tl);
  parts.push(MARKDOWN_INSTRUCTION_CREATE);
  parts.push(MARKDOWN_STYLE);
  return parts.join(SECTION_SEP);
}
function parseCreateReply(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let subject = "";
  const m = t.match(/^\s*asunto:\s*(.+?)\s*$/im);
  if (m) { subject = m[1].trim(); t = t.replace(m[0], "").trim(); }
  t = t.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return { subject, body: t };
}

// Aserciones
const p = buildCreatePrompt({ brief: "Invitar al claustro a la jornada de innovación", context: "Profesorado; tono institucional", language: "es", tone: "formal", length: "normal", formatBody: "# Saludo" });
console.assert(p.includes("Redacta un correo nuevo"), "falta instrucción de creación");
console.assert(p.includes("Escribe el correo en español."), "falta idioma");
console.assert(p.includes("Invitar al claustro"), "falta el brief");
console.assert(p.includes("Asunto:"), "falta instrucción de asunto");
console.assert(p.split("---SEP---").length >= 6, "faltan bloques separados");

const r1 = parseCreateReply("Asunto: Jornada de innovación\n\n```markdown\n# Hola\n\nOs invitamos...\n```");
console.assert(r1.subject === "Jornada de innovación", "asunto mal: " + r1.subject);
console.assert(r1.body.startsWith("# Hola"), "cuerpo mal: " + r1.body);

const r2 = parseCreateReply("```markdown\nAsunto: Reunión\n\nHola equipo\n```");
console.assert(r2.subject === "Reunión", "asunto (dentro de fence) mal: " + r2.subject);
console.assert(r2.body === "Hola equipo", "cuerpo (dentro de fence) mal: " + JSON.stringify(r2.body));

const r3 = parseCreateReply("Hola, sin asunto ni fence");
console.assert(r3.subject === "", "asunto debería estar vacío");
console.assert(r3.body === "Hola, sin asunto ni fence", "cuerpo sin fence mal");

console.log("OK create logic");
```

- [ ] **Paso 2: Ejecutar el test y verificar que pasa con la lógica de referencia**

Run: `node scratch-test-create.js`
Expected: `OK create logic` (sin fallos de assert).

- [ ] **Paso 3: Portar las funciones reales a `common.js`**

En `common.js`, justo después de `MARKDOWN_INSTRUCTION` (y de `INJECTION_GUARD`), añadir:

```js
// Directiva de creación: pide Asunto + cuerpo Markdown (a diferencia de la respuesta, que va "sin asunto").
const MARKDOWN_INSTRUCTION_CREATE =
  "IMPORTANTE: empieza tu respuesta con una única línea que comience por \"Asunto: \" y un asunto breve; " +
  "después deja una línea en blanco y devuelve el cuerpo del correo como código fuente Markdown SIN RENDERIZAR " +
  "dentro de un único bloque de código que empiece por ```markdown y termine con ```, sin explicaciones.";

// Idiomas de salida para el modo creación.
const CREATE_LANGS = {
  es: "Escribe el correo en español.",
  en: "Write the email in English.",
  fr: "Écris l'e-mail en français.",
  de: "Schreibe die E-Mail auf Deutsch."
};
```

Y junto a `buildComposedPrompt` (después de esa función), añadir:

```js
// Instrucción base de creación a partir del brief, el contexto y el idioma.
function buildCreateBase(o) {
  const lines = ["Redacta un correo nuevo (no una respuesta) desde cero con estas indicaciones."];
  if (CREATE_LANGS[o.language]) lines.push(CREATE_LANGS[o.language]);
  if (o.context && o.context.trim()) lines.push("Destinatario y contexto: " + o.context.trim());
  lines.push("Qué crear:\n" + (o.brief || "").trim());
  return lines.join("\n\n");
}

// Monta el prompt de creación: guarda + prompt prioritario + creación + formato + tono/longitud + Markdown (asunto+cuerpo).
function buildCreatePrompt(opts) {
  const o = opts || {};
  const parts = [INJECTION_GUARD];
  if (o.promptBody && o.promptBody.trim()) {
    parts.push("INSTRUCCIÓN PRIORITARIA DEL USUARIO (tiene prioridad sobre el resto de indicaciones):\n" +
      o.promptBody.trim());
  }
  parts.push(buildCreateBase(o));
  if (o.formatBody && o.formatBody.trim()) {
    parts.push("Usa la siguiente plantilla como REFERENCIA de estructura y formato de la respuesta: síguela, " +
      "rellenando sus huecos o marcadores y adaptando su estructura y tono; aprovecha tu conocimiento para " +
      "enriquecerla, sin limitarte a copiarla.\n" +
      "--- FORMATO DE REFERENCIA (Markdown) ---\n" + o.formatBody.trim() + "\n--- FIN FORMATO ---");
  }
  const tl = toneLengthInstruction(o.tone, o.length);
  if (tl) parts.push(tl);
  parts.push(MARKDOWN_INSTRUCTION_CREATE);
  parts.push(MARKDOWN_STYLE);
  return parts.join(SECTION_SEP);
}

// Separa el "Asunto:" del cuerpo Markdown de la respuesta de creación (tolerante a bloques ```markdown```).
function parseCreateReply(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let subject = "";
  const m = t.match(/^\s*asunto:\s*(.+?)\s*$/im);
  if (m) { subject = m[1].trim(); t = t.replace(m[0], "").trim(); }
  t = t.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return { subject, body: t };
}
```

- [ ] **Paso 4: Validar sintaxis y limpiar el test**

Run: `node --check common.js && node scratch-test-create.js && rm scratch-test-create.js`
Expected: sin errores y `OK create logic`.

- [ ] **Paso 5: Commit**

```bash
git add common.js
git commit -m "Añade buildCreatePrompt y parseCreateReply para el modo creación (§19.3)"
```

---

### Tarea 2: Botón `action` y apertura del popup en modo creación

**Files:**
- Modify: `manifest.json` (añadir clave `action`)
- Modify: `background.js` (listener `action.onClicked`, tras el de `messageDisplayAction`)

**Interfaces:**
- Produce: un botón en la barra principal que abre `popup/popup.html?mode=create` en una ventana propia 600×560.

- [ ] **Paso 1: Añadir el botón al manifest**

En `manifest.json`, tras la línea de `message_display_action`, añadir:

```json
  "action": { "default_title": "Crear desde Copilot", "default_icon": "icon.svg" },
```

(Queda antes de `options_ui`. Cuidar la coma.)

- [ ] **Paso 2: Validar el manifest**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"`
Expected: `manifest OK`.

- [ ] **Paso 3: Añadir el listener en `background.js`**

Justo después del bloque `messenger.messageDisplayAction.onClicked.addListener(...)` (línea ~35), añadir:

```js
// El botón de la barra principal abre la UI en modo creación (correo nuevo, sin messageId).
messenger.action.onClicked.addListener(async () => {
  const url = messenger.runtime.getURL("popup/popup.html") + "?mode=create";
  await messenger.windows.create({ url, type: "popup", width: 600, height: 560, allowScriptsToClose: true });
});
```

- [ ] **Paso 4: Validar sintaxis**

Run: `node --check background.js`
Expected: sin salida (OK).

- [ ] **Paso 5: Prueba manual (Thunderbird)**

Cargar la extensión temporal. Verificar: aparece el botón "Crear desde Copilot" en la barra principal; al pulsarlo se abre la ventana del popup (todavía se comportará como respuesta hasta la Tarea 4). No hay errores en la consola del background.

- [ ] **Paso 6: Commit**

```bash
git add manifest.json background.js
git commit -m "Añade el botón 'Crear desde Copilot' (action) que abre el popup en modo creación (§19.1)"
```

---

### Tarea 3: UI del popup en modo creación

**Files:**
- Modify: `popup/popup.html` (campos de creación + clases de modo)
- Modify: `popup/popup.css` (mostrar/ocultar por modo)

**Interfaces:**
- Produce: elementos `#create-brief`, `#create-context`, `#language`, `#recipient` (ocultos salvo en modo creación); clases `.create-only` y `.reply-only` conmutadas por `body.mode-create`.

- [ ] **Paso 1: Marcar como `reply-only` los campos que no aplican en creación**

En `popup/popup.html`, añadir `class="reply-only"` a las etiquetas de "Incluir el correo citado" e "Incluir el hilo":

```html
    <label class="reply-only"><input type="checkbox" id="includeQuote"> Incluir el correo citado</label>
    <label class="reply-only"><input type="checkbox" id="includeThread"> Incluir el hilo (mensajes anteriores)</label>
```

- [ ] **Paso 2: Añadir los campos de creación**

En `popup/popup.html`, justo antes del bloque `<div class="field grow">` del prompt, añadir:

```html
  <div class="field create-only">
    <label for="create-brief">📝 ¿Qué quieres crear?</label>
    <textarea id="create-brief" rows="3" placeholder="Describe el correo que quieres redactar…"></textarea>
  </div>
  <div class="grid2 create-only">
    <div class="field">
      <label for="create-context">👤 Para / contexto</label>
      <input type="text" id="create-context" placeholder="Destinatario, propósito, puntos…">
    </div>
    <div class="field">
      <label for="language">🌐 Idioma</label>
      <select id="language">
        <option value="">Automático</option>
        <option value="es">Español</option>
        <option value="en">Inglés</option>
        <option value="fr">Francés</option>
        <option value="de">Alemán</option>
      </select>
    </div>
  </div>
  <div class="field create-only">
    <label for="recipient">✉️ Destinatario (correo, opcional)</label>
    <input type="email" id="recipient" placeholder="nombre@dominio.com">
  </div>
```

- [ ] **Paso 3: Reglas CSS de conmutación por modo**

En `popup/popup.css`, añadir al final:

```css
/* Conmutación de campos por modo (creación / respuesta). */
.create-only { display: none; }
body.mode-create .reply-only { display: none; }
body.mode-create .create-only { display: flex; }
body.mode-create .grid2.create-only { display: grid; }
input[type="text"], input[type="email"] {
  width: 100%; padding: 5px 6px; font: inherit; color: inherit;
  background: transparent; border: 1px solid var(--border); border-radius: 6px;
}
```

- [ ] **Paso 4: Prueba manual**

Recargar la extensión. En modo respuesta (abrir un correo → "Preguntar a Copilot"): NO aparecen los campos de creación; sí "citado" e "hilo". El popup en modo creación se afina en la Tarea 4 (aún sin clase `mode-create`).

- [ ] **Paso 5: Commit**

```bash
git add popup/popup.html popup/popup.css
git commit -m "Añade los campos de creación al popup y su conmutación por modo (§19.2)"
```

---

### Tarea 4: Lógica del popup en modo creación

**Files:**
- Modify: `popup/popup.js`

**Interfaces:**
- Consume: `buildCreatePrompt` (Tarea 1), elementos de la Tarea 3.
- Produce: envío `sendToCopilot` con `mode:"create"`, `requestId`, `recipient`; sin `messageId`.

- [ ] **Paso 1: Detectar el modo y ramificar la carga**

En `popup/popup.js`, al principio del `try` de init (donde hoy lee `messageId`), añadir la detección de modo y saltar la carga de correo si es creación:

```js
    const params = new URLSearchParams(location.search);
    const mode = params.get("mode") === "create" ? "create" : "reply";
    if (mode === "create") document.body.classList.add("mode-create");
```

En modo creación NO hay `messageId` ni `message`/`body`: envolver la carga del correo (`messages.get`, `extractBody`) en `if (mode === "reply") { … }`. Para creación, dejar `message = null` y `body = ""`.

- [ ] **Paso 2: Ramificar `composePrompt`**

Sustituir `composePrompt` para que use `buildCreatePrompt` en creación:

```js
  const composePrompt = () => mode === "create"
    ? buildCreatePrompt({
        promptBody, formatBody,
        tone: $("tone").value, length: $("length").value,
        brief: $("create-brief").value, context: $("create-context").value, language: $("language").value
      })
    : buildComposedPrompt(message, body, {
        template: cfg.promptTemplate, promptBody, formatBody,
        thread: $("includeThread").checked ? threadBody : null,
        tone: $("tone").value, length: $("length").value
      });
```

- [ ] **Paso 3: Reconstruir el prompt cuando cambian los campos de creación**

Tras registrar los listeners de tono/longitud, añadir (solo si existen, para no romper el modo respuesta):

```js
    ["create-brief", "create-context", "language"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", rebuildPrompt);
    });
```

Y cargar/guardar preferencias de creación por separado (idioma, y reutilizando tono/longitud/firma). Añadir a la lectura de `prefs` las claves `prefLanguage: ""` y aplicar `$("language").value = prefs.prefLanguage;` en modo creación; guardar en el listener de `language`:

```js
    if ($("language")) $("language").addEventListener("change", () => {
      rebuildPrompt(); messenger.storage.local.set({ prefLanguage: $("language").value }).catch(() => {});
    });
```

- [ ] **Paso 4: Saltar el aviso de inyección y el `rebuildPrompt` inicial adaptados**

El escaneo de inyección (`detectInjection(body …)`) y la carga de hilo son solo de respuesta: envolverlos en `if (mode === "reply")`. En creación, tras poblar agentes/plantillas, llamar `rebuildPrompt()` y `setStatus("", "Listo")`.

- [ ] **Paso 5: Enviar en modo creación**

En `doSend`, construir el payload según el modo:

```js
      const base = {
        type: "sendToCopilot", prompt: $("prompt").value,
        newChat: forceNewChat || $("newChat").checked,
        agentId, agentLabel, includeSignature: $("includeSignature").checked
      };
      if (mode === "create") {
        const requestId = "c" + Date.now() + Math.floor(Math.random() * 1e6);
        res = await messenger.runtime.sendMessage({ ...base, mode: "create", requestId, recipient: ($("recipient").value || "").trim() });
      } else {
        res = await messenger.runtime.sendMessage({ ...base, mode: "reply", messageId: message.id, includeQuote: $("includeQuote").checked });
      }
```

(El resto de `doSend` —estado, portapapeles, mostrar Regenerar— no cambia.)

- [ ] **Paso 6: Validar sintaxis**

Run: `node --check popup/popup.js`
Expected: sin salida (OK).

- [ ] **Paso 7: Prueba manual**

Recargar. Pulsar "Crear desde Copilot": aparecen los campos de creación y desaparecen citado/hilo. Escribir un brief → el textarea "Prompt a enviar" se rellena con el prompt compuesto (con bloques y `Asunto:`). El modo respuesta sigue funcionando igual.

- [ ] **Paso 8: Commit**

```bash
git add popup/popup.js
git commit -m "Popup: modo creación (buildCreatePrompt, campos y envío con requestId) (§19.2)"
```

---

### Tarea 5: Composición del correo nuevo en el background

**Files:**
- Modify: `background.js` (rama `sendToCopilot` y rama `copilotReply`)

**Interfaces:**
- Consume: `parseCreateReply` (Tarea 1), payload de la Tarea 4.
- Produce: `compose.beginNew({ to, subject, body })` con firma opcional; correlación por token genérico.

- [ ] **Paso 1: Generalizar el token en `sendToCopilot`**

Sustituir el guardado de opciones y la entrega (líneas ~94-105) por una versión con token genérico y `mode`:

```js
      const token = msg.messageId != null ? String(msg.messageId) : msg.requestId;
      await messenger.storage.session.set({
        ["opts_" + token]: {
          mode: msg.mode || "reply",
          includeSignature: msg.includeSignature !== false,
          includeQuote: !!msg.includeQuote,
          recipient: (msg.recipient || "").trim()
        }
      });
      const tabId = await ensureCopilotTab();
      return await deliverWithRetry(tabId, {
        type: "sendPrompt", prompt: msg.prompt, newChat: msg.newChat,
        agentId: msg.agentId, agentLabel: msg.agentLabel, messageId: token
      });
```

(El content script sigue recibiendo `messageId` = token y lo devuelve igual: `content-copilot.js` no cambia.)

- [ ] **Paso 2: Ramificar `copilotReply` por modo**

En la rama `copilotReply`, tras recuperar `opts` (línea ~132), leer el modo y separar el flujo. Reemplazar el bloque `try { const tab = await messenger.compose.beginReply(...) … }` por:

```js
    if (opts.mode === "create") {
      try {
        const { subject, body } = parseCreateReply(msg.text);
        const bodyHtml = body
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        const tab = await messenger.compose.beginNew();
        const details = await messenger.compose.getComposeDetails(tab.id);
        let signature = "";
        if (opts.includeSignature) {
          try {
            const identity = details.identityId ? await messenger.identities.get(details.identityId) : null;
            if (identity && identity.signature) {
              signature = "<br><br>" + (identity.signatureIsPlainText
                ? identity.signature.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
                : identity.signature);
            }
          } catch (_) {}
        }
        const upd = { body: bodyHtml + signature };
        if (subject) upd.subject = subject;
        if (opts.recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.recipient)) upd.to = [opts.recipient];
        await messenger.compose.setComposeDetails(tab.id, upd);
      } catch (e) {
        console.error("[CoThunder] beginNew falló:", e);
        messenger.notifications.create({
          type: "basic", iconUrl: messenger.runtime.getURL("icon.svg"), title: "CoThunder",
          message: "No se pudo abrir el correo nuevo con el texto de Copilot."
        }).catch(() => {});
      }
      return { ok: true };
    }
    // … (rama de respuesta existente: beginReply) …
```

Nota: `const html = msg.text…` de la parte superior de la rama solo se usa en el flujo de respuesta; dejarlo donde está (no afecta a creación, que usa `bodyHtml`).

- [ ] **Paso 3: Validar sintaxis y arranque del background**

Run: `node --check background.js`
Expected: sin salida (OK).

- [ ] **Paso 4: Prueba manual de extremo a extremo**

Con sesión de Copilot iniciada: "Crear desde Copilot" → escribir brief ("Convocar reunión de coordinación el jueves") + contexto + idioma Español + un destinatario válido → Enviar. Verificar: se pilota Copilot, y al terminar se abre un **correo nuevo** con el **Asunto** relleno, el cuerpo maquetado, la firma (si estaba marcada) y el destinatario en "Para". Probar también sin destinatario y sin firma. Probar "Regenerar".

- [ ] **Paso 5: Commit**

```bash
git add background.js
git commit -m "Background: componer correo nuevo (beginNew) en modo creación con token genérico (§19.4)"
```

---

### Tarea 6: Documentación, versión y revisión final

**Files:**
- Modify: `options/options.html` (ayuda), `CHANGELOG.md`, `manifest.json` (versión), `spec/docs/ESPECIFICACION.md` (marcar §19 como implementado si procede)

- [ ] **Paso 1: Ayuda en Opciones**

En `options/options.html`, en la sección de opciones/uso, añadir un punto sobre el botón "Crear desde Copilot" (barra principal): redacta un correo nuevo desde cero; campos "¿Qué quieres crear?", "Para/contexto", "Idioma" y "Destinatario"; genera asunto y cuerpo.

- [ ] **Paso 2: CHANGELOG**

Añadir una sección `## [2.3.0] — <fecha>` con "Añadido: botón **Crear desde Copilot** en la barra principal (redacta correos nuevos desde cero, con asunto, contexto, idioma y destinatario)".

- [ ] **Paso 3: Subir versión**

En `manifest.json`: `"version": "2.3.0"`. Actualizar en `spec/docs/ESPECIFICACION.md` la línea de versión y quitar el "planificado" de §19.

- [ ] **Paso 4: Revisión (skill)**

Aplicar `revision-mailextension`: `node -e` del manifest, `node --check` de todos los JS, `grep` de `browser./chrome.`, `eval/innerHTML`, URLs hardcodeadas. Corregir cualquier hallazgo.

- [ ] **Paso 5: Empaquetado y release (skill)**

Aplicar `empaquetado-xpi` para validar y generar `cothunder-2.3.0.xpi`. Fusionar `cothunder-v2.3` → `main`, etiquetar `v2.3.0` y empujar la etiqueta (dispara el workflow de release).

- [ ] **Paso 6: Commit de cierre**

```bash
git add options/options.html CHANGELOG.md manifest.json spec/docs/ESPECIFICACION.md
git commit -m "Cerrar v2.3.0: documentación, versión y §19 implementado"
```

---

## Auto-revisión del plan

- **Cobertura de la spec §19:** 19.1 botón/modo (Tarea 2), 19.2 UI (Tareas 3-4), 19.3 prompt (Tarea 1), 19.4 captura/composición (Tarea 5), 19.5 reutilización (transversal, `content-copilot.js` sin tocar). ✅
- **Refinamiento respecto a §19.2:** el plan añade un campo dedicado "¿Qué quieres crear?" y mantiene el textarea "Prompt a enviar" como prompt compuesto editable (en vez de reetiquetar el textarea principal), para conservar el modelo de respuesta y la edición por bloques. Sincronizar §19.2 con este matiz al implementar (Tarea 6, Paso 3).
- **Sin placeholders:** todos los pasos de código llevan el código real. ✅
- **Consistencia de nombres:** `buildCreatePrompt`, `parseCreateReply`, `mode`, `requestId`, `opts_<token>`, clases `create-only`/`reply-only`/`mode-create` usadas igual en todas las tareas. ✅
- **Sin permisos nuevos:** `action` no requiere permiso; `compose` ya está. ✅

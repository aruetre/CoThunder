# Especificación: CoThunder

Extensión MailExtension para Thunderbird 140 o superior. Lee el correo abierto, monta un prompt editable con su contenido y lo envía a la web de **Microsoft 365 Copilot** automatizando el chat con la sesión que el usuario ya tiene iniciada. No usa ninguna API ni clave: pilota la interfaz web de Copilot mediante un content script.

Versión de esta especificación: 2.3.0. Corresponde a la versión 2.3.0 de la extensión. La 1.x se basaba en llamadas directas a una API compatible OpenAI/Azure; se sustituyó por completo por automatización de Copilot web al no disponer de acceso a API. La 2.1 añadió selección de agente, plantillas de Thunderbird, respuesta maquetada en Markdown y una ventana de UI redimensionable (ver §17). La 2.2 separa Prompts y Formatos, añade tono/longitud, firma/cita/hilo, blindaje anti-inyección, una biblioteca de plantillas sembrada al instalar y un rediseño de la ventana (ver §18, novedades v2.2). La 2.3 añade el botón "Crear desde Copilot" para redactar correos nuevos desde cero (ver §19).

Plataforma objetivo: Thunderbird ESR 140 (probado en 140.11.1), **Manifest V3**. Decisión explícita del proyecto; ver §2 y el riesgo asociado en §15.

## 1. Alcance

Qué hace:

- Para el correo mostrado, monta un prompt (instrucción + remitente + asunto + cuerpo) que el usuario puede editar antes de enviar, en una **ventana propia redimensionable** que abre el botón del visor.
- Permite elegir un **agente** de Copilot (además de Copilot por defecto) y una **plantilla** de las carpetas de Plantillas de Thunderbird (§17).
- Abre Microsoft 365 Copilot dentro de Thunderbird, escribe el prompt y lo envía, seleccionando antes el agente elegido y opcionalmente empezando un chat nuevo.
- Captura la respuesta de Copilot y abre una ventana de composición HTML con ella como respuesta al remitente, **maquetada en Markdown** (§17).

Qué no hace:

- No usa ninguna API ni clave. No hay endpoints, ni Azure, ni tokens.
- No envía correos automáticamente. La decisión final es siempre del usuario.
- No inicia sesión por ti. Reutiliza la sesión de Copilot ya iniciada en el perfil de Thunderbird; la primera vez puede requerir login manual.
- No incrusta Copilot en un iframe: Microsoft lo bloquea con `X-Frame-Options`/CSP. Por eso se usa una ventana/pestaña propia con content script, no un iframe.
- No soporta adjuntos ni imágenes: solo el cuerpo textual del mensaje.

## 2. Requisitos de plataforma

- Thunderbird ESR 140.0 o superior. `strict_min_version: "140.0"`.
- **Manifest V3** con bloque `browser_specific_settings.gecko` (no `applications`, deprecado y con advertencia en MV3), id `cothunder@local`.
- API WebExtension de Thunderbird via el objeto global `messenger`.
- Background como **event page** (`background: { scripts: [...] }`; Thunderbird/Firefox usan event pages en MV3, no service workers). En MV3 el background es no persistente por definición: **no declarar `persistent`** (da advertencia). Consecuencia: el estado en memoria (p. ej. el id de la ventana de Copilot) puede perderse cuando el background se descarga; hay que persistirlo (`storage.session`/`storage.local`) y reconstruirlo.
- **Registro del content script en runtime**, no declarativo: en MV3 no existe el key `content_scripts`. Se registra desde el background con la API de scripting disponible en la plataforma (`scripting.registerContentScripts` o, en su defecto, `contentScripts.register`). Requiere el permiso correspondiente (`scripting`) y el host permission de Copilot. **A validar en el spike (§15.1).**
- Permisos: `accountsRead` (carpetas/plantillas), `messagesRead`, `compose`, `storage`, `scripting`, `notifications` (aviso si falla la captura), y `host_permissions` con el dominio de Microsoft 365 Copilot (no `<all_urls>`: el destino es un dominio fijo y configurable). En MV3 `host_permissions` es un key separado de `permissions`.
- El content script solo actúa sobre páginas cargadas en **pestañas**; Copilot debe abrirse como pestaña o como ventana que aloje una pestaña web (ver §8.1).
- JavaScript vanilla, `"use strict"` en todos los ficheros. Sin dependencias externas en runtime.

## 3. Estructura de ficheros

```
manifest.json
common.js
background.js
content-copilot.js
icon.svg
popup/
  popup.html
  popup.css
  popup.js
options/
  options.html
  options.js
```

`common.js` se carga en el background (via `background.scripts`) y en el popup (via `<script src="../common.js">`), de modo que la configuración, la extracción del cuerpo y la construcción del prompt existen una sola vez. `content-copilot.js` se inyecta únicamente en el dominio de Copilot via `content_scripts`.

## 4. manifest.json

- `manifest_version`: 3
- `name`: "CoThunder"
- `description`: descripción breve en español del comportamiento.
- `version`: SemVer, empieza en "2.0.0".
- `browser_specific_settings.gecko`: id `cothunder@local`, `strict_min_version: "140.0"`.
- `background`: `{ "scripts": ["common.js", "background.js"] }` (event page; sin `persistent` en MV3).
- `message_display_action`: botón en la barra del visor de mensajes. `default_title` "Preguntar a Copilot", `default_popup` "popup/popup.html".
- `permissions`: `["messagesRead", "compose", "storage", "scripting"]`.
- `host_permissions`: `[<patrón del dominio de M365 Copilot>]` (key separado en MV3).
- `options_ui`: `options/options.html`, `open_in_tab: false`.
- `icons`: 32 y 64 apuntando a `icon.svg`.

**Sin key `content_scripts`** (no existe en MV3). El content script `content-copilot.js` se registra en runtime desde el background (§8), con `matches` al dominio de Copilot. Como Microsoft cambia esas URLs, el patrón por defecto se documenta aquí y la URL de apertura es configurable (§10); al registrarse en runtime, el patrón puede recomputarse desde la configuración sin tocar el manifest. El host permission sí es estático en el manifest.

## 5. Configuración (common.js)

Objeto `DEFAULTS` con estas claves, persistido en `messenger.storage.local`:

| Clave | Tipo | Por defecto | Significado |
|---|---|---|---|
| copilotUrl | string | URL del chat de M365 Copilot | Página que se abre en la ventana lateral |
| promptTemplate | string | ver abajo | Plantilla del prompt con marcadores |
| newChatByDefault | boolean | true | Estado inicial del check "Empezar chat nuevo" |

Plantilla por defecto (`promptTemplate`), con marcadores que `buildPrompt` sustituye:

```
Redacta una respuesta profesional y cordial a este correo, en el mismo idioma del mensaje. Responde solo con el cuerpo del correo, sin asunto ni explicaciones.

De: {{author}}
Asunto: {{subject}}

{{body}}
```

`getConfig()` devuelve `messenger.storage.local.get(DEFAULTS)`, de forma que las claves ausentes toman el valor por defecto.

## 6. Extracción del cuerpo (common.js)

Función `extractBody(messageId)`:

1. Obtiene el mensaje completo con `messenger.messages.getFull(messageId)`.
2. Recorre recursivamente `parts` buscando primero `text/plain`; si no hay, toma `text/html` y lo convierte a texto.
3. La conversión HTML a texto usa `DOMParser`, elimina nodos `style`, `script` y `head`, y devuelve `textContent` del body normalizando espacios.
4. Trunca el resultado a un máximo razonable (orden de 12000 caracteres) para no desbordar el contexto del modelo. El truncado corta por el final e indica "[correo truncado]".
5. Devuelve cadena vacía si no hay parte textual legible; el llamador decide el mensaje de error.

## 7. Construcción del prompt (common.js)

Función `buildPrompt(message, body, template)`:

1. Sustituye en `template` los marcadores `{{author}}` (`message.author`), `{{subject}}` (`message.subject`) y `{{body}}` (cuerpo extraído).
2. Devuelve el texto resultante. No hace ninguna llamada de red: solo compone la cadena que el usuario verá y podrá editar.

## 8. Background (background.js)

Gestiona la ventana lateral de Copilot y hace de puente entre el popup y el content script.

- **Registro del content script:** al arrancar (y tras cambios de configuración de la URL), registra `content-copilot.js` sobre el dominio de Copilot mediante la API de scripting (§2). Idempotente: comprueba/actualiza el registro, no lo duplica.
- **Event page no persistente:** el background puede descargarse entre eventos. El id de la ventana de Copilot y el `messageId` en vuelo (fase 2) se persisten (`storage.session`) y se reconstruyen; no se confía en variables de módulo entre invocaciones.
- **Ventana lateral única:** mantiene el id de la ventana/pestaña de Copilot. Al recibir una petición, si no existe la crea (§8.1) y si existe la enfoca. No abre múltiples instancias.
- **Handshake:** la SPA de Copilot tarda en cargar. El background no asume que el content script está listo: le manda el prompt con reintentos (p. ej. cada 500 ms hasta ~30 s) hasta recibir confirmación, o bien el content script anuncia "listo" al cargar y el background entrega en cuanto lo esté. Si se agota el tiempo, informa al popup.
- **Listener `runtime.onMessage`:**
  - `sendToCopilot { prompt, newChat }`: asegura la ventana, entrega el prompt al content script, devuelve el resultado (ok / error legible).
  - **Fase 2** `copilotReply { text }` (emitido por el content script): abre `messenger.compose.beginReply(...)` con el texto capturado (§11).

### 8.1 Apertura de la ventana lateral

Preferencia: `messenger.windows.create({ type: "popup", url: copilotUrl, ... })` colocada a un lado. Fallback: `messenger.tabs.create({ url: copilotUrl })` reutilizando la pestaña. El spike confirmó que `messenger.tabs.create` con la URL externa de Copilot funciona en TB 140 y el content script se inyecta; queda por confirmar la variante `windows.create` popup, pero el content script y el protocolo de mensajes son iguales en ambas.

## 9. Content script (content-copilot.js)

Se inyecta solo en el dominio de Copilot. Toda la dependencia del DOM de Copilot vive aquí y con **selectores centralizados** en un único objeto `SELECTORS` al principio del fichero, para poder actualizarlos en un solo sitio cuando Microsoft cambie la interfaz.

Selectores reales descubiertos en el spike (M365 Copilot, 2026-07-06), sujetos a cambio por Microsoft:

```js
const SELECTORS = {
  editor: "#m365-chat-editor-target-element",                 // editor Lexical (contenteditable, id estable)
  sendButton: "button.fai-SendButton, button.fai-ChatInput__send",  // solo existe cuando hay texto
  newChat: '[data-testid=\"newChatButton\"]',
  reply: '[data-testid=\"markdown-reply\"]',                  // texto limpio de la respuesta (el último)
  loading: '[data-testid=\"loading-message\"]'                // presente mientras Copilot genera
};
```

Al recibir del background `{ prompt, newChat }`:

1. Si `newChat`, localiza y pulsa `SELECTORS.newChat` y espera (~800 ms) a que el editor quede listo.
2. Escribe en el editor Lexical. **Método validado:** colocar el cursor al final y disparar **un único** evento `beforeinput` con `{ inputType: "insertText", data: prompt }`. Disparar además `input` duplica el texto; asignar `textContent` no lo registra; `execCommand("insertText")` y un evento `paste` sintético no funcionaron de forma fiable. Conviene limpiar antes el editor (seleccionar todo + `execCommand("delete")`).
3. Pulsa `SELECTORS.sendButton` (que solo aparece una vez hay texto).
4. Responde al background con éxito. **Fase 2:** guarda el número de elementos `SELECTORS.reply` antes de enviar (baseline) y, en segundo plano, espera a que aparezca uno nuevo, desaparezca `SELECTORS.loading` y el texto del último se estabilice (~1,5 s sin cambios); entonces extrae `textContent` del último `SELECTORS.reply` y emite `copilotReply { text }`. Timeout de seguridad (~120 s).

Degradación robusta (§12): si no encuentra el editor o el botón (interfaz cambiada, o sesión no iniciada), no falla en silencio: lo comunica al background con un motivo, y el flujo cae al portapapeles.

## 10. Popup (popup/) — botón del visor

UI compacta (~420 px) con:

- Textarea editable, prellenado con `buildPrompt(...)` del correo mostrado.
- Check "Empezar chat nuevo", inicializado con `newChatByDefault`.
- Botón primario "Enviar a Copilot".
- Línea de estado (enviando / enviado / error) con punto de color.

Comportamiento (popup.js):

1. Al abrir, localiza la pestaña activa y usa `messenger.messageDisplay.getDisplayedMessages(tab.id)` (plural; en TB 140 el singular `getDisplayedMessage` ya no existe), cogiendo el primer mensaje de la lista. Sin mensaje: estado de error "No hay ningún correo abierto en esta pestaña" y sin botón de envío.
2. Extrae el cuerpo, construye el prompt con la plantilla de la configuración y lo muestra editable.
3. "Enviar a Copilot": manda `sendToCopilot { prompt, newChat }` al background con el texto actual del textarea (ediciones incluidas). Estado enviando; al confirmar, enviado y cierra; si error, estado de error con el motivo.

Estilos (popup.css): `color-scheme: light dark`, fuente system-ui ~13 px, bordes con `color-mix` sobre `currentColor` para tema claro y oscuro, acento #1a5fb4.

## 11. Composición (fase 2)

Al recibir `copilotReply { text }`, el background abre `messenger.compose.beginReply(messageId, "replyToSender", { body })` en **composición HTML** (para conservar la barra de formato y los complementos activos, que no aparecen en texto plano). El texto de Copilot se pega "tal cual": escapado y con los saltos de línea convertidos a `<br>` (los signos Markdown quedan literales, sin renderizar). El usuario revisa, edita y decide enviar. Requiere retener el `messageId` de origen desde el envío del prompt hasta que llega la respuesta. Alternativa no implementada: renderizar el Markdown a HTML real (§16).

## 12. Seguridad y protección de datos

- El contenido de los correos solo viaja a Microsoft 365 Copilot, el mismo destino al que el usuario ya envía datos al usar Copilot. Ninguna otra red, ninguna telemetría, ningún tercero.
- **Relevante para RGPD:** enviar el cuerpo de correos a Copilot implica un tratamiento por parte de Microsoft sujeto a los acuerdos de tu organización. Documentar cualquier cambio en el flujo de datos. La ventana muestra siempre lo que se envía (prompt editable) antes de enviarlo.
- Sin `eval`, sin `new Function`. En la UI propia (popup/options) no se usa `innerHTML` con contenido de correos ni de Copilot: el cuerpo se procesa solo con `DOMParser` para extraer texto y se muestra en un `textarea` (`value`, no HTML).
- El content script interactúa con el DOM de Copilot mediante selectores y eventos; no inyecta HTML remoto en páginas propias.
- **Degradación segura:** si la automatización falla (interfaz cambiada, sin sesión), el prompt se copia al portapapeles y se enfoca la ventana de Copilot para pegar a mano. Nunca se pierde el trabajo ni se queda en silencio.

## 13. Empaquetado

El entregable es `cothunder-<version>.xpi`: zip de la raíz del proyecto excluyendo ficheros ocultos, `docs/`, `CLAUDE.md`, `.claude/` y cualquier `.xpi` previo. El manifest debe validar como JSON y todos los JS deben pasar `node --check` antes de empaquetar. Instalación: Herramientas, Complementos, Instalar complemento desde archivo.

## 14. Criterios de aceptación

1. La extensión instala en Thunderbird 115+ sin advertencias de manifest.
2. Sin correo abierto, el popup muestra un error claro, no una excepción silenciosa.
3. Con sesión de Copilot iniciada, pulsar el botón en un correo abre (o enfoca) la ventana lateral de Copilot, escribe el prompt y lo envía; la respuesta aparece en esa ventana.
4. El check "Empezar chat nuevo" controla si Copilot arranca conversación nueva o continúa la actual.
5. Un correo solo HTML produce un prompt con texto limpio, sin restos de etiquetas ni estilos.
6. Si la automatización no encuentra el cuadro de chat (sesión no iniciada o interfaz cambiada), el prompt acaba en el portapapeles y se avisa al usuario; no hay fallo silencioso.
7. **Fase 2:** al terminar Copilot, se abre composición en texto plano al remitente con la respuesta capturada.

## 15. Riesgos conocidos

### 15.1 Registro del content script en MV3 (spike bloqueante) — RESUELTO EN VERDE

En MV3 no hay `content_scripts` declarativo y la API `scripting` no aparece en la documentación de APIs soportadas de Thunderbird. El spike lo validó en TB 140.11.1 (2026-07-06): **`messenger.scripting.registerContentScripts` funciona**, el content script se inyecta en el chat de Copilot, y `messenger.tabs.create` abre la URL externa dentro de Thunderbird. URL real del chat: `https://m365.cloud.microsoft/chat/`. No hace falta recurrir a `contentScripts.register` ni reconsiderar MV2. Observación: el content script se inyecta más de una vez por los redirects de carga de la página; los manejadores deben ser idempotentes.

### 15.2 Otros riesgos

1. **Alojar Copilot en ventana popup** (§8.1): el content script solo actúa sobre páginas en pestañas; a validar con spike si la ventana popup aloja una pestaña web válida. Fallback a pestaña normal.
2. **Selectores del DOM de M365 Copilot**: no documentados y cambiantes. Centralizados en `content-copilot.js` para actualización rápida. Es la fragilidad intrínseca del enfoque.
3. **SSO corporativo**: la primera vez puede exigir login manual en la ventana; después las cookies del perfil de Thunderbird persisten la sesión.
4. **Captura de respuesta (fase 2)**: depende de detectar el fin del streaming; sujeta a la misma fragilidad de selectores.
5. **Event page no persistente**: perder estado en memoria si el background se descarga; mitigado persistiendo en `storage.session` (§8).

## 16. Mejoras candidatas (no incluidas)

- ~~Selección de tono por correo (formal, breve, negativa cordial).~~ Implementado en v2.2 (§18.2).
- ~~Soporte de hilos (incluir mensajes anteriores en el prompt).~~ Implementado en v2.2 (§18.3).
- Atajo de teclado e internacionalización de la UI con `_locales`.
- **Imágenes reales** en el prompt: no factible con la inyección de texto actual (solo se incluye el `alt` de las imágenes); requeriría pegar datos de imagen en Copilot.
- **Panel completo de agentes**: hoy solo se listan los agentes fijados en la barra lateral (id estable); los del panel "Ver más" no tienen id y su selección sería frágil (§17).
- **Renderizado propio de Markdown**: red de seguridad si Copilot no coopera con el formato; hoy se confía en el prompt y en el complemento del usuario.

## 17. Novedades v2.1

### 17.1 Ventana de UI del botón

El botón `message_display_action` ya no abre un popup (limitado a 800×600 y no redimensionable): usa `messageDisplayAction.onClicked`, obtiene el `messageId` del correo mostrado y abre `popup/popup.html` en una **ventana propia** con `messenger.windows.create({ type: "popup", width: 800, height: 800, allowScriptsToClose: true })`, pasando `?messageId=` en la URL. La UI llena la ventana (flex column) y solo el `textarea` hace scroll. El popup obtiene el correo con `messenger.messages.get(messageId)`.

### 17.2 Agentes

El content script enumera los agentes **fijados en la barra lateral** de Copilot: `document.querySelectorAll(".fai-CopilotNavSubItem")`, filtrando por id de agente (`/^[PT]_/` o que contenga `agent`/`gpt`) para descartar el historial de chats, que comparte clase. Guarda `[{id, label, source}]` en `storage.local` (al cargar, a los 3 y 8 s, y cada 60 s), y responde a `getAgents`. El popup rellena el desplegable (recordando `lastAgentId`), con un botón de refresco que dispara `refreshAgents` (background → `getAgents`). Al enviar, el content script selecciona el agente con `document.getElementById(id)` (o por `aria-label`) antes de escribir; la escritura reintenta y verifica, porque al cambiar de agente el editor se rehace. El panel completo "Ver más" se descarta por frágil (§16).

### 17.3 Plantillas

Lee las plantillas de las carpetas de tipo templates de Thunderbird: `messenger.folders.query({ specialUse: ["templates"] })` (todas las cuentas, incluida Carpetas locales) y `messenger.messages.list(folderId)` con paginación por `continueList`. Cada plantilla es un mensaje (`subject` = nombre, cuerpo = contenido). Requiere el permiso `accountsRead`. Al elegir una, el popup lee su cuerpo conservando el Markdown fuente (`extractTemplateBody`, prioriza texto plano) y monta un prompt (`buildTemplatePrompt`) que combina el **correo original + la plantilla en Markdown + el conocimiento del agente**: rellena huecos/marcadores o sigue el formato de la plantilla.

### 17.4 Maquetación Markdown

Una guía compartida (`MARKDOWN_STYLE`) y una directiva (`MARKDOWN_INSTRUCTION`) se añaden **siempre** en `buildPrompt` y `buildTemplatePrompt` (no dentro de la plantilla editable, para que una plantilla guardada antigua no las anule). Se pide devolver el cuerpo como código fuente Markdown dentro de un bloque ```` ```markdown ```` (para capturarlo con los signos) y maquetar siempre con un mínimo concreto: saludo como encabezado, despedida en negrita, lo importante en cita, negrita para lo clave y listas en enumeraciones; creativo pero sin recargar. La respuesta se abre en composición **HTML** (`beginReply` con `body`), compatible con el complemento del usuario (p. ej. Markdown Here Revival).

### 17.5 Endurecido de la captura

Cada respuesta viaja con su `messageId` de ida (popup → background → content script) y vuelta (`copilotReply { text, messageId }`), eliminando el `pendingMessageId` único: dos envíos simultáneos ya no cruzan la respuesta de correo. Si `waitForReply` no captura texto, el background muestra una notificación (el popup ya se cerró).

## 18. Novedades v2.2

### 18.1 Ventana de UI adaptada

La ventana del botón se abre **compacta y centrada** (600×560), redimensionable, pensada para caber en 1080p y comportarse igual en pantallas de distinta resolución o con escalado del SO. `popup.js` la sitúa con `windows.getCurrent` + `windows.update` usando `screen.availWidth/Height`, y **recuerda tamaño y posición** en `storage.local` (`winBounds`), guardando con rebote al redimensionar/mover y en `pagehide`. Al reabrir, encaja los límites guardados dentro del área visible actual. Tras enviar, la ventana ya **no se cierra sola** (permite regenerar).

### 18.2 Prompt compuesto: Prompts, Formatos, tono y longitud

El prompt se arma en `buildComposedPrompt(message, body, opts)` combinando, en orden: (1) el **blindaje anti-inyección** (§18.4), (2) el **Prompt** prioritario del usuario, (3) el **hilo** anterior (§18.3), (4) la instrucción base + correo (`buildPrompt`), (5) el **Formato** de referencia, (6) **tono/longitud** (`toneLengthInstruction`) y (7) la maquetación Markdown (`MARKDOWN_INSTRUCTION` + `MARKDOWN_STYLE`). Cada bloque se separa con una **línea divisoria** (`SECTION_SEP`) para que el usuario localice y edite las partes con facilidad en el `textarea`.

Prompts y Formatos son **plantillas de Thunderbird distinguidas por el asunto**: `Prompt - Título` (instrucción prioritaria) y `Formato - Título` (referencia de estructura; también las plantillas sin prefijo). El popup las reparte en dos desplegables. Tono (formal / cercano / directo / negativa cordial) y longitud (breve / normal / detallada) se eligen en la ventana y se recuerdan en `storage.local`.

### 18.3 Firma, cita e hilo

Tres casillas controlan qué se añade a la respuesta, recordadas como preferencias:

- **Incluir mi firma**: al componer la respuesta, se añade la firma de la identidad (`identities.get`, `signature`/`signatureIsPlainText`), en vez de dejar que `beginReply` con `body` la elimine.
- **Incluir el correo citado**: añade la cita del original (del `body` de la composición, sin la `.moz-signature` para no duplicarla).
- **Incluir el hilo**: `buildThreadContext` reconstruye la conversación anterior siguiendo las cabeceras `References` e `In-Reply-To` (`messages.getFull` → `messages.query({ headerMessageId })`), toma hasta 10 ancestros (2000 caracteres cada uno), los ordena cronológicamente y los aporta como *CONTEXTO DEL HILO*. Se carga con caché al marcar la casilla, avisa si el correo no tiene hilo previo y **también se revisa contra inyección**. No requiere permisos nuevos (`messagesRead`).

### 18.4 Blindaje anti-inyección

Como la extensión lee correos recibidos de terceros, el contenido entrante se trata como **datos, nunca como instrucciones**. Dos capas, en `common.js`:

- **Píldora en el prompt** (`INJECTION_GUARD`): se antepone **siempre** (con o sin Prompt seleccionado). Ordena a Copilot ignorar y señalar cualquier intento incrustado en el correo o el hilo de cambiar su rol, anular indicaciones, revelar su *system prompt*, cambiar objetivo o formato, o plantear escenarios para saltarse límites.
- **Detección local** (`detectInjection` + `INJECTION_PATTERNS`): escanea el cuerpo y el hilo con patrones de seis categorías y severidad (rol/anulación/divulgación = crítico; override de formato/cambio de objetivo = alto; contexto hipotético = medio). El popup **avisa** antes de enviar sin bloquear la acción del usuario, que es quien revisa y decide.

### 18.5 Biblioteca de plantillas sembrada

Al instalar (`runtime.onInstalled`, `reason === "install"`), `seedTemplates` crea una biblioteca de ejemplos de Prompts y Formatos en la carpeta de plantillas (`folders.query` templates + `messages.import` de un EML con asunto codificado RFC 2047, marcado leído), deduplicando por asunto. Incluye un **Formato - Identidad UPO** adaptado a correo (estructura institucional y guía de marca: azul #003772 / amarillo #FCC100 como acento puntual, tipografía Franklin Gothic o Arial; sin inventar colores ni tipografías). Requiere el permiso `messagesImport`.

### 18.6 Rediseño de la ventana

Cabecera con **logo de Copilot + "Preguntar a Copilot"** y el estado (punto + texto) alineado a la derecha, y un botón **"?"** que abre la guía de uso en Opciones. Los campos llevan **título en negrita con icono** (🤖 Agente, ⭐ Prompt, 📄 Formato, 🎭 Tono, 📏 Longitud, ✍️ Prompt a enviar), con Prompt/Formato y Tono/Longitud en rejilla de dos columnas. Sobre el `textarea`, una **mini barra Markdown** inserta formato (negrita, cursiva, encabezado, listas, cita, código, enlace). El botón **Regenerar** reenvía el prompt en un chat nuevo para otra versión; "Enviar" (azul) y "Regenerar" (verde teal) van en color sólido con el texto en negrita.

## 19. Crear desde Copilot — Fase 1 (v2.3)

Añade un segundo botón para **redactar correos desde cero** (no una respuesta), reutilizando el popup. Es la Fase 1 de una suite de creación mayor (Fase 2: botón en la ventana de redacción con "Crear" y "Mejorar"; Fase 3: pulido), aquí solo se especifica la Fase 1.

### 19.1 Botón y modo

Un botón `action` en la **barra principal** de Thunderbird (icono de Copilot, título "Crear desde Copilot"), independiente de que haya un correo abierto. Al pulsar abre `popup/popup.html?mode=create` en la misma ventana propia (`windows.create`, redimensionable y con memoria de tamaño, como §18.1); no lleva `messageId`. Al tener más campos que el modo respuesta, **abre más alto por defecto** (≈620×760 frente a 600×560) y recuerda su tamaño **por separado** (`winBoundsCreate`, distinto de `winBounds` del modo respuesta). El popup lee `mode` de la URL (`reply` por defecto, `create` en este botón) y ajusta la UI y el flujo. **No requiere permisos nuevos**: `action` no lleva permiso propio y `compose` (para `beginNew`) ya está declarado.

### 19.2 UI en modo creación

Reutiliza tal cual: 🤖 Agente, ⭐ Prompt, 📄 Formato, 🎭 Tono, 📏 Longitud, editor Markdown, "Empezar chat nuevo", "Incluir mi firma" y "Regenerar". **Oculta** las opciones propias de respuesta ("Incluir el correo citado" e "Incluir el hilo"), que no aplican sin correo de origen. **Añade**:

- 🌐 **Idioma** de salida (Automático / Español / Inglés / …): fuerza el idioma del correo generado.
- 👤 **Para / contexto** (texto libre): destinatario, propósito y puntos a incluir; enriquece el prompt.
- ✉️ **Para**, 📋 **CC** y 🕶️ **CCO** (opcionales): tres cajas independientes; cada una admite **varias direcciones** separadas por comas/punto y coma. `parseRecipients` filtra las direcciones válidas y prefijan los campos correspondientes del correo nuevo (`to`/`cc`/`bcc`).
- 📝 **¿Qué quieres crear?** (`textarea` propio): la instrucción base de la creación; **crece con la ventana** (campo dominante en modo creación) y tiene su **propia mini barra Markdown** (independiente de la del prompt: cada barra edita su `textarea` y no le roba el foco al otro). Se mantiene el `textarea` **"Prompt a enviar"** como prompt compuesto y editable (con la separación en bloques de §18.2), en vez de reetiquetar el principal, para conservar el modelo de respuesta y la edición por bloques.

Las preferencias del modo creación (tono, longitud, idioma, firma) se recuerdan por separado de las del modo respuesta. La ventana rotula su cabecera y `document.title` como **"Crear desde Copilot"** (frente a "Preguntar a Copilot" del modo respuesta), para que se distinga claramente de la del visor.

**Plantillas específicas de creación.** El desplegable ⭐ Prompt es sensible al modo: en creación muestra solo las plantillas con asunto `Prompt crear - …`; en respuesta, las `Prompt - …`. El desplegable 📄 Formato se **comparte** entre modos (los formatos son estructurales). La biblioteca sembrada al instalar incluye un juego de `Prompt crear - …` (convocatoria, invitación, comunicado, solicitud, presentación, agradecimiento, felicitación, recordatorio, propuesta comercial, boletín) y formatos de creación (convocatoria, invitación). La siembra se ejecuta al **instalar y al actualizar** (idempotente por asunto).

### 19.3 Prompt de creación

`buildCreatePrompt` compone, en orden: la píldora anti-inyección (relajada, ya que el contenido es del propio usuario), el Prompt prioritario, la **instrucción de creación** con el contexto/idioma, el Formato de referencia, tono/longitud, y una directiva Markdown específica `MARKDOWN_INSTRUCTION_CREATE` que pide **asunto y cuerpo**: primero una línea `Asunto: …` con un asunto breve y, a continuación, el cuerpo como código fuente Markdown sin renderizar dentro de un único bloque ```` ```markdown ````. Se mantiene la separación en bloques con `SECTION_SEP` (§18.2) para editarlo con facilidad.

### 19.4 Captura y composición

El content script captura la respuesta igual que en modo respuesta (`waitForReply`, misma tubería y selectores centralizados). En modo creación, el background **separa la línea `Asunto:` del cuerpo Markdown** y abre `messenger.compose.beginNew()` en composición **HTML**, fijando `subject`, `body` y los destinatarios `to`/`cc`/`bcc` (cada campo pasa por `parseRecipients`, que admite varias direcciones y descarta las inválidas), y añadiendo la firma de la identidad por defecto si "Incluir mi firma" está marcado. La correlación de ida y vuelta usa un `requestId` generado (no hay `messageId`). Degradación idéntica a §17.5: si `waitForReply` no captura texto, se copia el prompt al portapapeles y se notifica.

### 19.5 Reutilización

Sin cambios en `content-copilot.js` ni nuevas dependencias del DOM de Copilot: la única diferencia respecto a la respuesta es la construcción del prompt (`buildCreatePrompt`) y el destino final (`beginNew` en vez de `beginReply`). El popup es el mismo, parametrizado por `mode`.

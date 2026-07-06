# Especificación: CoThunder

Extensión MailExtension para Thunderbird 115 o superior. Lee el correo abierto, monta un prompt editable con su contenido y lo envía a la web de **Microsoft 365 Copilot** automatizando el chat con la sesión que el usuario ya tiene iniciada. No usa ninguna API ni clave: pilota la interfaz web de Copilot mediante un content script.

Versión de esta especificación: 2.0.0. Corresponde a la versión 2.0.0 de la extensión. La 1.x se basaba en llamadas directas a una API compatible OpenAI/Azure; se ha sustituido por completo por automatización de Copilot web al no disponer de acceso a API.

Plataforma objetivo: Thunderbird ESR 140 (probado en 140.11.1), **Manifest V3**. Decisión explícita del proyecto; ver §2 y el riesgo asociado en §15.

## 1. Alcance

Qué hace:

- Para el correo mostrado en la pestaña activa, monta un prompt a partir de una plantilla (instrucción + remitente + asunto + cuerpo) que el usuario puede editar antes de enviar.
- Abre Microsoft 365 Copilot dentro de Thunderbird en una ventana lateral persistente y reutilizable.
- Escribe el prompt en el cuadro de chat de Copilot y lo envía, opcionalmente empezando un chat nuevo.
- **Fase 2 (posterior):** captura la respuesta de Copilot y abre una ventana de composición con ella como respuesta al remitente.

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
- Permisos: `messagesRead`, `compose` (fase 2), `storage`, `scripting`, y `host_permissions` con el dominio de Microsoft 365 Copilot (no `<all_urls>`: el destino es un dominio fijo y configurable). En MV3 `host_permissions` es un key separado de `permissions`.
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
  newChat: '[data-testid=\"newChatButton\"]'
};
```

Al recibir del background `{ prompt, newChat }`:

1. Si `newChat`, localiza y pulsa `SELECTORS.newChat` y espera (~800 ms) a que el editor quede listo.
2. Escribe en el editor Lexical. **Método validado:** colocar el cursor al final y disparar **un único** evento `beforeinput` con `{ inputType: "insertText", data: prompt }`. Disparar además `input` duplica el texto; asignar `textContent` no lo registra; `execCommand("insertText")` y un evento `paste` sintético no funcionaron de forma fiable. Conviene limpiar antes el editor (seleccionar todo + `execCommand("delete")`).
3. Pulsa `SELECTORS.sendButton` (que solo aparece una vez hay texto).
4. Responde al background con éxito. **Fase 2:** además observa el fin del streaming de la respuesta (p. ej. `MutationObserver` sobre el contenedor de mensajes hasta que deja de crecer y reaparece el botón de enviar), extrae el texto del último mensaje del asistente y emite `copilotReply { text }`. (El selector del contenedor de respuesta se descubrirá al abordar la fase 2.)

Degradación robusta (§12): si no encuentra el editor o el botón (interfaz cambiada, o sesión no iniciada), no falla en silencio: lo comunica al background con un motivo, y el flujo cae al portapapeles.

## 10. Popup (popup/) — botón del visor

UI compacta (~420 px) con:

- Textarea editable, prellenado con `buildPrompt(...)` del correo mostrado.
- Check "Empezar chat nuevo", inicializado con `newChatByDefault`.
- Botón primario "Enviar a Copilot".
- Línea de estado (enviando / enviado / error) con punto de color.

Comportamiento (popup.js):

1. Al abrir, localiza la pestaña activa y `messenger.messageDisplay.getDisplayedMessage(tab.id)`. Sin mensaje: estado de error "No hay ningún correo abierto en esta pestaña" y sin botón de envío.
2. Extrae el cuerpo, construye el prompt con la plantilla de la configuración y lo muestra editable.
3. "Enviar a Copilot": manda `sendToCopilot { prompt, newChat }` al background con el texto actual del textarea (ediciones incluidas). Estado enviando; al confirmar, enviado y cierra; si error, estado de error con el motivo.

Estilos (popup.css): `color-scheme: light dark`, fuente system-ui ~13 px, bordes con `color-mix` sobre `currentColor` para tema claro y oscuro, acento #1a5fb4.

## 11. Composición (fase 2)

Al recibir `copilotReply { text }`, el background abre `messenger.compose.beginReply(messageId, "replyToSender", { plainTextBody: text, isPlainText: true })`. El usuario revisa, edita y decide enviar. Requiere retener el `messageId` de origen desde el envío del prompt hasta que llega la respuesta.

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

Por orden de valor: selección de tono por correo (formal, breve, negativa cordial), soporte de hilos (incluir mensajes anteriores en el prompt), atajo de teclado, e internacionalización de la UI con `_locales`.

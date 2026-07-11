# Diseño: Editor Markdown con preview en la ventana de redacción

Fecha: 2026-07-12
Estado: aprobado (pendiente de plan de implementación)

## 1. Objetivo

Sustituir la funcionalidad de **Markdown Here Revival** (ya no soportada en las
versiones nuevas de Thunderbird) integrándola en CoThunder: un **panel dividido
en la zona de escritura de la ventana de redacción** — a la izquierda se edita
Markdown, a la derecha se ve el HTML renderizado en vivo. La conversión a HTML
ocurre solo al finalizar (apagar el panel) o al enviar. El correo sale maquetado.

La funcionalidad está disponible en **cualquier** ventana de redacción (como
MDHR) y, además, el flujo de Copilot abre la ventana **ya rellena** con el
Markdown de la respuesta.

## 2. Restricciones

- Objetivo **Thunderbird 150+**, pero **retrocompatible con ESR 140**
  (`strict_min_version` sigue en `"140.0"`; probado en ambas ramas).
- Manifest V3, `messenger`, JavaScript vanilla con `"use strict"`, sin
  frameworks, sin bundlers, **sin dependencias npm en runtime**.
- Sin permisos nuevos: `compose` y `scripting` ya están declarados.
- Sin `eval` / `new Function` / `innerHTML` con contenido remoto.
- El contenido no viaja a ningún destino nuevo: todo local, en la ventana de
  redacción. Sin cambios en el flujo de datos hacia terceros (RGPD).

## 3. Motor de Markdown: propio

Se descarta vendorizar una librería (marked/highlight.js). Se escribe un
**renderizador Markdown→HTML vanilla propio**, coherente con la filosofía de
CoThunder (sin deps, sin licencias de terceros, control del sanitizado y del
subconjunto). La superficie de Markdown está acotada por lo que produce la guía
compartida `MARKDOWN_STYLE` y el Markdown de correo habitual.

## 4. Arquitectura y componentes

La única superficie que una MailExtension controla en la ventana de redacción es
el **documento del cuerpo editable**, inyectable con un *compose script*
(`scripting.compose` / `composeScripts`, permiso `compose`). Ahí se monta el
panel dividido. Toda la fragilidad del DOM del editor de TB se aísla en un único
fichero con **selectores centralizados**, como ya se hace con `content-copilot.js`.

### Ficheros nuevos

- **`markdown.js`** — renderizador Markdown→HTML vanilla + sanitizado. Reglas
  centralizadas en un objeto. Construye el HTML por nodos
  (`createElement`/`textContent`), sin `innerHTML`. Se carga en el compose script
  (y donde haga falta).
- **`content-compose.js`** — el *compose script*: monta el panel dividido en el
  cuerpo, cablea el preview en vivo, gestiona activar/desactivar y la
  finalización a HTML. **Selectores del editor de TB centralizados** en un objeto.
- **`compose.css`** — estilos del panel dividido + el "tema" del HTML de salida.

### Ficheros que cambian

- **`manifest.json`** — añadir `compose_action` (botón en la barra de la ventana
  de redacción) y un `commands` (atajo `Ctrl+Alt+M`). Sin permisos nuevos.
- **`background.js`** — registrar el compose script en runtime (MV3, sin
  declarativo); manejar el `onClicked` del `compose_action` (alternar panel); el
  `onBeforeSend` (finalizar a HTML y cancelar); y **cambiar la entrega de
  Copilot**: dejar el **Markdown fuente** en el cuerpo en vez de HTML escapado.
- **`common.js`** — reutilizar helpers; el renderizador va aparte en `markdown.js`.
- **`options/`** — ajuste "Activar el editor Markdown por defecto" (encendido de
  fábrica).

## 5. Activación y UX

- Botón **`compose_action`** "Markdown" en la barra de la ventana de redacción y
  **atajo** `Ctrl+Alt+M`: ambos **alternan** el panel en ese correo.
- **Encendido por defecto** en cualquier ventana de redacción (configurable en
  Opciones). El botón refleja el estado activo (icono/badge).
- **Encendido:** dos columnas — izquierda Markdown editable, derecha preview en
  vivo (re-render al teclear con *debounce*). Al encender, el texto que hubiera
  en el cuerpo se toma como Markdown de partida.
- **Apagar (botón/atajo):** convierte el Markdown a HTML, lo deja como cuerpo
  real y la ventana vuelve a la redacción normal de TB, ya maquetada.

## 6. Flujo de datos y finalización

**Edición (panel encendido):** el compose script toma el texto del cuerpo como
Markdown, pinta las dos columnas y renderiza el preview con `markdown.js`. El
andamiaje del panel vive en el documento del cuerpo pero **nunca es el correo**:
el Markdown fuente es la única verdad mientras se edita.

**Finalización al enviar:** `compose.onBeforeSend` renderiza el Markdown a HTML y
devuelve `{ cancel: true, details: { body: html } }`. Se **cancela** ese envío,
queda el HTML en el cuerpo y el panel apagado; el usuario revisa y envía de nuevo
(ya con el panel apagado, sale normal). Confirmado en la API de la ESR 140 que
`onBeforeSend` admite `cancel` y `details.body`.

**Integración con Copilot:** hoy `background.js` mete el texto **escapado**
(`escapeHtmlWithBreaks`); pasa a dejar el **Markdown fuente** de la respuesta como
cuerpo. Como el panel está encendido por defecto, la ventana de respuesta/creación
se abre ya en modo dividido con preview. Esto **corrige un fallo actual**: hoy el
correo sale con el Markdown crudo como texto plano; a partir de ahora sale
maquetado.

## 7. Renderizador `markdown.js`

Subconjunto acotado:
- **Bloque:** encabezados `#`…`######`, párrafos, listas ordenadas/desordenadas
  (con anidación), citas `>`, regla `---`, bloques de código ```` ``` ````, y
  **tablas** (pipe tables).
- **En línea:** negrita, cursiva, código, enlaces `[texto](url)`, saltos de línea.
- **Construcción segura:** nodos con `createElement`/`textContent`, sin
  `innerHTML`. Enlaces solo con esquemas `http`/`https`/`mailto` (se descartan
  `javascript:` y demás). Objeto de reglas centralizado.
- **Pruebas:** `test/` con un caso por regla.

## 8. Spike bloqueante, compatibilidad y seguridad

**Spike (primer paso de implementación):** montar el panel dividido **dentro del
editor nativo de TB** sin que el andamiaje contamine el correo enviado. Prueba de
concepto mínima: inyectar el compose script, pintar dos columnas y verificar que
al enviar sale solo el HTML limpio, **en TB 140 y en 150+**.
- **Plan B** si el andamiaje dentro del cuerpo da problemas: mantener el cuerpo
  nativo solo-Markdown y el preview como overlay no editable. Se decide con el
  resultado del spike.

**Compatibilidad 140/150+:** `strict_min_version` en `"140.0"`. Los selectores del
editor van centralizados en `content-compose.js` para absorber diferencias en un
solo sitio. El spike valida ambas ramas.

**Seguridad/RGPD:** sin destinos nuevos (todo local), sin `eval`/`new
Function`/`innerHTML` remoto, sin permisos nuevos.

## 9. Criterios de aceptación

1. En una ventana de redacción nueva, el panel aparece encendido; se escribe
   Markdown a la izquierda y el preview renderiza a la derecha en vivo.
2. El botón `compose_action` y `Ctrl+Alt+M` alternan el panel.
3. Al apagar el panel, el cuerpo queda como HTML maquetado.
4. Al enviar con el panel encendido, el envío se cancela, el cuerpo queda como
   HTML y no sale Markdown crudo ni andamiaje.
5. El flujo de Copilot abre la ventana con el Markdown ya cargado en el panel.
6. Funciona en TB 140 y 150+.
7. El renderizador cubre el subconjunto documentado y pasa sus pruebas.
8. Sin permisos nuevos; sin `innerHTML` remoto.

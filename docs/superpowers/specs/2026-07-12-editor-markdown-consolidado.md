# CoThunder v2.5 — Editor Markdown en la redacción: diseño consolidado y backlog

Fecha: 2026-07-12
Supersede en arquitectura al doc `2026-07-12-editor-markdown-redaccion-design.md` (el
enfoque de "textarea dentro del editor" se descartó en el spike; ver §Arquitectura).

## Contexto

Sustituto de Markdown Here Revival dentro de CoThunder: escribir el correo en
Markdown en la ventana de redacción, con preview en vivo, y enviarlo maquetado.

## Arquitectura (real, tras el spike) — PLAN B

El enfoque inicial (inyectar un `<textarea>` dentro del cuerpo editable) FALLÓ:
el editor nativo de Thunderbird se queda con el tecleo. Enfoque adoptado:

- El **editor nativo de Thunderbird es la fuente Markdown** (el usuario escribe ahí).
- Un **preview NO editable** (mitad derecha, `position:fixed`, `contenteditable=false`)
  renderiza en vivo con debounce; `body{margin-right:50%}` reserva la izquierda.
- `markdownSource()` lee el texto del cuerpo (excluyendo el preview) y convierte los
  `<img>` insertados a `![alt](src)` para no perderlos.
- **Envío (opción 1, un clic):** `compose.onBeforeSend` devuelve `{ details: { body: html } }`
  con el Markdown renderizado; el correo sale directo, maquetado.
- Motor `markdown.js`: renderizador vanilla propio, sin dependencias. Toda la
  dependencia del DOM del editor va centralizada en `content-compose.js`.

**Restricción clave de correo** (los clientes son muy restrictivos):
- Ignoran CSS externo, `<style>` y fuentes web/icon-fonts → todo lo que deba verse
  en el correo usa **estilos EN LÍNEA**.
- **`<svg>` inline lo ELIMINAN** muchos clientes (Gmail, Outlook) → iconos dentro
  del correo (p. ej. admonitions) con **emoji unicode** (ℹ️ ⚠️ ✅), NO con SVG.
- **Imágenes:** los clientes las **bloquean por defecto**. Fiabilidad: `cid:`
  (adjunto embebido, lo que hace TB al insertar) > remota (requiere "cargar
  imágenes") > `data:` (muchos clientes la quitan). No se puede evitar el bloqueo
  del cliente; sí maximizar fiabilidad prefiriendo `cid:`.
- **Iconos de la barra de herramientas (UI del editor, NO correo):** SVG inline,
  perfecto (es contexto de navegador). Sin FontAwesome ni fuentes de iconos.

## Estado actual (hecho y verificado por el usuario en TB)

- ✅ Editor Plan B + preview en vivo (aparece en responder y nuevo)
- ✅ Imágenes (`![]()`, `data:`/`cid:`/`https`; conserva las insertadas)
- ✅ Envío de un clic (opción 1)
- ✅ GFM: tachado `~~x~~`, listas de tareas `- [ ]`/`- [x]`, autoenlaces de URL
- Motor: 44/44 pruebas. Rama `cothunder-editor-markdown`.

## Backlog priorizado

Objetivo de cobertura: TODA la sintaxis básica + extendida del Markdown Guide
(cheat sheet en `docs/screenshots/markdown-cheat-sheet.md`).

### v2.5 — NÚCLEO (orden de construcción propuesto)

1. **Completar sintaxis básica** — negrita+cursiva `***`, títulos en enlace/imagen
   `(url "t")`, autoenlaces `<https://…>`/`<correo>`, escapado `\`, imagen enlazada.
2. **Inline extendida común** — resaltado `==x==`→`<mark>` (estilo inline), subíndice
   `~x~`, superíndice `^x^`, emoji `:code:` (set curado ampliable).
3. **Admonitions** — `> [!NOTE]`/`[!TIP]`/`[!IMPORTANT]`/`[!WARNING]`/`[!CAUTION]`
   como cajas con estilo en línea + icono **emoji** (SVG no, se elimina en correo).
4. **Tema del correo (estilos inline)** — que la salida se vea bien en el correo
   (encabezados, listas, tablas, citas, código, admonitions) con estilos en línea,
   no solo en el preview.
5. **Barra de herramientas Markdown** — botones (SVG/unicode) que insertan/rodean
   sintaxis en el editor: encabezado, negrita, cursiva, tachado, enlace, imagen,
   código, bloque, cita, lista, tarea, tabla, regla, admonition.
6. **Toggle + atajo + opción** — botón `compose_action` y `Ctrl+Alt+M` para
   encender/apagar; ajuste "activar por defecto" en Opciones.
7. **Integración Copilot** — la respuesta de Copilot llega como Markdown al editor.
8. **Empaquetado v2.5** — versión, CHANGELOG, `.xpi`.

### v2.6+ — DESPUÉS (más pesado, más raro o mayor riesgo)

- **Resaltado de sintaxis de código** (resaltador propio, colores inline). Grande.
  Interino en v2.5: bloque monoespaciado con fondo, sin color.
- **Pegar HTML → Markdown** (interceptar `paste`, conversor propio tipo turndown).
- **Bloques extendidos poco comunes** — notas al pie `[^1]`, listas de definición,
  IDs de encabezado `{#id}`.
- **Opcionales de borde** — encabezados setext, enlaces por referencia, código
  indentado con 4 espacios.

## Decisiones tomadas (usuario)

- Pegar HTML → convertir a Markdown (v2.6).
- Cobertura: motor propio, sin vendorizar librería (ni marked ni highlight.js).
- Admonitions estilo GitHub.
- Resaltado de código: resaltador propio con colores inline (v2.6).
- Envío: opción 1 (un clic).
- Layout preview: 50/50.
- FontAwesome/icon-fonts: NO (no funcionan en correo; SVG/unicode en su lugar).

## Método

Cada punto se implementa con pruebas (`node --test` para el motor) y una revisión
antes de cerrarlo (flujo SDD). El usuario prueba cada build en Thunderbird.

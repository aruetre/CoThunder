# CoThunder

Extensión MailExtension para Thunderbird 115+ que lee el correo abierto, monta un prompt editable con su contenido y lo envía a la web de Microsoft 365 Copilot automatizando el chat con la sesión ya iniciada. No usa API ni claves: pilota la interfaz web de Copilot mediante un content script.

## Especificación

La especificación funcional y técnica completa está en `docs/ESPECIFICACION.md`. Léela antes de generar o modificar código. Es la fuente de verdad: si el código y la especificación divergen, gana la especificación salvo indicación explícita.

## Estructura del proyecto

```
manifest.json          MailExtension manifest v2, TB 115+
common.js              Configuración, extracción de cuerpo, construcción del prompt
background.js          Gestiona la ventana lateral de Copilot y el puente con el content script
content-copilot.js     Automatización del DOM de Copilot (selectores centralizados)
popup/                 UI del botón: prompt editable y envío (html, css, js)
options/               Página de configuración (html, js)
icon.svg               Icono de la extensión
docs/                  Especificación y documentación
.claude/skills/        Skills de calidad y empaquetado
```

## Reglas del proyecto

- Manifest V3 con `applications.gecko` y `strict_min_version: 140.0` (TB ESR 140). Background event page no persistente. Sin `content_scripts` declarativo: el content script se registra en runtime (spike bloqueante, §15.1 del spec).
- API de Thunderbird via el objeto global `messenger`, no `browser` ni `chrome`.
- JavaScript vanilla con `"use strict"`. Sin frameworks, sin bundlers, sin dependencias npm en runtime. Node solo para validación y tooling.
- Sin API ni claves: el contenido de los correos solo viaja a Microsoft 365 Copilot, el destino al que el usuario ya envía datos al usar Copilot. Ninguna otra red, ninguna telemetría. Relevante para RGPD: documentar cualquier cambio en el flujo de datos.
- No incrustar Copilot en un iframe (Microsoft lo bloquea): usar ventana/pestaña propia con content script. Toda dependencia del DOM de Copilot vive en `content-copilot.js` con selectores centralizados.
- Degradación segura: si la automatización falla (interfaz cambiada o sin sesión), copiar el prompt al portapapeles y avisar; nunca fallar en silencio.
- Textos de UI en español. Código y nombres de variables en inglés.
- Estilo: prosa de commits en español, imperativo, una línea de resumen.

## Flujo de trabajo

1. Cambios de código: aplicar la skill `revision-mailextension` antes de dar por cerrada cualquier tarea.
2. Entrega: aplicar la skill `empaquetado-xpi` para validar y generar el `.xpi`.
3. Versionado: SemVer en `manifest.json`. Cada release sube versión y regenera el paquete.

## Comandos útiles

```bash
# Validar sintaxis JS
for f in common.js background.js content-copilot.js popup/popup.js options/options.js; do node --check "$f"; done

# Validar manifest
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"

# Empaquetar (ver skill empaquetado-xpi para el proceso completo)
zip -r cothunder.xpi . -x '.*' -x 'docs/*' -x '*.xpi' -x 'CLAUDE.md'
```

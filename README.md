# CoThunder

Extensión MailExtension para Thunderbird 140+ que integra Microsoft 365 Copilot en el correo: lee el mensaje abierto, monta un prompt editable con su contenido y lo envía al chat web de Copilot usando tu sesión ya iniciada. Sin API ni claves.

## Instalación

1. Descarga el `.xpi` más reciente desde la [página de Releases](../../releases).
2. En Thunderbird: **Herramientas › Complementos y temas › engranaje ⚙ › Instalar complemento desde archivo…** y elige el `.xpi`.
3. Abre un correo y pulsa el botón **Preguntar a Copilot**. La primera vez, inicia sesión en Copilot en la ventana que se abre.

Requiere Thunderbird ESR 140 o superior.

## Uso

- Con un correo abierto, pulsa **Preguntar a Copilot**: se muestra un prompt editable (instrucción + remitente, asunto y cuerpo del correo).
- Marca **Empezar chat nuevo** si quieres que Copilot arranque una conversación limpia.
- Pulsa **Enviar a Copilot**: se abre Copilot dentro de Thunderbird, escribe el prompt y lo envía.
- En **Opciones** puedes cambiar la URL del chat de Copilot y la plantilla del prompt.

## Releases automáticas

El `.xpi` se compila y publica solo con GitHub Actions (`.github/workflows/release.yml`):

- **Publicar una versión:** sube la versión en `manifest.json` (SemVer) y empuja una etiqueta `vX.Y.Z`. La acción valida, empaqueta `cothunder-<version>.xpi` y crea la Release con el `.xpi` adjunto.

  ```bash
  git tag v2.0.0
  git push origin v2.0.0
  ```

- **Compilar sin publicar:** lanza el workflow *Release XPI* a mano desde la pestaña **Actions** (`workflow_dispatch`); el `.xpi` queda como artefacto del workflow.

Cada push y pull request pasa además por el workflow `CI`, que valida el manifest y la sintaxis de los JS.

## Desarrollo

Extensión Manifest V3, JavaScript vanilla, sin dependencias en runtime (Node solo para validar). La especificación completa está en [`spec/docs/ESPECIFICACION.md`](spec/docs/ESPECIFICACION.md).

```bash
# Validar sintaxis y manifest
for f in common.js background.js content-copilot.js popup/popup.js options/options.js; do node --check "$f"; done
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"
```

Cargar sin empaquetar: `about:debugging` › Este Thunderbird › Cargar complemento temporal › `manifest.json`.

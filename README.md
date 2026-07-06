# CoThunder

Extensión MailExtension para **Thunderbird 140+** que integra **Microsoft 365 Copilot** en el correo: lee el mensaje abierto, monta un prompt editable con su contenido y lo envía al chat web de Copilot usando tu sesión ya iniciada. Copilot redacta la respuesta y CoThunder la trae de vuelta a una ventana de composición, formateada en Markdown. **Sin API ni claves.**

## Características

- **Un botón en el visor de mensajes** (con el logo de Copilot): abre una ventana con el prompt ya montado a partir del correo (remitente, asunto y cuerpo, limpio de CSS, espacios y caracteres invisibles).
- **Ventana redimensionable** (800×800 de inicio): edita el prompt con espacio; solo el área de texto hace scroll.
- **Selector de agente**: elige entre *Copilot por defecto* o cualquiera de tus **agentes fijados en Copilot** (por ejemplo un GPT especializado). CoThunder recuerda el último que usaste y tiene un botón **↻** para actualizar la lista cuando creas agentes nuevos.
- **Selector de plantilla**: usa tus **plantillas de Thunderbird** (carpeta *Plantillas*, de cualquier cuenta). Al elegir una, Copilot combina el correo original + la plantilla en Markdown + el conocimiento del agente para redactar una respuesta enriquecida; rellena los huecos de la plantilla o sigue su formato, según convenga.
- **Respuesta maquetada en Markdown**: la respuesta llega con buen diseño (saludo como encabezado, despedida en negrita, lo importante en cita, listas y tablas donde aportan claridad). Se renderiza en la composición HTML (compatible con el complemento *Markdown Here Revival* si lo usas).
- **Vuelta automática a composición**: cuando Copilot termina, se abre sola una ventana de respuesta al remitente con el texto, manteniendo tus herramientas y complementos de composición.
- **Chat nuevo opcional** y **degradación segura**: si algo falla al escribir en Copilot, el prompt se copia al portapapeles y se avisa; si no se puede capturar la respuesta, salta una notificación.
- **Opciones configurables**: URL del chat de Copilot y plantilla base del prompt.

## Instalación

1. Descarga el `.xpi` más reciente desde la [página de Releases](../../releases).
2. En Thunderbird: **Herramientas → Complementos y temas → engranaje ⚙ → Instalar complemento desde archivo…** y elige el `.xpi`.
3. Abre un correo y pulsa el botón de **Copilot**. La primera vez, inicia sesión en Copilot en la ventana que se abre.

Requiere **Thunderbird ESR 140 o superior**.

## Uso

1. Abre un correo y pulsa el botón de **Copilot** en la barra del visor.
2. En la ventana:
   - (Opcional) elige un **Agente** para que aporte su conocimiento especializado.
   - (Opcional) elige una **Plantilla** para que la respuesta siga tu formato.
   - Revisa y edita el **prompt** si quieres. Marca **Empezar chat nuevo** para partir de cero.
3. Pulsa **Enviar a Copilot**. Se abre Copilot dentro de Thunderbird, escribe el prompt y lo envía.
4. Cuando Copilot termina, se abre una **ventana de composición** con la respuesta, lista para revisar y enviar.

### Plantillas

Crea una plantilla como en Thunderbird: redacta un mensaje (puedes escribirlo en **Markdown**) y **Archivo → Guardar como plantilla**. Aparecerá en el selector de *Plantilla* de CoThunder (de cualquier cuenta, incluida *Carpetas locales*). Usa huecos tipo `[nombre]`, `[fecha]`, `[motivo]` para que Copilot los rellene, o escríbela como un modelo de estructura/tono para que la siga.

### Agentes

CoThunder lista los agentes **fijados en la barra lateral** de Copilot. Si quieres uno en el selector, **fíjalo en Copilot** (aparecerá en la barra lateral) y pulsa **↻** en la ventana de CoThunder para refrescar la lista.

## Complemento recomendado: Markdown Here Revival

CoThunder pide a Copilot que devuelva la respuesta en **Markdown** y la vuelca en la ventana de composición tal cual (con sus `#`, `**`, listas, tablas, citas…). Para verla **renderizada** (encabezados, negritas y listas de verdad) instala el complemento gratuito **[Markdown Here Revival](https://addons.thunderbird.net/thunderbird/addon/markdown-here-revival/)** desde el gestor de complementos de Thunderbird: convierte el Markdown de la composición en HTML con un clic (o con su vista previa). Es opcional y complementario: sin él, la respuesta sigue llegando en Markdown legible; con él, queda maquetada.

> Nota: si acabas de recargar CoThunder durante el desarrollo y Markdown Here no responde en la ventana de composición, **reinicia Thunderbird** — recargar la extensión temporal puede dejar otros complementos en un estado inconsistente.

## Privacidad

El contenido de los correos solo viaja a **Microsoft 365 Copilot**, el mismo destino al que ya envías datos al usar Copilot. Sin telemetría, sin terceros, sin claves. Relevante para RGPD: el tratamiento por parte de Microsoft se rige por los acuerdos de tu organización. La ventana te muestra siempre el prompt antes de enviarlo.

## Releases automáticas

El `.xpi` se compila y publica solo con GitHub Actions (`.github/workflows/release.yml`):

- **Publicar una versión:** sube la versión en `manifest.json` (SemVer) y empuja una etiqueta `vX.Y.Z`. La acción valida, empaqueta `cothunder-<version>.xpi` y crea la Release con el `.xpi` adjunto.

  ```bash
  git tag v2.1.0
  git push origin v2.1.0
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

Cargar sin empaquetar: `about:debugging` → Este Thunderbird → Cargar complemento temporal → `manifest.json`.

# CoThunder

Extensión MailExtension para **Thunderbird 140+** que integra **Microsoft 365 Copilot** en el correo, usando tu sesión ya iniciada en la web de Copilot. **Sin API ni claves, sin telemetría.** Tiene dos funciones:

- **Preguntar a Copilot** (botón en el visor de un mensaje): lee el correo abierto, monta un prompt editable con su contenido y trae la respuesta de Copilot a una ventana de composición, maquetada en Markdown.
- **Crear desde Copilot** (botón en la barra principal): redacta un **correo nuevo desde cero** (asunto y cuerpo) a partir de tus indicaciones, sin necesidad de tener un correo abierto.

Manual de uso paso a paso: [docs/MANUAL.md](docs/MANUAL.md). Historial de cambios: [CHANGELOG.md](CHANGELOG.md). Seguridad: [informe de ciberseguridad](docs/INFORME-CIBERSEGURIDAD-2026-07-09.md).

## Características

### Comunes a los dos modos

- **Selector de agente**: *Copilot por defecto* o cualquiera de tus **agentes fijados en la barra lateral** de Copilot (por ejemplo un GPT especializado). Recuerda el último y tiene un botón **↻** para refrescar.
- **Selectores de Prompt y Formato** basados en tus **plantillas de Thunderbird** (carpeta *Plantillas*, de cualquier cuenta).
- **Tono** (formal, cercano, directo, negativa cordial) y **Longitud** (breve, normal, detallada).
- **Incluir mi firma** de la identidad de Thunderbird.
- **Respuesta maquetada en Markdown** siempre (saludo como encabezado, despedida en negrita, lo importante en cita, listas y tablas donde aportan).
- **Mini barra Markdown** sobre los editores de texto.
- **Regenerar**: pide otra versión en un chat nuevo.
- **Degradación segura**: si falla la escritura en Copilot, el prompt se copia al portapapeles; si no se captura la respuesta, salta una notificación.
- **Ventana redimensionable** que recuerda su tamaño por modo.
- **Aviso de tratamiento** la primera vez y **registro de actividad local opcional** (auditoría de metadatos, sin contenido).

### Preguntar a Copilot (respuesta)

- Prompt montado con remitente, asunto y cuerpo, limpio de CSS, espacios y caracteres invisibles.
- **Incluir el correo citado** y **Incluir el hilo** (mensajes anteriores, reconstruidos por las cabeceras `References`/`In-Reply-To`).
- Blindaje **anti-inyección** en el prompt y **detección local** de patrones sospechosos en el correo, con aviso.

### Crear desde Copilot (correo nuevo)

- Campo **¿Qué quieres crear?** (instrucción base), **Contexto / notas** e **Idioma** de salida.
- Destinatarios en tres cajas: **Para**, **CC** y **CCO**; cada una admite **varias direcciones**, una por línea o separadas por comas.
- Copilot genera **asunto y cuerpo**; se abre un correo nuevo con ambos, la firma y los destinatarios.
- **Prompts propios de creación** (plantillas con asunto `Prompt crear - ...`), que solo aparecen en este modo.

## Biblioteca de plantillas

Al instalar se siembra una colección de **Prompts** y **Formatos** de ejemplo en tu carpeta *Plantillas*, listos para usar. Distingues su tipo por el asunto:

- `Prompt - Título`: instrucción de respuesta (aparece en el selector *Prompt* del modo respuesta).
- `Prompt crear - Título`: instrucción de creación (aparece en el selector *Prompt* del modo creación).
- `Formato - Título`: estructura y formato de referencia (se comparte entre los dos modos).

Puedes crear las tuyas: redacta un mensaje (en Markdown si quieres), nómbralo con ese prefijo en el asunto y haz **Archivo → Guardar como plantilla**.

## Instalación

1. Descarga el `.xpi` más reciente desde la [página de Releases](../../releases).
2. En Thunderbird: **Herramientas → Complementos y temas → engranaje ⚙ → Instalar complemento desde archivo…** y elige el `.xpi`.
3. Pulsa un botón de CoThunder. La primera vez, inicia sesión en Copilot en la ventana que se abre.

Requiere **Thunderbird ESR 140 o superior**.

## Uso rápido

**Responder a un correo:** ábrelo, pulsa **Preguntar a Copilot** en la barra del visor, ajusta las opciones si quieres, y pulsa **Enviar a Copilot**. Cuando termine, se abre la respuesta lista para revisar y enviar.

**Crear un correo nuevo:** pulsa **Crear desde Copilot** en la barra principal, escribe qué quieres crear (y opcionalmente contexto, idioma y destinatarios), y pulsa **Enviar a Copilot**. Se abre un correo nuevo con el asunto y el cuerpo generados.

El paso a paso completo, con todos los campos, está en el [manual de uso](docs/MANUAL.md).

## Complemento recomendado: Markdown Here Revival

CoThunder pide la respuesta en **Markdown** y la vuelca tal cual en la composición. Para verla **renderizada** instala el complemento gratuito **[Markdown Here Revival](https://addons.thunderbird.net/thunderbird/addon/markdown-here-revival/)**: convierte el Markdown en HTML con un clic. Es opcional; sin él, la respuesta sigue llegando en Markdown legible.

## Privacidad y seguridad

El contenido de los correos solo viaja a **Microsoft 365 Copilot**, el mismo destino al que ya envías datos al usar Copilot. Sin telemetría, sin terceros, sin claves. La ventana te muestra siempre el prompt antes de enviarlo, y la primera vez avisa del tratamiento. Puedes activar un **registro de actividad local** (solo metadatos) desde Opciones.

Análisis detallado: [informe de ciberseguridad](docs/INFORME-CIBERSEGURIDAD-2026-07-09.md) (uso en la UPO y usuario general) y [auditoría técnica](docs/AUDITORIA-2026-07-09.md).

## Releases automáticas

El `.xpi` se compila y publica con GitHub Actions (`.github/workflows/release.yml`):

- **Publicar una versión:** sube la versión en `manifest.json` (SemVer) y empuja una etiqueta `vX.Y.Z`. La acción valida, empaqueta `cothunder-<version>.xpi` y crea la Release con el `.xpi` adjunto.

  ```bash
  git tag v2.3.0
  git push origin v2.3.0
  ```

- **Compilar sin publicar:** lanza el workflow *Release XPI* a mano desde la pestaña **Actions** (`workflow_dispatch`).

Cada push y pull request pasa además por el workflow `CI`, que valida el manifest y la sintaxis de los JS.

## Desarrollo

Extensión Manifest V3, JavaScript vanilla, sin dependencias en runtime (Node solo para validar y probar). La especificación completa está en [`spec/docs/ESPECIFICACION.md`](spec/docs/ESPECIFICACION.md).

```bash
# Validar sintaxis y manifest
for f in common.js background.js content-copilot.js popup/popup.js options/options.js; do node --check "$f"; done
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"

# Pruebas de la lógica pura
node --test
```

Cargar sin empaquetar: `about:debugging` → Este Thunderbird → Cargar complemento temporal → `manifest.json`.

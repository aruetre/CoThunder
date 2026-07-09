# Registro de cambios

Todas las mejoras y correcciones notables de CoThunder. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/); versionado [SemVer](https://semver.org/lang/es/).

## [2.3.1] — 2026-07-09

### Corregido
- **Captura de la respuesta**: se colaba la palabra «Markdown» de la cabecera del bloque de código al principio del correo y se **duplicaban los saltos de línea** (una línea en blanco entre cada fila de tabla y cada elemento de lista, rompiendo el formato). Ahora se extrae con `innerText` (el texto tal como se ve, con un salto por línea) y se quitan la etiqueta del bloque («Markdown») y el botón de copiar.

### Añadido
- **Título distintivo del chat de Copilot**: cada envío antepone una primera línea `AAAA_MM_DD_HH_MM Preguntar/Creacion: asunto`, para que Copilot no titule todos los chats resumiendo la guía anti-inyección («Seguridad»). Con un campo **🏷️ Título del chat** opcional; si se deja vacío, se usa el asunto (respuesta) o el brief (creación), siempre con la fecha por delante.

## [2.3.0] — 2026-07-09

### Añadido
- **Botón «Crear desde Copilot»** en la barra principal de Thunderbird: redacta un **correo nuevo desde cero** (no una respuesta), sin necesidad de tener un correo abierto. Convive con **«Preguntar a Copilot»** (del visor); cada botón mantiene su función. Reutiliza toda la tubería de Copilot y el mismo popup, parametrizado por modo (la ventana se rotula «Crear desde Copilot»).
- Campos propios del modo creación: **📝 ¿Qué quieres crear?** (instrucción base, que **crece con la ventana** y tiene su **propia mini barra Markdown**), **👤 Para / contexto** y **🌐 Idioma** de salida. Se ocultan «Incluir el correo citado» e «Incluir el hilo», que no aplican sin correo de origen.
- **Destinatarios múltiples** en tres cajas de texto apiladas — **✉️ Para**, **📋 CC** y **🕶️ CCO** —; cada una admite varias direcciones (una por línea o separadas por comas) y solo usa las válidas. Se fijan al abrir el correo (`beginNew`) para que se rellenen de forma fiable. El campo **👤 Contexto / notas** deja claro que sirve para enriquecer el prompt, no como destinatario.
- **Plantillas específicas de creación**: prompts con asunto **«Prompt crear - …»** (convocatoria, invitación, comunicado, solicitud, presentación, agradecimiento, felicitación, recordatorio, propuesta comercial, boletín) que aparecen solo en modo creación; los **«Formato - …»** se comparten entre modos. La biblioteca se siembra al instalar **y al actualizar** (idempotente por asunto).
- Copilot genera **asunto y cuerpo**; el correo nuevo se abre con ambos, la firma (si se marcó) y los destinatarios, en composición HTML. Tras enviar, **«Regenerar»** pide otra versión en la misma ventana.
- La ventana de creación **abre más alta** (≈620×760) para que quepan sus campos con holgura y **recuerda su tamaño por separado** de la de «Preguntar a Copilot».

### Seguridad
- **Aviso de tratamiento la primera vez**: la ventana informa de que el contenido del correo se envía a Microsoft 365 Copilot (RGPD/ENS) y recuerda la aceptación.
- **Registro de actividad local opcional** (auditoría): en Opciones se puede activar un registro de metadatos (fecha, modo, número de destinatarios), nunca el asunto, las direcciones ni el cuerpo; se puede exportar a JSON y vaciar.

### Cambiado
- Escapado HTML unificado en `escapeHtml`/`escapeHtmlWithBreaks` (deja de duplicarse la lógica en background y content script).
- `parseRecipients` admite el formato «Nombre <correo>» y elimina duplicados.
- La biblioteca de plantillas de ejemplo se siembra una sola vez por versión: una plantilla borrada ya no reaparece en cada actualización.
- Botones de la barra Markdown con `aria-label` para lectores de pantalla.

### Pruebas
- Suite de pruebas de la lógica pura con `node --test` (escapado, destinatarios, separación asunto/cuerpo, prompts y detección de inyección).

## [2.2.0] — 2026-07-09

### Añadido
- **Selectores de tono y longitud** en la ventana (formal / cercano / directo / negativa cordial y breve / normal / detallada); ajustan el prompt y recuerdan tu elección.
- **Casilla «Incluir mi firma»**: añade a la respuesta la firma configurada en tu identidad de Thunderbird.
- **Casilla «Incluir el correo citado»**: añade la cita del mensaje original, sin duplicar la firma.
- **Casilla «Incluir el hilo»**: reconstruye la conversación anterior (por las cabeceras `References`/`In-Reply-To`) y la aporta como contexto; también se revisa contra inyección.
- **La ventana recuerda su tamaño y posición** entre aperturas.
- **Botón «Regenerar»**: reenvía el prompt en un chat nuevo para obtener otra versión; tras enviar, la ventana ya no se cierra sola.
- **Prompts y Formatos separados** mediante el asunto de la plantilla: «Prompt - …» (instrucción prioritaria) y «Formato - …» (referencia de estructura); dos desplegables independientes.
- **Biblioteca de ejemplos** sembrada al instalar (varios Prompts y Formatos listos para usar), incluido un **Formato - Identidad UPO** adaptado a correo (estructura institucional y guía de marca: azul #003772 / amarillo #FCC100, tipografía Franklin Gothic o Arial).
- **Mini editor Markdown** sobre el prompt (negrita, cursiva, encabezado, listas, cita, código, enlace).
- **Rediseño de la ventana**: cabecera «Preguntar a Copilot» con logo y estado, campos con títulos e iconos, y botón de **ayuda** (guía de uso en Opciones).

### Seguridad
- **Píldora anti-inyección** en todos los prompts (con o sin Prompt seleccionado): el correo entrante se trata como **datos**, nunca como instrucciones; se ignora y avisa cualquier intento de cambiar el rol, anular indicaciones, revelar el *system prompt*, cambiar el objetivo o el formato, o plantear escenarios para saltarse límites.
- **Detección local** de patrones de inyección en el cuerpo del correo, con **aviso en la ventana** antes de enviar.

### Cambiado
- La respuesta conserva la **firma configurada del usuario** (se lee de la identidad de la respuesta).
- Ventana **compacta 600×560, centrada y redimensionable**, pensada para caber en 1080p y comportarse igual en pantallas de distinta resolución.
- El **prompt a enviar se separa en bloques** con una línea divisoria (seguridad, prompt, hilo, correo, formato, tono, Markdown) para localizarlos y editarlos con facilidad.
- **Botones «Enviar» y «Regenerar»** en color sólido (azul / verde teal) y con el texto en negrita.

### Corregido
- La **firma no aparecía**: al pasar `body` a `beginReply` se reemplazaba todo el contenido; ahora se compone respetando firma y cita.
- En pantallas de **alta densidad / escalado del SO al 125 %** la ventana se veía diminuta o se salía de pantalla.

## [2.1.0] — 2026-07-07

### Añadido
- **Desplegable de agentes**: lista los agentes fijados en la barra lateral de Copilot, recuerda el último usado y tiene un botón de refresco (↻).
- **Desplegable de plantillas**: usa las plantillas de las carpetas *Plantillas* de Thunderbird (cualquier cuenta); combina el correo original + la plantilla en Markdown + el conocimiento del agente.
- **Maquetación Markdown** de la respuesta, con un mínimo garantizado (saludo como encabezado, despedida en negrita, lo importante en cita) y el resto de elementos estándar según convenga.
- **Ventana de UI redimensionable** al pulsar el botón (en lugar de un panel limitado).
- **Logo oficial de Copilot** en el botón del visor.
- **Notificación** si no se puede capturar la respuesta o abrir la composición.

### Cambiado
- La respuesta se abre en **composición HTML**, conservando la barra de formato y los complementos (p. ej. *Markdown Here Revival*, que renderiza el Markdown).
- **Correlación por `messageId`** de ida y vuelta (en lugar de un único identificador): dos envíos simultáneos ya no cruzan la respuesta de correo.
- Permisos añadidos: `accountsRead` (carpetas/plantillas) y `notifications`.

### Corregido
- **Limpieza del cuerpo del correo**: se prioriza el HTML y se extrae solo el texto visible (sin CSS ni scripts), se eliminan los **caracteres invisibles** (zero-width, BOM, etc.) y las líneas en blanco sobrantes.
- **Escritura en Copilot** no duplicada (un único evento `beforeinput`) y robusta al cambiar de agente (reintenta y verifica que el texto entró).
- La instrucción de **Markdown se añade siempre**, al margen de la plantilla del prompt guardada (una plantilla antigua ya no anula el formato).
- El desplegable de agentes ya no incluye el **historial de chats** (se filtra por el id del agente) ni trata una lista vacía como éxito al refrescar.
- **CI/Release**: acciones actualizadas a v5 (Node 24), verificación de ficheros en bash, publicación idempotente de la Release y artefacto solo en ejecuciones manuales.

## [2.0.0] — 2026-07-06

Reescritura completa: de llamar a una API compatible OpenAI/Azure a **automatizar la web de Microsoft 365 Copilot** con la sesión ya iniciada del usuario. Sin API ni claves.

### Añadido
- Registro en runtime de un **content script** (API `scripting` de MV3) sobre el dominio de Copilot; el botón del visor abre Copilot dentro de Thunderbird, escribe el prompt en el editor Lexical y lo envía.
- **Popup del botón** con el prompt editable (instrucción + remitente, asunto y cuerpo) y opción de empezar un chat nuevo.
- **Captura de la respuesta** (fin del streaming) y apertura de una ventana de composición como respuesta al remitente.
- **Página de opciones** (URL del chat de Copilot y plantilla del prompt).
- **Degradación segura**: si la automatización falla, el prompt se copia al portapapeles y se avisa.
- **CI y release automática** con GitHub Actions (empaqueta el `.xpi` y publica la Release al etiquetar).

### Decisiones de plataforma
- **Manifest V3** con `browser_specific_settings.gecko` (no `applications`) y sin `persistent` (evita advertencias en Thunderbird 140).
- Se usa `messageDisplay.getDisplayedMessages` (plural), ya que el singular no existe en Thunderbird 140.
- No se incrusta Copilot en un iframe (Microsoft lo bloquea): se abre en ventana/pestaña propia con content script.

[2.3.1]: https://github.com/aruetre/CoThunder/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/aruetre/CoThunder/releases/tag/v2.3.0
[2.2.0]: https://github.com/aruetre/CoThunder/releases/tag/v2.2.0
[2.1.0]: https://github.com/aruetre/CoThunder/releases/tag/v2.1.0
[2.0.0]: https://github.com/aruetre/CoThunder/releases/tag/v2.0.0

# Qué hace CoThunder (v2.4)

Complemento para **Thunderbird 140+** que integra **Microsoft 365 Copilot** en el correo usando tu sesión ya iniciada. Sin API, sin claves, sin telemetría.

## En una frase

- Lee o redacta correos con ayuda de Copilot sin salir de Thunderbird, y trae la respuesta maquetada en Markdown a una ventana de composición.

## Dos botones, dos funciones

- **Preguntar a Copilot** (en el visor de un mensaje): responde al correo abierto.
- **Crear desde Copilot** (en la barra principal): redacta un correo nuevo desde cero, sin necesidad de tener un correo abierto.

## Al responder (Preguntar a Copilot)

- Monta un prompt editable con el remitente, el asunto y el cuerpo del correo, limpio de CSS, espacios y caracteres invisibles.
- Permite **incluir el correo citado** y **el hilo** (mensajes anteriores, reconstruidos por las cabeceras).
- Detecta intentos de **inyección** en el correo y añade una protección al prompt.
- Abre la respuesta como **contestación al remitente**, lista para revisar y enviar.

## Al crear (Crear desde Copilot)

- Campo **¿Qué quieres crear?** para describir el correo.
- Campos **Contexto / notas** e **Idioma** de salida.
- Destinatarios en tres cajas: **Para**, **CC** y **CCO**, cada una con varias direcciones (una por línea o por comas).
- Copilot genera **asunto y cuerpo**, y se abre un correo nuevo con ambos, la firma y los destinatarios.

## Funciones comunes a los dos modos

- **Agente**: usar Copilot por defecto o cualquier agente que tengas fijado en Copilot.
- **Prompt y Formato**: reutilizar tus plantillas de Thunderbird (con prefijos `Prompt -`, `Prompt crear -`, `Formato -`).
- **Tono** (formal, cercano, directo, negativa cordial) y **Longitud** (breve, normal, detallada).
- **Incluir mi firma** de la identidad de Thunderbird.
- **Respuesta maquetada en Markdown** siempre (encabezados, listas, tablas, citas).
- **Mini barra Markdown** sobre los editores de texto.
- **Regenerar**: pedir otra versión en un chat nuevo.
- **Título del chat de Copilot** distintivo (fecha, modo y asunto), con un campo opcional para personalizarlo.
- **Ventana redimensionable** que recuerda su tamaño por modo.
- **Degradación segura**: si algo falla, copia el prompt al portapapeles y avisa.

## Sobre ti (contexto del autor)

- Sección en **Opciones** con tu **nombre, puesto o cargo, organización, qué haces** y **cómo escribes** (tratamiento, tono, firma).
- Se añade al prompt en los dos modos para que Copilot adapte el tono, el rol y la firma a ti.
- Botón **Tomar de mi identidad de Thunderbird** para rellenar nombre, organización y firma con un clic.
- Se guarda solo en tu equipo y persiste entre sesiones.

## Biblioteca de plantillas

- Al instalar se crea una colección de **Prompts** y **Formatos** de ejemplo, listos para usar.
- Puedes crear los tuyos con **Guardar como plantilla** y nombrarlos por el asunto.

## Privacidad y seguridad

- El contenido solo viaja a **Microsoft 365 Copilot**, el mismo destino al que ya envías datos al usar Copilot.
- **Aviso de tratamiento** la primera vez y **registro de actividad local opcional** (solo metadatos, exportable y purgable).
- El HTML de los correos se procesa solo para extraer texto; sin `eval` ni contenido remoto en la interfaz.

## Requisitos

- **Thunderbird 140 o superior** y sesión iniciada en Microsoft 365 Copilot.
- Recomendado para ver el Markdown renderizado: el complemento **Markdown Here Revival**.

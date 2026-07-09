# Informe de seguridad de CoThunder

**Versión analizada:** 2.3.0 · **Fecha:** 2026-07-09
**Ámbito:** extensión MailExtension para Thunderbird 140+ que integra Microsoft 365 Copilot en el correo, con dos funciones: responder a un correo (**Preguntar a Copilot**) y crear un correo nuevo desde cero (**Crear desde Copilot**).
**Públicos:** uso institucional en la Universidad Pablo de Olavide (sector público, sujeto al ENS) y usuario general.

Este documento integra y sustituye a los informes previos (auditoría técnica e informe de ciberseguridad).

## 1. Resumen ejecutivo

CoThunder no usa API ni claves, no abre ningún destino de red propio y no incluye telemetría. El único dato que sale del equipo es el prompt (cuerpo del correo, o el brief de creación), que va al servicio web de Microsoft 365 Copilot, el mismo destino al que el usuario ya envía datos cuando usa Copilot manualmente. El HTML de los correos se procesa solo con `DOMParser` para extraer texto, no hay `eval`, `new Function` ni `innerHTML` con contenido remoto, y los permisos están acotados al dominio de Copilot. La superficie de ataque es pequeña.

La versión 2.3 añade tres controles relevantes: aviso de tratamiento la primera vez, registro de actividad local opcional (solo metadatos) y unificación del escapado HTML, además de pruebas automatizadas de la lógica pura.

Los puntos débiles no son fugas de datos, sino: gobierno del dato (el contenido sale hacia un servicio en la nube), fragilidad estructural (se automatiza una web no oficial cuyos selectores pueden cambiar) y dos medidas de despliegue pendientes que no dependen del código (firma del paquete y restricción al tenant corporativo).

Valoración: apto para uso interno controlado. Para despliegue amplio en la UPO conviene cerrar los pendientes de la sección 9.

## 2. Descripción y flujo de datos

1. El usuario pulsa **Preguntar a Copilot** (visor de un mensaje) o **Crear desde Copilot** (barra principal).
2. El popup lee el correo (solo en modo respuesta) con `messenger.messages.*` y compone un prompt editable.
3. El background mantiene una única ventana de Copilot y entrega el prompt al content script cargado en `m365.cloud.microsoft`.
4. El content script escribe en la web de Copilot, envía, espera a que la respuesta se estabilice y la devuelve.
5. El background abre una ventana de composición: respuesta al remitente (`beginReply`) o correo nuevo (`beginNew`).

**Dato que sale del equipo:** el prompt (contenido del correo o brief de creación). **Destino:** el servicio web de Copilot. No hay ningún otro destino. Se apoya en la sesión ya autenticada del usuario; no se almacenan credenciales ni tokens.

## 3. Controles de seguridad implementados

| Control | Estado | Dónde |
|---|---|---|
| Sin API, sin claves, sin telemetría | Sí | Todo el proyecto |
| Sin destino de red propio (verificado: no hay `fetch`, `XMLHttpRequest`, `WebSocket`) | Sí | Todo el proyecto |
| HTML de correos tratado solo con `DOMParser` | Sí | `common.js` (`htmlToText`) |
| Sin `eval`/`new Function`/`innerHTML` remoto (verificado) | Sí | Todo el proyecto |
| Escapado HTML unificado | Sí (v2.3) | `common.js` (`escapeHtml`) |
| Permisos acotados; host permission solo de Copilot | Sí | `manifest.json` |
| Blindaje anti-inyección en el prompt + detección local | Sí | `common.js` (`INJECTION_GUARD`, `detectInjection`) |
| Degradación segura al portapapeles y notificación | Sí | `popup/popup.js`, `background.js` |
| Aviso de tratamiento la primera vez | Sí (v2.3) | `popup/` (`privacyAck`) |
| Registro de actividad local opcional (solo metadatos) | Sí (v2.3) | `background.js` (`logActivity`), Opciones |
| Correlación por token (no cruza respuestas) | Sí | `background.js`, `content-copilot.js` |
| Pruebas automatizadas de la lógica pura | Sí (v2.3) | `test/` (`node --test`) |
| Firma del paquete (XPI) | Pendiente (infraestructura) | Publicación |

## 4. Análisis por áreas

### 4.1 Flujo de datos y RGPD

- Sin telemetría, sin terceros, sin claves. El contenido solo llega a Copilot.
- Minimización parcial: el cuerpo se trunca a 12.000 caracteres y el hilo a 10 mensajes de 2.000.
- Aviso de tratamiento la primera vez (cubre el mínimo informativo); conviene enlazar la política de uso de IA de la organización.
- Registro de actividad opcional para acreditar el tratamiento sin guardar contenido.
- El **perfil del usuario** («Sobre ti», v2.4) se guarda solo en `storage.local` y viaja a Copilot como parte del prompt. Al ser información del propio usuario (el mismo en Thunderbird y en Copilot), no introduce una categoría nueva de dato de terceros.

### 4.2 Inyección de prompts

- Defensa en profundidad: píldora anti-inyección añadida siempre al prompt y detección local por patrones con aviso en la ventana.
- Límite real: la detección es por expresiones regulares y es eludible; la píldora instruye a Copilot para tratar el correo como datos, pero el texto inyectado viaja dentro del prompt. Es mitigación, no garantía. Riesgo residual aceptado y documentado.
- En modo creación el contenido es del propio usuario, así que el riesgo de inyección externa es menor.

### 4.3 Tratamiento de HTML y XSS

- El HTML de los correos se procesa solo con `DOMParser` para extraer texto; se eliminan `script`, `style`, `head`, etc.
- El texto de la respuesta de Copilot y las firmas en texto plano se escapan con `escapeHtml`/`escapeHtmlWithBreaks` antes de construir el cuerpo HTML de la composición.
- Sin `eval`, `new Function` ni `innerHTML` con contenido remoto (verificado). El único `innerHTML` es de lectura sobre el cuerpo que la propia Thunderbird genera para la cita, y se pasa como cadena a la API de composición, no al DOM de la extensión.

### 4.4 Permisos

- `accountsRead`, `messagesRead`, `messagesImport`, `compose`, `storage`, `scripting`, `notifications` y `host_permissions` solo para `*://m365.cloud.microsoft/*`. Acotados y justificados.
- `messagesImport` se usa solo para sembrar la biblioteca de plantillas de ejemplo; es un permiso potente y conviene documentar su motivo.

### 4.5 Almacenamiento

- No se almacenan secretos. `storage.local` guarda preferencias, plantilla base, agentes, tamaños de ventana, el marcador de siembra y (si se activa) el registro de auditoría. `storage.session` guarda las opciones de composición por token, efímeras.
- La correlación por token evita cruzar respuestas entre correos.

### 4.6 Dependencia del DOM de Copilot

- Toda la fragilidad está centralizada en `content-copilot.js` (objeto `SELECTORS`). Es la decisión correcta, pero sigue siendo un punto único de fallo: si Microsoft cambia la interfaz, deja de funcionar hasta actualizar selectores. Existe degradación al portapapeles, pero no aviso proactivo ni versión de selectores.

## 5. Cumplimiento ENS (uso en la UPO)

### 5.1 Por dimensiones

- **Confidencialidad (C):** el contenido va a Copilot; la garantía depende de que el tenant M365 de la UPO esté dentro del marco contractual. Sin secretos en el complemento.
- **Integridad (I):** el riesgo está en la fragilidad de automatizar una web no oficial, no en manipulación de datos; la respuesta se escapa antes de componer.
- **Autenticidad (A):** se apoya en la sesión ya autenticada del usuario; sin gestión de credenciales.
- **Trazabilidad (T):** cubierta de forma opcional con el registro local de metadatos (fecha, modo, número de destinatarios, resultado), exportable y purgable. No guarda contenido.
- **Disponibilidad (D):** dependiente de la web de Copilot; mitigada con degradación al portapapeles y notificación.

### 5.2 Medidas relevantes

- **mp.sw (desarrollo seguro):** código vanilla, sin dependencias en runtime, con pruebas automatizadas de la lógica pura y especificación como fuente de verdad.
- **op.exp.8 (registro de actividad):** registro local opcional para acreditar el tratamiento.
- **mp.com (protección de comunicaciones):** TLS gestionado por el navegador hacia `m365.cloud.microsoft`; sin endpoints propios.
- **op.acc (control de acceso):** sin credenciales propias; hereda la sesión del usuario.

### 5.3 Recomendaciones de despliegue

1. **Firmar el XPI** (AMO o firma propia) y distribuirlo por un canal controlado, en vez de carga temporal.
2. **Restringir a cuentas del tenant** corporativo de la UPO y documentarlo en la política de uso.
3. **Activar el registro de actividad** donde se requiera trazabilidad, con retención y purga definidas.
4. **Formar** a los usuarios sobre qué no enviar (datos especialmente protegidos) y sobre el aviso de tratamiento.
5. **Vigilar** la fragilidad de la automatización: un cambio de la interfaz de Copilot puede dejarlo inoperativo hasta actualizar selectores.

## 6. Guía para el usuario general

**Qué hace con tus datos:** envía el contenido del correo (o lo que escribes en «¿Qué quieres crear?») a Microsoft 365 Copilot usando tu sesión. No lo manda a ningún otro sitio; no hay servidores del complemento ni estadísticas. Solo actúa en el dominio de Copilot.

**Qué NO hace:** no guarda tus correos fuera de tu equipo, no pide ni almacena contraseñas ni claves, no usa `eval` ni inyecta HTML remoto en su interfaz, no incluye rastreadores.

**Buenas prácticas:**

- Ten en cuenta que el texto que envías lo procesa un servicio en la nube: evita pegar datos muy sensibles si no quieres que salgan de tu equipo.
- Revisa siempre el correo generado antes de enviarlo; la IA puede equivocarse o inventar datos.
- Mantén Thunderbird y el complemento actualizados.
- Si te preocupa el rastro local, deja el registro de actividad desactivado (viene apagado) o vacíalo desde Opciones.

## 7. Deuda técnica y calidad

- **Resuelto en v2.3:** escapado HTML unificado (`escapeHtml`), `parseRecipients` endurecido (formato «Nombre <correo>» y deduplicación), siembra de plantillas una sola vez por versión (`seededVersion`, ya no reaparecen las borradas) y pruebas automatizadas con `node --test`.
- **Pendiente:** recuperación de selectores con aviso accionable (distinguir «sesión no iniciada» de «interfaz cambiada»); internacionalización con `_locales`; centralización de números mágicos (timeouts y esperas).

## 8. Riesgos residuales

| Riesgo | Impacto | Mitigación actual | Acción recomendada |
|---|---|---|---|
| Contenido sensible enviado a la nube | Medio | Aviso de tratamiento, minimización, sesión propia | Uso en tenant corporativo (UPO); criterio del usuario (general) |
| Inyección de prompt desde un correo | Medio | Blindaje en el prompt y detección local | Mantener defensa en profundidad; formación |
| Rotura por cambio de la web de Copilot | Alto (disponibilidad) | Selectores centralizados, degradación al portapapeles | Recuperación de selectores y aviso accionable |
| Paquete sin firmar en equipos gestionados | Medio | Carga temporal | Firma del XPI (UPO) |
| Falta de trazabilidad si no se activa | Medio (ENS) | Registro opcional disponible | Activarlo donde se requiera |

## 9. Pendientes (no dependen del código)

- **Firma del XPI** para instalación permanente en equipos gestionados.
- **Restricción al tenant corporativo** de la UPO, por política y, si procede, técnicamente.

## 10. Conclusión

Para el **usuario general**, CoThunder es de bajo riesgo: no exfiltra datos a terceros, no guarda secretos y limita su alcance al dominio de Copilot; el único cuidado es el propio de usar un asistente en la nube. Para la **UPO**, es apto para uso interno controlado si se restringe al tenant corporativo, se activa la trazabilidad donde proceda y se distribuye firmado. En su parte de código, la seguridad está en buen estado; las medidas pendientes son de despliegue.

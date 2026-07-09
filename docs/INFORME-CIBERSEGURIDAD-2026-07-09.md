# Informe de ciberseguridad de CoThunder

**Fecha:** 2026-07-09 · **Versión:** 2.3.0 · **Ámbito:** extensión MailExtension para Thunderbird 140+ que envía el correo abierto (o un brief de creación) a Microsoft 365 Copilot automatizando su interfaz web.
**Dos públicos:** (A) uso institucional en la Universidad Pablo de Olavide (sector público, sujeto al ENS), y (B) usuario general.

## Resumen ejecutivo

CoThunder no usa API ni claves, no abre ningún destino de red propio y no incluye telemetría. El único dato que sale del equipo es el prompt (que contiene el cuerpo del correo o el brief), y va al servicio web de Microsoft 365 Copilot, el mismo destino al que el usuario ya envía datos cuando usa Copilot manualmente. El HTML de los correos se procesa solo con `DOMParser` para extraer texto, y no hay `eval`, `new Function` ni `innerHTML` con contenido remoto. La superficie de ataque es pequeña.

En la versión 2.3 se han añadido tres controles relevantes: aviso de tratamiento la primera vez, registro de actividad local opcional (solo metadatos) y unificación del escapado HTML. Quedan pendientes dos medidas que dependen de infraestructura y no de código: la firma del paquete y la validación de que el uso se limite al tenant corporativo.

Para el usuario general el riesgo principal es el propio de enviar texto a un asistente en la nube. Para la UPO, el foco está en gobierno del dato, trazabilidad y despliegue controlado.

## 1. Modelo de amenazas y flujo de datos

**Qué datos se mueven:** el prompt (cuerpo del correo o brief, con el asunto y el remitente en modo respuesta) y, de vuelta, el texto que genera Copilot.

**Por dónde:** popup y background leen el correo con `messenger.messages.*`, el background entrega el prompt al content script cargado en `m365.cloud.microsoft`, este lo escribe en la web de Copilot y devuelve la respuesta, que abre una ventana de composición.

**Confianza:** se apoya en la sesión que el usuario ya tiene iniciada en Copilot. No se almacenan credenciales ni tokens.

**Fronteras de confianza:**
- Contenido del correo entrante: se trata como datos no confiables (posible inyección de prompt).
- Web de Copilot: se automatiza su DOM; su respuesta se escapa antes de componer el correo.
- Almacenamiento local del complemento: preferencias y, si se activa, metadatos de auditoría.

## 2. Controles de seguridad implementados

| Control | Estado | Dónde |
|---|---|---|
| Sin API, sin claves, sin telemetría | Sí | Todo el proyecto |
| Sin destino de red propio (solo Copilot) | Sí (verificado: no hay `fetch`, `XMLHttpRequest`, `WebSocket`) | Todo el proyecto |
| HTML de correos tratado solo con `DOMParser` | Sí | `common.js` (`htmlToText`) |
| Sin `eval`/`new Function`/`innerHTML` remoto | Sí (verificado) | Todo el proyecto |
| Escapado HTML unificado | Sí (v2.3) | `common.js` (`escapeHtml`) |
| Permisos acotados y host permission solo de Copilot | Sí | `manifest.json` |
| Blindaje anti-inyección en el prompt + detección local | Sí | `common.js` (`INJECTION_GUARD`, `detectInjection`) |
| Degradación segura al portapapeles si falla | Sí | `popup/popup.js`, `background.js` |
| Aviso de tratamiento la primera vez | Sí (v2.3) | `popup/` (`privacyAck`) |
| Registro de actividad local opcional (solo metadatos) | Sí (v2.3) | `background.js` (`logActivity`), Opciones |
| Correlación por token (no cruza respuestas) | Sí | `background.js`, `content-copilot.js` |
| Firma del paquete (XPI) | Pendiente (infra) | Publicación |

## 3. Sección A: uso institucional en la UPO (ENS)

### 3.1 Gobierno del dato y RGPD

El complemento no crea un canal nuevo: reutiliza el destino Copilot al que el usuario ya envía datos. Aun así, traslada contenido que puede incluir datos personales o categorías especiales. Recomendaciones:

- Usarlo solo con cuentas del **tenant corporativo de M365** de la UPO, cubierto por el contrato y las garantías de tratamiento con Microsoft.
- Informar a los usuarios (el aviso de tratamiento de la primera vez cubre el mínimo) y enlazar la política de uso de IA de la universidad.
- Minimización: el cuerpo se trunca a 12.000 caracteres y el hilo a 10 mensajes; conviene evitar enviar correos con datos especialmente sensibles.

### 3.2 Mapeo ENS por dimensiones

- **Confidencialidad (C):** el contenido va a Copilot; la garantía depende del marco contractual del tenant. Sin secretos almacenados en el complemento.
- **Integridad (I):** el riesgo está en la fragilidad de automatizar una web no oficial, no en manipulación de datos. La respuesta se escapa antes de componer.
- **Autenticidad (A):** se apoya en la sesión ya autenticada del usuario; no hay gestión de credenciales.
- **Trazabilidad (T):** cubierta de forma opcional con el registro local de metadatos (fecha, modo, número de destinatarios, resultado), exportable y purgable. No guarda contenido.
- **Disponibilidad (D):** dependiente de que la web de Copilot no cambie; mitigada con degradación al portapapeles y notificación.

### 3.3 Medidas ENS relevantes

- **op.exp.1 (inventario) y mp.sw (desarrollo seguro):** código vanilla, sin dependencias en runtime, con pruebas automatizadas de la lógica pura (`node --test`) y especificación como fuente de verdad.
- **op.mon / registro (op.exp.8):** registro local opcional de actividad para acreditar el tratamiento.
- **mp.com (protección de comunicaciones):** TLS gestionado por el navegador hacia `m365.cloud.microsoft`; sin endpoints propios.
- **op.acc (control de acceso):** sin credenciales propias; hereda la sesión del usuario.
- **Pendiente:** firma del paquete e implantación mediante un canal controlado (equipos gestionados).

### 3.4 Recomendaciones de despliegue para la UPO

1. **Firmar el XPI** (AMO o firma propia) y distribuirlo por un canal controlado, en vez de carga temporal.
2. **Restringir a cuentas del tenant** corporativo y documentarlo en la política de uso.
3. **Activar el registro de actividad** en los perfiles donde se requiera trazabilidad, y definir su retención y purga.
4. **Formar** a los usuarios sobre qué no enviar (datos especialmente protegidos) y sobre el aviso de tratamiento.
5. **Vigilar** la fragilidad de la automatización: prever que un cambio de la interfaz de Copilot puede dejarlo inoperativo hasta actualizar selectores.

## 4. Sección B: usuario general

### 4.1 Qué hace con tus datos

- Envía el contenido del correo (o lo que escribes en «¿Qué quieres crear?») a Microsoft 365 Copilot, usando tu sesión ya iniciada.
- No manda tus datos a ningún otro sitio. No hay servidores del complemento ni estadísticas.
- Solo funciona en el dominio de Copilot (`m365.cloud.microsoft`); no puede actuar en otras webs.

### 4.2 Qué NO hace

- No guarda tus correos fuera de tu equipo.
- No pide ni almacena contraseñas ni claves de API.
- No usa `eval` ni inyecta HTML de origen remoto en su propia interfaz.
- No incluye rastreadores ni publicidad.

### 4.3 Buenas prácticas de uso

- Ten en cuenta que el texto que envías lo procesa un servicio en la nube: evita pegar datos muy sensibles (contraseñas, números de tarjeta, datos de salud) si no quieres que salgan de tu equipo.
- Revisa siempre el correo generado antes de enviarlo; la IA puede equivocarse o inventar datos.
- Mantén Thunderbird y el complemento actualizados.
- Si te preocupa el rastro local, puedes dejar el registro de actividad desactivado (viene apagado por defecto) o vaciarlo desde Opciones.

### 4.4 Riesgos a conocer

- **Inyección de prompt:** un correo malicioso puede intentar dar instrucciones a la IA. El complemento añade una protección en el prompt y avisa si detecta patrones sospechosos, pero no es infalible; desconfía de respuestas raras a correos sospechosos.
- **Dependencia de la web de Copilot:** si Microsoft cambia su interfaz, la automatización puede fallar; en ese caso el prompt se copia al portapapeles y se avisa.

## 5. Riesgos residuales

| Riesgo | Impacto | Mitigación actual | Acción recomendada |
|---|---|---|---|
| Contenido sensible enviado a la nube | Medio | Aviso de tratamiento, minimización, uso de sesión propia | Uso en tenant corporativo (UPO); criterio del usuario (general) |
| Inyección de prompt desde un correo | Medio | Blindaje en el prompt y detección local | Mantener defensa en profundidad; formación |
| Rotura por cambio de la web de Copilot | Alto (disponibilidad) | Selectores centralizados, degradación al portapapeles | Recuperación de selectores y aviso accionable |
| Paquete sin firmar en equipos gestionados | Medio | Carga temporal | Firma del XPI (UPO) |
| Falta de trazabilidad si no se activa | Medio (ENS) | Registro opcional disponible | Activarlo donde se requiera |

## 6. Conclusión

Para el **usuario general**, CoThunder es de bajo riesgo: no exfiltra datos a terceros, no guarda secretos y limita su alcance al dominio de Copilot; el único cuidado es el propio de usar un asistente en la nube. Para la **UPO**, el complemento es apto para uso interno controlado si se restringe al tenant corporativo, se activa la trazabilidad donde proceda y se distribuye firmado. Las dos medidas pendientes (firma del paquete y control del tenant) dependen de decisiones de despliegue, no del código, que en su parte de seguridad está en buen estado.

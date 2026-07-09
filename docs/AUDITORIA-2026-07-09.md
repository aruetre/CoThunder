# Auditoría de CoThunder: seguridad, deuda técnica y mejoras

**Fecha:** 2026-07-09 · **Versión analizada:** 2.3.0 · **Rama:** `cothunder-v2.3`
**Enfoque:** revisión en clave ENS (Esquema Nacional de Seguridad, RD 311/2022), por tratarse de una herramienta para un organismo público (Universidad Pablo de Olavide).
**Alcance:** todo el complemento (`manifest.json`, `common.js`, `background.js`, `content-copilot.js`, `popup/`, `options/`).

## Resumen ejecutivo

CoThunder tiene un diseño de seguridad razonable para su propósito: no usa claves ni API, no abre ningún destino de red propio, trata el HTML de los correos solo con `DOMParser`, no emplea `eval`/`innerHTML` con contenido remoto y degrada al portapapeles si la automatización falla. La superficie de ataque es pequeña y los permisos están acotados al dominio de Copilot.

Los puntos débiles no son fugas de datos, sino tres familias: (1) **gobierno del dato**, el cuerpo de los correos sale de Thunderbird hacia M365 Copilot sin aviso ni registro de auditoría (relevante para RGPD y para la dimensión de Trazabilidad del ENS); (2) **fragilidad estructural**, todo depende de automatizar una web no oficial cuyos selectores pueden cambiar sin aviso; (3) **deuda técnica**, ausencia de pruebas automatizadas, lógica de escapado duplicada y siembra de plantillas que reaparecen tras borrarlas.

Ninguno es bloqueante para uso interno controlado. Para despliegue a escala en la UPO conviene abordar los P0 de la sección de roadmap.

## 1. Arquitectura y flujo de datos

1. El usuario abre un correo y pulsa "Preguntar a Copilot", o pulsa "Crear desde Copilot" en la barra principal.
2. El popup (`popup/`) lee el correo (solo en modo respuesta) con `messenger.messages.*`, compone un prompt editable y lo envía al background.
3. El background (`background.js`) mantiene una única ventana de Copilot y entrega el prompt al content script (`content-copilot.js`) con reintentos.
4. El content script escribe en el editor Lexical de Copilot, envía, espera a que la respuesta se estabilice (`waitForReply`) y devuelve el texto.
5. El background abre una ventana de composición (respuesta con `beginReply`, o correo nuevo con `beginNew`).

**Dato que sale del equipo:** el prompt (que incluye el cuerpo del correo o el brief del usuario) viaja al servicio web de M365 Copilot, el mismo destino al que el usuario ya envía datos cuando usa Copilot manualmente. No hay ningún otro destino.

## 2. Seguridad

### 2.1 Flujo de datos y privacidad (RGPD)

- **Correcto:** sin telemetría, sin terceros, sin claves. El contenido solo llega a Copilot.
- **Correcto:** minimización parcial, el cuerpo se trunca a 12.000 caracteres (`MAX_BODY` en `common.js:107`) y el hilo a 10 mensajes de 2.000 caracteres.
- **Débil:** no hay **aviso de tratamiento** la primera vez. El usuario debería confirmar de forma explícita que el cuerpo del correo (que puede contener datos personales o categorías especiales) se envía a un servicio en la nube. Hoy es implícito.
- **Débil:** el contenido enviado no queda registrado en ningún sitio del lado del complemento, lo que dificulta acreditar qué se trató y cuándo.

### 2.2 Mapeo ENS (por dimensiones)

- **Confidencialidad (C):** el complemento no introduce un canal nuevo, pero traslada contenido potencialmente sensible a M365 Copilot. La cobertura depende de que el tenant de M365 de la UPO esté dentro del marco contractual y de conformidad adecuado. Recomendación: documentar esta dependencia y restringir su uso a cuentas del tenant corporativo.
- **Trazabilidad (T):** **carencia principal.** No existe registro de actividad (qué correo, qué asunto, qué destino, cuándo). Para nivel medio/alto el ENS exige trazabilidad. Recomendación: registro local opcional (metadatos, no cuerpos).
- **Autenticidad (A) e Integridad (I):** se apoya en la sesión ya autenticada del usuario en Copilot, no almacena credenciales ni tokens (bien). El riesgo de integridad está en la fragilidad de la automatización, no en manipulación de datos.
- **Disponibilidad (D):** dependiente de que la web de Copilot no cambie. Mitigado con degradación al portapapeles y notificación, pero sin recuperación automática de selectores.
- **op.exp / mp.sw (ciclo de vida del software):** el XPI se genera sin firmar (carga temporal). Para instalación permanente en equipos gestionados hace falta firma (AMO o firma propia) y un canal de actualización controlado.

### 2.3 Inyección de prompts

- **Defensa en profundidad presente:** píldora anti-inyección añadida siempre al prompt (`INJECTION_GUARD`, `common.js:25`) y detección local por patrones (`detectInjection`, `common.js:46`) con aviso en la ventana.
- **Límite real:** la detección es por expresiones regulares y es eludible; la píldora instruye a Copilot para tratar el correo como datos, pero el texto inyectado viaja dentro del prompt. Es mitigación, no garantía. Debe documentarse como riesgo residual aceptado.
- **Bien:** en modo creación el contenido es del propio usuario, así que el riesgo de inyección externa es menor.

### 2.4 Tratamiento de HTML y XSS

- **Correcto:** el HTML de los correos se procesa solo con `DOMParser` para extraer texto (`htmlToText`, `common.js:126`); se eliminan `script`, `style`, `head`, etc.
- **Correcto:** el texto de la respuesta de Copilot se escapa antes de construir el cuerpo HTML de la composición (`background.js`).
- **Sin `eval` ni `new Function` ni `innerHTML` con contenido remoto** (verificado con grep). El único `innerHTML` es de lectura sobre el cuerpo que la propia Thunderbird genera para la cita, y se pasa como cadena a la API de composición, no al DOM de la extensión.
- **Nota menor:** la firma en formato HTML de la identidad se inserta tal cual (es configuración propia del usuario, de confianza).

### 2.5 Permisos

- `accountsRead`, `messagesRead`, `messagesImport`, `compose`, `storage`, `scripting`, `notifications` y `host_permissions` solo para `*://m365.cloud.microsoft/*`. Acotados y justificados.
- **A revisar:** `messagesImport` se usa solo para sembrar la biblioteca de plantillas. Es un permiso potente (escribe mensajes). Conviene documentar por qué se mantiene y valorar si compensa frente al valor de la biblioteca sembrada.

### 2.6 Almacenamiento y secretos

- No se almacenan secretos. `storage.local` guarda preferencias, plantilla base, agentes y tamaños de ventana. `storage.session` guarda las opciones de composición por token, efímeras.
- **Correcto:** el token de correlación evita cruzar respuestas entre correos.

### 2.7 Dependencia del DOM de Copilot

- Toda la fragilidad está centralizada en `content-copilot.js` (objeto `SELECTORS`), lo que es la decisión correcta. Aun así es un punto único de fallo: si Microsoft cambia la interfaz, deja de funcionar hasta actualizar selectores. La degradación existe, pero no hay aviso proactivo ni versión de selectores.

## 3. Deuda técnica

1. **Sin pruebas automatizadas en el repo.** La lógica pura (`buildPrompt`, `buildComposedPrompt`, `buildCreatePrompt`, `parseCreateReply`, `parseRecipients`, `detectInjection`) es perfectamente testeable, pero hoy solo se valida con `node --check` y aserciones ad hoc que no quedan en el repositorio.
2. **Escapado HTML duplicado.** La cadena `.replace(/&/g, "&amp;")...` aparece varias veces en `background.js` y en `content-copilot.js`. Debería extraerse a un `escapeHtml()` en `common.js`.
3. **Siembra de plantillas al actualizar.** `seedTemplates` es idempotente por asunto, así que una plantilla que el usuario borra reaparece en la siguiente actualización. Conviene un marcador de versión de siembra en `storage.local` para no re-sembrar lo borrado.
4. **Números mágicos dispersos.** Timeouts (30.000, 120.000), esperas (300, 500, 800, 1.500 ms) y tamaños de ventana están repartidos. Centralizarlos facilitaría el ajuste.
5. **Internacionalización.** Todos los textos de UI están fijados en español. No se usa `_locales`. Es deuda solo si se plantea distribución fuera del ámbito hispanohablante.
6. **Gestión de una sola ventana de Copilot.** Si el usuario abre varias pestañas del dominio, la lógica de `copilotTabId` puede quedar desincronizada. Es un caso poco frecuente, pero conviene endurecerlo.
7. **Validación de destinatarios básica.** `parseRecipients` acepta direcciones simples, pero no el formato "Nombre Apellido <correo>" ni deduplica. Suficiente hoy, mejorable.

## 4. Robustez y manejo de errores

- **Bien:** reintentos en la entrega al content script (`deliverWithRetry`, 30 s) y espera con estabilización de la respuesta (`waitForReply`, 120 s).
- **Bien:** degradación al portapapeles y notificación cuando falla el envío o la captura.
- **Bien:** los `await` que pueden fallar están dentro de `try/catch` con mensajes en español.
- **A mejorar:** cuando la captura falla, la notificación es informativa pero no accionable (no reintenta ni ofrece reabrir Copilot). El fallo de selectores no distingue "sesión no iniciada" de "interfaz cambiada".

## 5. Calidad y mantenibilidad

- **Bien:** `common.js` como pieza compartida evita duplicar lógica entre popup y background. `"use strict"` en todos los ficheros. Sin frameworks ni dependencias en runtime.
- **Bien:** especificación como fuente de verdad, mantenida en sincronía con el código en el mismo commit.
- **A mejorar:** extraer la lógica pura a un módulo con pruebas; unificar el escapado; centralizar constantes de tiempo.

## 6. Accesibilidad e i18n

- Los botones de la barra Markdown usan símbolos con `title`, pero convendría revisar el foco y las etiquetas ARIA para lectores de pantalla.
- Textos solo en español (ver punto 5 de deuda técnica).

## 7. Roadmap de mejoras (priorizado)

### P0 (seguridad y cumplimiento, antes de despliegue amplio)

- **Aviso de tratamiento la primera vez:** banner o diálogo de consentimiento que explique que el contenido del correo se envía a M365 Copilot, con enlace a la política. Cubre RGPD y refuerza el ENS.
- **Trazabilidad opcional (ENS):** registro local de metadatos por envío (fecha, asunto, modo, destino Copilot, resultado), sin cuerpos, exportable y purgable. Configurable en Opciones.
- **Firma del XPI:** firmar el paquete (AMO o firma propia) para instalación permanente en equipos gestionados, con canal de actualización controlado.
- **Restricción a tenant corporativo:** documentar (y, si procede, validar) que solo se use con cuentas del tenant M365 de la UPO.

### P1 (deuda técnica)

- **Pruebas automatizadas:** extraer la lógica pura y añadir `node --test` en CI para `buildPrompt`, `parseCreateReply`, `parseRecipients`, `detectInjection`, etc.
- **`escapeHtml()` común:** unificar el escapado duplicado en `common.js`.
- **Marcador de versión de siembra:** evitar re-sembrar plantillas borradas por el usuario.
- **Recuperación de selectores:** distinguir "sesión no iniciada" de "interfaz cambiada" y ofrecer una notificación accionable; considerar un conjunto de selectores con fallback.

### P2 (producto y UX)

- **Internacionalización** con `_locales`.
- **Vista previa** del correo generado antes de abrir la composición.
- **Historial** de prompts y mejor gestión de plantillas por cuenta.
- **Endurecer `parseRecipients`** (formato con nombre, deduplicación) y revisar accesibilidad de la barra Markdown.
- **Limpieza de estilo:** retirar los guiones largos de los textos de UI y documentación (preferencia de estilo del proyecto).

## 8. Matriz de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación actual | Acción propuesta |
|---|---|---|---|---|
| Cambio de la interfaz de Copilot rompe la automatización | Alta | Alto | Selectores centralizados, degradación al portapapeles | Recuperación de selectores, aviso accionable (P1) |
| Falta de trazabilidad para auditoría ENS | Media | Medio | Ninguna | Registro local de metadatos (P0) |
| Envío de datos personales sin aviso explícito | Media | Medio | Documentación en Opciones | Consentimiento la primera vez (P0) |
| Inyección de prompt desde un correo | Baja | Medio | Píldora anti-inyección y detección local | Documentar riesgo residual, mantener defensa en profundidad |
| Regresión sin pruebas automatizadas | Media | Medio | `node --check` y prueba manual | Suite `node --test` en CI (P1) |
| Plantilla borrada reaparece al actualizar | Alta | Bajo | Ninguna | Marcador de versión de siembra (P1) |
| XPI sin firmar en equipos gestionados | Media | Medio | Carga temporal | Firma del paquete (P0) |

## Conclusión

El complemento es sólido en lo esencial de seguridad (superficie mínima, sin secretos, sin red propia, HTML tratado con `DOMParser`). Para un uso institucional conforme a ENS, las prioridades son el aviso de tratamiento, la trazabilidad local y la firma del paquete. En paralelo, saldar la deuda técnica (pruebas automatizadas y unificación del escapado) reduce el riesgo de regresión a medida que crece la funcionalidad de creación.

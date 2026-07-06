# CoThunder — Progreso SDD

Plan: docs/superpowers/plans/2026-07-06-cothunder-copilot-web.md
Rama: cothunder-copilot-web
Base de rama: 73d204c (tras Initial commit ddc4015)

## Ledger

- Task 0.1: complete (commits eae3f70..56b2b33, review clean). Verificado en TB 140.11.1: botón y log OK. Dos advertencias MV3 (applications, persistent) corregidas en 57229f0; docs alineadas en 92c7705. Reconfirmado por el usuario: recarga sin advertencias, background "En ejecución".
- Task 0.2: complete (commits 92c7705..b463041, review clean) + VERIFICADA en TB 140.11.1. Spike bloqueante RESUELTO EN VERDE: scripting.registerContentScripts funciona, el content script se inyecta en el chat de Copilot, tabs.create abre URL externa. URL real del chat: https://m365.cloud.microsoft/chat/. Instrumentación de spike (contentAlive) en 13007c5 — retirar en Task 0.3/1.3. Nota: el content script se inyectó 2× (la página redirige al cargar); manejadores idempotentes en 0.3.
- Task 0.3: complete + VERIFICADA por el usuario (commits ...71e4c0f/16f0d6d/3beb954). FASE 0 CERRADA EN VERDE. Selectores: editor #m365-chat-editor-target-element, enviar button.fai-SendButton, nuevo chat [data-testid=newChatButton]. Escritura: único beforeinput insertText (dos eventos duplican). content-copilot.js ya tiene typeIntoEditor/clickSend/startNewChat/SELECTORS reales; falta selector de respuesta (fase 2). Código de spike (contentAlive, spikeSend) a retirar en Tasks 1.3/1.4.

## FASE 1 (envío del correo a Copilot)
- Task 1.1+1.2: complete (commit bb83c9e, review clean). common.js con DEFAULTS/getConfig/buildPrompt/matchPatternFromUrl/extractBody.
- Task 1.3: complete (commit 9a55eee). content-copilot.js con listener sendPrompt, sin instrumentación de spike. Revisado por el controlador (transcripción mecánica del brief, node --check OK).
- Task 1.4: complete (commit a695048, review clean). background.js real: registro por config, ventana única (storage.session), handshake, sendToCopilot. Minors (para revisión final): catch(_) tácito; sin validar copilotUrl en windows.create (fuera de scope).
- Task 1.5+1.6: complete (commit 1ea702e, review clean). Popup del botón: monta prompt del correo, envía sendToCopilot, degradación al portapapeles. PENDIENTE: prueba extremo a extremo del usuario en TB (hito Fase 1). Riesgo a validar aquí: que windows.create popup inyecte el content script; si no, cambiar a tabs.create.
- Task 1.5 VERIFICADA E2E por el usuario: el botón funciona de punta a punta (correo→popup→Copilot recibe+envía). Fixes tras prueba real: getDisplayedMessages plural (f2609b3, TB 140 quitó el singular); extractBody mejorado — HTML primero, sin CSS, con estructura, alt de imágenes (a033698).
- Task 1.7: complete (commit fdb41b1, review clean). Página de opciones (copilotUrl, promptTemplate, newChatByDefault).
- Refinamientos de extractBody tras feedback (directos del controlador, para revisión final): a033698 (HTML primero, sin CSS, alt de imágenes) y 3ee4753 (elimina líneas en blanco). Lógica de normalizeText verificada por prueba unitaria.
- NÚCLEO FASE 1 COMPLETO Y REVISADO.
- Limpieza de cuerpo reforzada: elimina caracteres invisibles (\p{Cf} + marcas) (ca120ba), verificado por prueba. Pendiente confirmación visual del usuario.
- Infra de release en GitHub: .github/workflows/release.yml (tag vX.Y.Z -> empaqueta y publica .xpi) y ci.yml (validación en push/PR); README actualizado (bc4c9ea). Rama subida a origin. Decisión del usuario: NO publicar release hasta cerrar la Fase 2.
## FASE 2 (traer la respuesta a composición)
- Sonda probeReply descubrió los selectores de respuesta: `[data-testid="markdown-reply"]` (texto limpio, coger el último) y `[data-testid="loading-message"]` (presente mientras genera). Icono Copilot (spark) añadido al botón (1dd5cd9).
- Task 2 (2.1+2.2): complete (commit d645833, review Spec ✅ / Calidad Approved). content script espera respuesta (waitForReply: baseline + aparición + sin loading + estabilidad 1.5s + timeout 120s) y emite copilotReply; background (listener único con ramas) guarda pendingMessageId en storage.session y abre beginReply; popup pasa messageId. Sonda probeReply eliminada.
- Riesgos de la revisión (backlog Fase 3, NO bloqueantes): (Important) envíos concurrentes sobrescriben pendingMessageId -> respuesta al correo equivocado; (Important) si waitForReply agota timeout, popup ya dijo "Enviado" pero no se abre composición (fallo silencioso); (Minor) solo captura el último nodo markdown-reply; (Minor) pendingMessageId no se limpia si falla la captura.
- FASE 2 VERIFICADA E2E POR EL USUARIO: la composición se abre con la respuesta. Fix clave: detección por estabilidad del texto (loading-message persiste, no sirve de señal) (83b2edf). Diagnósticos temporales retirados; se conserva try/catch en beginReply.
- Añadido: la plantilla del prompt pide respuesta en Markdown; icono del botón = flor Copilot (versión propia). Pendiente (opcional): usar el logo oficial desde una fuente libre (Simple Icons); el fetch a jsdelivr dio 404, probablemente el icono fue retirado por marca.
- Ajustes tras uso real: logo Copilot oficial (icon.svg + default_icon del botón); prompt con guía de estilo Markdown; extractReplyText conserva saltos y quita la etiqueta ```markdown; respuesta abre en composición HTML con el texto TAL CUAL (Markdown fuente) -> el complemento del usuario "Markdown Here Revival" lo renderiza. Ventana de Copilot ensanchada a 1200x860.
- FALSA ALARMA del plugin MDHR: no cargaba por recargar el complemento temporal sin reiniciar Thunderbird; reiniciar TB lo arregla. Se descartó la conversión automática Markdown->HTML (no era lo pedido; revertida en 2e4f2ab).
- ESTADO: Fase 1 + Fase 2 completas y verificadas y en uso. Backlog: riesgos de concurrencia (Fase 3), desplegable de agentes, ¿ancho de la ventana de Copilot? Pendiente revisión final de rama antes de release/tag.
- Fase 2 (Tasks 2.1, 2.2) pendiente: necesita descubrir el selector del contenedor de respuesta (interactivo con el usuario).
- BACKLOG (pospuesto por el usuario, ver spec §16): desplegable de agentes de Copilot; comportamiento por defecto por decidir.

## v2.1 (rama cothunder-v2.1-agentes)
- Desplegable de agentes: lista los agentes de la barra lateral de Copilot (.fai-CopilotNavSubItem, id P_/T_/agent/gpt; filtra historial), recuerda el último, botón de refresco + refresco periódico. Selección por clic con escritura robusta (reintenta+verifica). Enfoque barra-lateral+fijar (el panel completo se descartó por frágil). Verificado por el usuario.
- Endurecido Fase 2: messageId de ida y vuelta (sin pendingMessageId único) -> no cruza correos; notificación si la captura falla. Permiso notifications añadido.
- PENDIENTE: prueba del usuario (agente + endurecido) y release v2.1.0 (bump manifest a 2.1.0, merge a main, tag).

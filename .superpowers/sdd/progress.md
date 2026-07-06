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
- (siguiente) Task 1.7: página de opciones — base a033698 (o el fix de extracción actual)
- Fase 2 (Tasks 2.1, 2.2) pendiente: necesita descubrir el selector del contenedor de respuesta (interactivo con el usuario).
- BACKLOG (pospuesto por el usuario, ver spec §16): desplegable de agentes de Copilot; comportamiento por defecto por decidir.

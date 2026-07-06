# CoThunder — Progreso SDD

Plan: docs/superpowers/plans/2026-07-06-cothunder-copilot-web.md
Rama: cothunder-copilot-web
Base de rama: 73d204c (tras Initial commit ddc4015)

## Ledger

- Task 0.1: complete (commits eae3f70..56b2b33, review clean). Verificado en TB 140.11.1: botón y log OK. Dos advertencias MV3 (applications, persistent) corregidas en 57229f0; docs alineadas en 92c7705. Reconfirmado por el usuario: recarga sin advertencias, background "En ejecución".
- Task 0.2: complete (commits 92c7705..b463041, review clean) + VERIFICADA en TB 140.11.1. Spike bloqueante RESUELTO EN VERDE: scripting.registerContentScripts funciona, el content script se inyecta en el chat de Copilot, tabs.create abre URL externa. URL real del chat: https://m365.cloud.microsoft/chat/. Instrumentación de spike (contentAlive) en 13007c5 — retirar en Task 0.3/1.3. Nota: el content script se inyectó 2× (la página redirige al cargar); manejadores idempotentes en 0.3.
- Task 0.3: complete + VERIFICADA por el usuario (commits ...71e4c0f/16f0d6d/3beb954). FASE 0 CERRADA EN VERDE. Selectores: editor #m365-chat-editor-target-element, enviar button.fai-SendButton, nuevo chat [data-testid=newChatButton]. Escritura: único beforeinput insertText (dos eventos duplican). content-copilot.js ya tiene typeIntoEditor/clickSend/startNewChat/SELECTORS reales; falta selector de respuesta (fase 2). Código de spike (contentAlive, spikeSend) a retirar en Tasks 1.3/1.4.

## FASE 1 (envío del correo a Copilot)
- (siguiente) Task 1.1: configuración y utilidades compartidas en common.js — base tras cerrar Fase 0

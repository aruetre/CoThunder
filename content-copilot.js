"use strict";
console.log("[CoThunder] content script activo en", location.href);
messenger.runtime.sendMessage({ type: "contentAlive", url: location.href }).catch(() => {});

// --- Sonda de spike (Task 0.3): descubre los selectores reales del chat de Copilot ---
function describeEl(el) {
  const attrs = [];
  for (const { name, value } of el.attributes) {
    if (name === "class" || name === "style") continue;
    attrs.push(`${name}="${(value || "").slice(0, 70)}"`);
  }
  const cls = typeof el.className === "string" && el.className
    ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
    : "";
  return `<${el.tagName.toLowerCase()}${cls}${attrs.length ? " " + attrs.join(" ") : ""}>`;
}

function matchText(el, re) {
  return re.test(
    (el.getAttribute("aria-label") || "") + " " +
    (el.getAttribute("title") || "") + " " +
    (el.getAttribute("data-testid") || "") + " " +
    (el.getAttribute("placeholder") || "") + " " +
    (el.textContent || "").slice(0, 40)
  );
}

function probe(tag) {
  const editors = [...document.querySelectorAll(
    'textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
  )].slice(0, 8).map(describeEl);
  const sendButtons = [...document.querySelectorAll('button, [role="button"], [type="submit"]')]
    .filter(b => matchText(b, /send|enviar|submit/i)).slice(0, 8).map(describeEl);
  const newChat = [...document.querySelectorAll('button, [role="button"], a')]
    .filter(b => matchText(b, /new chat|nuevo chat|new conversation|nueva conversaci/i)).slice(0, 8).map(describeEl);
  messenger.runtime.sendMessage({ type: "probe", tag, editors, sendButtons, newChat }).catch(() => {});
}

probe("load");
setTimeout(() => probe("+3s"), 3000);
setTimeout(() => probe("+8s"), 8000);

// Disparador de spike: escribe texto en el editor Lexical y re-rastrea el botón de enviar.
messenger.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "spikeType") return;
  const el = document.querySelector("#m365-chat-editor-target-element");
  if (!el) return Promise.resolve({ ok: false, reason: "no-editor" });
  el.focus();
  const inserted = document.execCommand("insertText", false, msg.text || "Hola desde CoThunder");
  const sendButtons = [...document.querySelectorAll('button, [role="button"], [type="submit"]')]
    .filter(b => matchText(b, /send|enviar|submit/i)).slice(0, 8).map(describeEl);
  const labeledButtons = [...document.querySelectorAll('button, [role="button"]')]
    .filter(b => (b.getAttribute("aria-label") || b.getAttribute("data-testid") || "").trim())
    .slice(0, 20).map(describeEl);
  return Promise.resolve({ ok: inserted, editorText: el.textContent, sendButtons, labeledButtons });
});

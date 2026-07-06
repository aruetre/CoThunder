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

// Disparador de spike: prueba varios métodos de inserción en el editor Lexical y re-rastrea enviar.
function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.addRange(range);
}

function clearEditor(el) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.addRange(range);
  document.execCommand("delete", false);
}

function insertBy(el, text, method) {
  placeCaretAtEnd(el);
  if (method === "execCommand") {
    document.execCommand("insertText", false, text);
  } else if (method === "beforeinput") {
    el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true }));
    el.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
  } else if (method === "paste") {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

messenger.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "spikeType") return { ignored: true };
  const el = document.querySelector("#m365-chat-editor-target-element");
  if (!el) return { ok: false, reason: "no-editor" };
  const text = msg.text || "Hola desde CoThunder";
  const results = {};
  let worked = null;
  for (const method of ["paste", "beforeinput", "execCommand"]) {
    clearEditor(el);
    await delay(120);
    insertBy(el, text, method);
    await delay(180);
    results[method] = el.textContent;
    if (el.textContent && el.textContent.includes(text.slice(0, 6))) { worked = method; break; }
  }
  await delay(300);
  const sendButtons = [...document.querySelectorAll('button, [role="button"], [type="submit"]')]
    .filter(b => matchText(b, /send|enviar|submit/i)).slice(0, 8).map(describeEl);
  return { ok: !!worked, worked, results, editorText: el.textContent, sendButtons };
});

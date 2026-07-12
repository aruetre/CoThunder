"use strict";
// Pruebas del renderizador Markdown (lógica pura, sin Thunderbird).
// Ejecutar con: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderInline } = require("../markdown.js");
const { renderMarkdown } = require("../markdown.js");

test("renderInline escapa HTML", () => {
  assert.equal(renderInline("a < b & c"), "a &lt; b &amp; c");
});

test("renderInline: negrita y cursiva", () => {
  assert.equal(renderInline("**hola**"), "<strong>hola</strong>");
  assert.equal(renderInline("_eso_"), "<em>eso</em>");
});

test("renderInline: código en línea escapa su contenido", () => {
  assert.equal(renderInline("usa `a < b`"), "usa <code>a &lt; b</code>");
});

test("renderInline: enlace con esquema permitido", () => {
  assert.equal(renderInline("[web](https://x.io)"), '<a href="https://x.io">web</a>');
});

test("renderInline: enlace con esquema no permitido queda como texto", () => {
  assert.equal(renderInline("[x](javascript:void)"), "x");
});

test("renderInline: un número suelto en prosa no colisiona con el centinela de code spans", () => {
  assert.equal(renderInline("paso 2 hecho"), "paso 2 hecho");
});

test("renderInline: code span con un número sigue funcionando", () => {
  assert.equal(renderInline("cuesta `5` euros"), "cuesta <code>5</code> euros");
});

test("renderInline: enlaces adyacentes se renderizan ambos", () => {
  assert.equal(
    renderInline("[a](https://x.io)[b](https://y.io)"),
    '<a href="https://x.io">a</a><a href="https://y.io">b</a>'
  );
});

test("renderInline: enlace seguido de prosa entre paréntesis no se lo engulle", () => {
  assert.equal(
    renderInline("ve a [la web](https://x.io) (recomendado)"),
    've a <a href="https://x.io">la web</a> (recomendado)'
  );
});

test("renderMarkdown: encabezados", () => {
  assert.equal(renderMarkdown("# Hola"), "<h1>Hola</h1>");
  assert.equal(renderMarkdown("### Sub"), "<h3>Sub</h3>");
});

test("renderMarkdown: párrafo con énfasis", () => {
  assert.equal(renderMarkdown("Texto **fuerte**"), "<p>Texto <strong>fuerte</strong></p>");
});

test("renderMarkdown: lista desordenada", () => {
  assert.equal(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
});

test("renderMarkdown: cita y regla", () => {
  assert.equal(renderMarkdown("> cita"), "<blockquote><p>cita</p></blockquote>");
  assert.equal(renderMarkdown("---"), "<hr>");
});

test("renderMarkdown: bloque de código escapa su contenido", () => {
  assert.equal(renderMarkdown("```\na < b\n```"), "<pre><code>a &lt; b</code></pre>");
});

test("renderMarkdown: tabla de pipes", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  assert.equal(
    renderMarkdown(md),
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
  );
});

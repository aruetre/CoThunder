"use strict";
// Pruebas del renderizador Markdown (lógica pura, sin Thunderbird).
// Ejecutar con: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderInline } = require("../markdown.js");

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
  assert.equal(renderInline("[x](javascript:alert(1))"), "x");
});

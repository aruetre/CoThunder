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

test("renderMarkdown: párrafo pegado a una tabla no la engulle", () => {
  assert.equal(
    renderMarkdown("Intro:\n| A | B |\n| --- | --- |\n| 1 | 2 |"),
    "<p>Intro:</p>\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
  );
});

test("renderMarkdown: párrafo pegado a una regla horizontal corta ahí", () => {
  assert.equal(renderMarkdown("texto\n---"), "<p>texto</p>\n<hr>");
});

test("renderMarkdown: lista desordenada anidada", () => {
  assert.equal(
    renderMarkdown("- a\n  - sub\n- b"),
    "<ul><li>a<ul><li>sub</li></ul></li><li>b</li></ul>"
  );
});

test("renderMarkdown: lista ordenada anidada bajo desordenada", () => {
  assert.equal(
    renderMarkdown("- a\n  1. sub\n- b"),
    "<ul><li>a<ol><li>sub</li></ol></li><li>b</li></ul>"
  );
});

test("renderMarkdown: separador de tabla de un solo guion", () => {
  assert.equal(
    renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |"),
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
  );
});

test("renderInline: imagen web ![alt](url)", () => {
  assert.equal(renderInline("![gato](https://x.io/g.png)"), '<img src="https://x.io/g.png" alt="gato">');
});

test("renderInline: imagen embebida data: se conserva, alt vacío", () => {
  assert.equal(renderInline("![](data:image/png;base64,ABC)"), '<img src="data:image/png;base64,ABC" alt="">');
});

test("renderInline: imagen con esquema no permitido se descarta", () => {
  assert.equal(renderInline("![x](ftp://h/i.png)"), "");
});

test("renderInline: enlace normal sigue funcionando junto a la regla de imagen", () => {
  assert.equal(renderInline("[web](https://x.io)"), '<a href="https://x.io">web</a>');
});

test("renderInline: tachado ~~x~~", () => {
  assert.equal(renderInline("~~tachado~~"), "<del>tachado</del>");
});
test("renderMarkdown: lista de tareas", () => {
  assert.equal(renderMarkdown("- [ ] uno\n- [x] dos"), "<ul><li>☐ uno</li><li>☑ dos</li></ul>");
});
test("renderMarkdown: tarea marcada con X mayúscula y texto con énfasis", () => {
  assert.equal(renderMarkdown("- [X] **hecho**"), "<ul><li>☑ <strong>hecho</strong></li></ul>");
});
test("renderInline: autoenlace de URL suelta", () => {
  assert.equal(renderInline("mira https://x.io ahora"), 'mira <a href="https://x.io">https://x.io</a> ahora');
});
test("renderInline: un enlace explícito no se re-enlaza", () => {
  assert.equal(renderInline("[web](https://x.io)"), '<a href="https://x.io">web</a>');
});

test("renderInline: negrita+cursiva ***", () => {
  assert.equal(renderInline("***fuerte***"), "<strong><em>fuerte</em></strong>");
});
test("renderInline: título en enlace", () => {
  assert.equal(renderInline('[web](https://x.io "Título")'), '<a href="https://x.io" title="Título">web</a>');
});
test("renderInline: título en imagen", () => {
  assert.equal(renderInline('![gato](https://x.io/g.png "Un gato")'), '<img src="https://x.io/g.png" alt="gato" title="Un gato">');
});
test("renderInline: autoenlace angular de URL", () => {
  assert.equal(renderInline("visita <https://x.io>"), 'visita <a href="https://x.io">https://x.io</a>');
});
test("renderInline: autoenlace angular de correo", () => {
  assert.equal(renderInline("a <a@b.com> ya"), 'a <a href="mailto:a@b.com">a@b.com</a> ya');
});
test("renderInline: asterisco escapado es literal", () => {
  assert.equal(renderInline("un \\*literal\\* aqui"), "un *literal* aqui");
});
test("renderInline: enlace normal sin título sigue igual", () => {
  assert.equal(renderInline("[web](https://x.io)"), '<a href="https://x.io">web</a>');
});
test("renderInline: imagen enlazada", () => {
  assert.equal(renderInline("[![alt](https://x.io/i.png)](https://x.io)"), '<a href="https://x.io"><img src="https://x.io/i.png" alt="alt"></a>');
});

test("renderInline: resaltado ==x==", () => {
  assert.equal(renderInline("==importante=="), '<mark style="background-color:#fff2a8;">importante</mark>');
});
test("renderInline: subíndice ~x~", () => {
  assert.equal(renderInline("H~2~O"), "H<sub>2</sub>O");
});
test("renderInline: tachado ~~x~~ NO se confunde con subíndice", () => {
  assert.equal(renderInline("~~tachado~~"), "<del>tachado</del>");
});
test("renderInline: superíndice ^x^", () => {
  assert.equal(renderInline("X^2^"), "X<sup>2</sup>");
});
test("renderInline: emoji conocido", () => {
  assert.equal(renderInline("bien :fire: hecho"), "bien 🔥 hecho");
});
test("renderInline: emoji +1", () => {
  assert.equal(renderInline(":+1:"), "👍");
});
test("renderInline: emoji desconocido queda literal", () => {
  assert.equal(renderInline(":noexiste:"), ":noexiste:");
});
test("renderInline: dos puntos de una hora no se tocan", () => {
  assert.equal(renderInline("a las 12:30"), "a las 12:30");
});

test("renderMarkdown: ID de encabezado", () => {
  assert.equal(renderMarkdown("## Título {#mi-id}"), '<h2 id="mi-id">Título</h2>');
});
test("renderMarkdown: encabezado sin ID no cambia", () => {
  assert.equal(renderMarkdown("## Título"), "<h2>Título</h2>");
});
test("renderMarkdown: lista de definición", () => {
  assert.equal(renderMarkdown("término\n: definición"), "<dl><dt>término</dt><dd>definición</dd></dl>");
});
test("renderMarkdown: lista de definición con dos términos", () => {
  assert.equal(
    renderMarkdown("uno\n: def uno\ndos\n: def dos"),
    "<dl><dt>uno</dt><dd>def uno</dd><dt>dos</dt><dd>def dos</dd></dl>"
  );
});
test("renderMarkdown: nota al pie", () => {
  assert.equal(
    renderMarkdown("Frase.[^1]\n\n[^1]: El detalle."),
    '<p>Frase.<sup><a href="#fn1" id="fnref1">1</a></sup></p>\n<hr>\n<ol><li id="fn1">El detalle. <a href="#fnref1">↩</a></li></ol>'
  );
});
test("renderMarkdown: nota al pie con id textual", () => {
  assert.equal(
    renderMarkdown("Texto[^nota] aquí.\n\n[^nota]: La aclaración."),
    '<p>Texto<sup><a href="#fn1" id="fnref1">1</a></sup> aquí.</p>\n<hr>\n<ol><li id="fn1">La aclaración. <a href="#fnref1">↩</a></li></ol>'
  );
});

// Regresión del CRÍTICO de la tanda 2: la URL suelta no debe engullir entidades.
test("renderInline: URL suelta corta ante un > sin engullir la entidad", () => {
  assert.equal(renderInline("v https://x.io>ok"), 'v <a href="https://x.io">https://x.io</a>&gt;ok');
});

test("renderInline: URL suelta conserva el & de una query string", () => {
  assert.equal(
    renderInline("v https://x.io?a=1&b=2 z"),
    'v <a href="https://x.io?a=1&amp;b=2">https://x.io?a=1&amp;b=2</a> z'
  );
});

test("renderInline: ángulos escapados quedan literales, URL bien formada", () => {
  assert.equal(renderInline("\\<https://x.io\\>"), '&lt;<a href="https://x.io">https://x.io</a>&gt;');
});

test("renderInline: doble barra invertida escapa a una literal", () => {
  assert.equal(renderInline("\\\\"), "\\");
});

test("renderMarkdown: admonition NOTE", () => {
  assert.equal(
    renderMarkdown("> [!NOTE]\n> Esto es una nota."),
    '<div style="border-left:4px solid #0969da;background:#ddf4ff;padding:8px 12px;margin:8px 0;color:#1f2328;"><p style="margin:0 0 6px;font-weight:bold;">ℹ️ Nota</p><p>Esto es una nota.</p></div>'
  );
});
test("renderMarkdown: admonition WARNING con énfasis en el cuerpo", () => {
  assert.equal(
    renderMarkdown("> [!WARNING]\n> Ojo con **esto**."),
    '<div style="border-left:4px solid #9a6700;background:#fff8c5;padding:8px 12px;margin:8px 0;color:#1f2328;"><p style="margin:0 0 6px;font-weight:bold;">⚠️ Advertencia</p><p>Ojo con <strong>esto</strong>.</p></div>'
  );
});
test("renderMarkdown: tipo desconocido es cita normal", () => {
  assert.equal(renderMarkdown("> [!FOO]\n> hola"), "<blockquote><p>[!FOO] hola</p></blockquote>");
});
test("renderMarkdown: cita normal sigue igual", () => {
  assert.equal(renderMarkdown("> cita"), "<blockquote><p>cita</p></blockquote>");
});

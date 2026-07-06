---
name: revision-mailextension
description: Revisión de calidad para extensiones de Thunderbird (MailExtensions). Usar siempre antes de dar por terminado cualquier cambio de código en este repo, aunque el cambio parezca trivial. También cuando el usuario pida revisar, auditar, mejorar o depurar la extensión, o mencione manifest, permisos, popup, background, opciones o problemas de seguridad.
---

# Revisión MailExtension

Lista de comprobación que se aplica al código completo tras cualquier cambio. No es opcional: un fallo aquí llega al usuario final.

## 1. Sintaxis y manifest

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); console.log('manifest OK')"
for f in $(find . -name '*.js' -not -path './node_modules/*' -not -path './.*'); do node --check "$f" && echo "$f OK"; done
```

Si algo falla, corregir antes de seguir. En el manifest, verificar además:

- `manifest_version` es 3, con `background.persistent: false` (event page, no service worker; TB usa event pages en MV3).
- `applications.gecko.strict_min_version` coincide con la versión mínima documentada en la especificación (140.0).
- No hay key `content_scripts` (no existe en MV3): el content script se registra en runtime desde el background. `host_permissions` es key separado de `permissions`.
- Los permisos son exactamente los que la especificación lista (`messagesRead`, `compose`, `storage`, `scripting` + host permission de Copilot). Cualquier permiso nuevo debe justificarse en `docs/ESPECIFICACION.md` antes de añadirse.
- Todo fichero referenciado en el manifest existe en disco (background scripts, popup, options, iconos).

## 2. API de Thunderbird

- Todas las llamadas usan el objeto `messenger`. Buscar usos de `browser.` o `chrome.` y sustituirlos:

```bash
grep -rn --include='*.js' -E '\b(browser|chrome)\.' . && echo "REVISAR: usos de browser/chrome" || echo "API OK"
```

- Las APIs usadas existen en la versión mínima soportada. Ante la duda, consultar https://webextension-api.thunderbird.net/ para la versión de `strict_min_version`.
- Los listeners del background se registran en el nivel superior del script, nunca dentro de callbacks asíncronos.

## 3. Seguridad

- La clave API no aparece en `console.log`, ni interpolada en mensajes de error, ni en URLs de log:

```bash
grep -rn --include='*.js' -iE 'console\.(log|error|warn).*(apiKey|api_key|Authorization)' . && echo "REVISAR: posible fuga de clave" || echo "Sin fugas evidentes"
```

- Sin `eval`, `new Function`, ni asignaciones a `innerHTML` con contenido que venga de correos o de la API:

```bash
grep -rn --include='*.js' -E 'eval\(|new Function|innerHTML\s*=' . && echo "REVISAR" || echo "OK"
```

- El HTML de correos se procesa exclusivamente con `DOMParser` para extraer texto.
- Ningún destino de red distinto del endpoint configurado por el usuario. Buscar URLs hardcodeadas:

```bash
grep -rn --include='*.js' -E 'https?://' . | grep -v -E '(example|localhost|thunderbird\.net)' || echo "Sin URLs hardcodeadas"
```

## 4. Robustez

- Toda llamada `fetch` tiene timeout con `AbortController` y manejo de respuesta no 2xx.
- Todo `await` que pueda fallar está dentro de try/catch con un mensaje de error útil para el usuario, en español, sin volcar objetos internos.
- El popup cubre los tres casos: sin correo abierto, generación en curso, error de API.
- La caché del background respeta su límite y no crece sin cota.

## 5. Coherencia con la especificación

Leer `docs/ESPECIFICACION.md` y confirmar que el cambio no contradice ninguna sección. Si el cambio amplía el comportamiento, actualizar la especificación en el mismo commit. Especificación y código divergentes es el peor estado posible del repo.

## 6. Cierre

Informar del resultado en tres bloques: qué se comprobó, qué se encontró, qué se corrigió. Si todo pasa, decirlo explícitamente y proponer ejecutar la skill `empaquetado-xpi` si el cambio merece release.

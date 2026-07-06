---
name: empaquetado-xpi
description: Validación y empaquetado de la extensión de Thunderbird como fichero .xpi instalable. Usar siempre que el usuario pida empaquetar, generar el xpi, hacer release, subir versión, publicar o entregar la extensión, y también como paso final tras completar un conjunto de cambios listos para probar en Thunderbird.
---

# Empaquetado .xpi

Proceso completo de release. Ejecutar los pasos en orden; si uno falla, parar y corregir.

## 1. Precondición

Ejecutar primero la skill `revision-mailextension`. No se empaqueta código sin revisar.

## 2. Versión

Subir la versión en `manifest.json` según SemVer:

- Corrección de fallo sin cambio de comportamiento: patch.
- Funcionalidad nueva compatible: minor.
- Cambio de permisos, de formato de configuración o de comportamiento visible: major, y anotar la migración en `docs/ESPECIFICACION.md`.

Si el usuario no indica el tipo de cambio, deducirlo del diff y decir qué versión se eligió y por qué.

## 3. Validación previa

```bash
node -e "const m = JSON.parse(require('fs').readFileSync('manifest.json'));
if (!/^\d+\.\d+\.\d+$/.test(m.version)) throw new Error('version no SemVer: ' + m.version);
console.log('manifest OK, version ' + m.version)"

for f in common.js background.js content-copilot.js popup/popup.js options/options.js; do node --check "$f" && echo "$f OK"; done
```

Verificar que todo fichero referenciado en el manifest existe:

```bash
node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('manifest.json'));
const refs = [
  ...(m.background?.scripts || []),
  m.message_display_action?.default_popup,
  m.options_ui?.page,
  ...Object.values(m.icons || {})
].filter(Boolean);
let ok = true;
for (const r of refs) {
  if (!fs.existsSync(r)) { console.error('FALTA: ' + r); ok = false; }
}
if (!ok) process.exit(1);
console.log('Referencias del manifest OK (' + refs.length + ')');
"
```

## 4. Empaquetar

Solo entra en el paquete lo que Thunderbird necesita. Fuera documentación, tooling y ficheros ocultos:

```bash
VERSION=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json')).version")
rm -f cothunder-*.xpi
zip -r "cothunder-${VERSION}.xpi" . \
  -x '.*' -x '.*/**' \
  -x 'docs/*' -x 'CLAUDE.md' -x '*.xpi' \
  -x 'node_modules/*' -x '*.md' -q
unzip -l "cothunder-${VERSION}.xpi"
```

Revisar el listado: debe contener manifest.json, los JS, popup/, options/ e icon.svg, y nada más. Un fichero inesperado dentro del xpi es motivo de rehacer el paquete.

## 5. Verificación del paquete

```bash
VERSION=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json')).version")
mkdir -p /tmp/xpi-check && rm -rf /tmp/xpi-check/* && unzip -q "cothunder-${VERSION}.xpi" -d /tmp/xpi-check
node -e "JSON.parse(require('fs').readFileSync('/tmp/xpi-check/manifest.json')); console.log('paquete OK')"
```

## 6. Cierre

Informar de: versión generada, tamaño del fichero, contenido del paquete y ruta del `.xpi`. Recordar la instalación: Thunderbird, Herramientas, Complementos y temas, engranaje, Instalar complemento desde archivo. Si el repo tiene remoto con releases (GitLab, Gitea, GitHub), proponer etiquetar el commit con `v${VERSION}` y adjuntar el `.xpi` a la release.

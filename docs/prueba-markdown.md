# CoThunder — Banco de pruebas Markdown

> Copia este archivo en el editor Markdown de la redacción y prueba **todos los temas**.
> Está pensado para estresar el motor: elementos variados, tamaños distintos,
> admonitions con contenido dentro, tablas anchas, código largo, anidamientos, etc.

---

## 1. Encabezados (todos los niveles seguidos)

# H1 — Título de correo
## H2 — Sección
### H3 — Subsección
#### H4 — Apartado
##### H5 — Detalle
###### H6 — Nota menor
### Encabezado con ID {#seccion-especial}

---

## 2. Énfasis, mezclas y casos límite

Normal, **negrita**, *cursiva*, ***negrita+cursiva***, ~~tachado~~, `código`, ==resaltado==.

Combinado: **negrita con `código` y *cursiva* dentro**, y ~~tachado con **negrita**~~.

Subíndice/superíndice: H~2~O, CO~2~, X^2^ + Y^2^ = Z^2^, E = mc^2^.

Negrita alrededor de una URL: **https://www.thunderbird.net** (debe salir en negrita y enlazada).

Escapado: \*no cursiva\*, \# no encabezado, \`no código\`, \~\~no tachado\~\~, y una barra doble: \\.

Emoji surtidos: :rocket: :fire: :tada: :bulb: :warning: :bug: :white_check_mark: :calendar: :email: :lock: :key: :star: :handshake:

---

## 3. Enlaces y correos

- Enlace simple: [Markdown Guide](https://www.markdownguide.org)
- Con título: [pasa el ratón](https://example.com "Aparece al pasar el ratón")
- Autoenlace angular: <https://www.thunderbird.net>
- URL suelta: visita https://addons.thunderbird.net y listo
- Correo: escríbeme a <alguien@ejemplo.com>
- SharePoint (con `==` y `:x:`, no debe romperse): https://contoso.sharepoint.com/:x:/g/personal/user/EabcXYZ==
- Enlace con **negrita** dentro: [**Descargar ahora**](https://example.com/descargar)

---

## 4. Imágenes (sueltas, enlazadas y en tabla)

Imagen normal:

![Gatito de prueba](https://placekitten.com/320/180 "Un gatito")

Imagen enlazada (la imagen es un enlace):

[![Logo de Thunderbird](https://www.thunderbird.net/media/img/thunderbird/favicon.png)](https://www.thunderbird.net)

Imagen pequeña junto a texto: aquí ![icono](https://www.thunderbird.net/media/img/thunderbird/favicon.png) y sigo escribiendo.

---

## 5. Listas variadas y anidadas

### Desordenada con anidación profunda

- Nivel 1 — primer punto
- Nivel 1 — segundo punto
  - Nivel 2 — sub A
  - Nivel 2 — sub B
    - Nivel 3 — sub-sub
      - Nivel 4 — muy dentro
- Nivel 1 — con **negrita**, `código` y un [enlace](https://example.com)

### Ordenada mezclada con desordenada

1. Preparar
2. Ejecutar
   - subtarea sin número
   - otra subtarea
3. Revisar
   1. paso 3.1
   2. paso 3.2

### Lista de tareas

- [x] Diseño aprobado
- [x] Backend desplegado
- [ ] Pruebas en Thunderbird
- [ ] Documentación con **capturas**
- [ ] Enviar release :rocket:

---

## 6. Tablas de varios tamaños

### Tabla pequeña

| Clave | Valor |
| --- | --- |
| Estado | Activo |
| Versión | 2.6.6 |

### Tabla con formato dentro de las celdas

| Elemento | Sintaxis | Ejemplo |
| --- | --- | --- |
| Negrita | `**x**` | **x** |
| Enlace | `[t](u)` | [web](https://example.com) |
| Código | `` `c` `` | `const x = 1` |
| Estado | emoji | :white_check_mark: |

### Tabla ANCHA (muchas columnas — probar desbordamiento)

| Mes | Ventas | Coste | Margen | Clientes | Altas | Bajas | NPS | Objetivo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Enero | 12.400 | 8.100 | 4.300 | 320 | 40 | 12 | 61 | ✅ |
| Febrero | 13.900 | 8.400 | 5.500 | 348 | 45 | 17 | 64 | ✅ |
| Marzo | 11.200 | 7.900 | 3.300 | 331 | 22 | 39 | 58 | ⚠️ |

### Tabla pegada a un párrafo (estilo Copilot, con líneas en blanco)

Resumen del incidente:

| Concepto | Detalle |

| --- | --- |

| Repositorio | `aruetre/CoThunder` |

| Estado | **Resuelto** |

---

## 7. Código en varios lenguajes y tamaños

Código en línea variado: `git commit`, `SELECT *`, `x < y && a > b`, `const π = 3.14`.

### JavaScript (corto)

```js
const saludo = (nombre) => `Hola, ${nombre}`; // plantilla
console.log(saludo("Antonio"));
```

### Python (medio)

```python
# calcula la media
def media(valores):
    if not valores:
        return 0
    return sum(valores) / len(valores)  # división real

print(media([10, 20, 30]))  # 20.0
```

### TypeScript

```ts
interface Usuario { nombre: string; activo: boolean; }
const u: Usuario = { nombre: "Ana", activo: true };
```

### JSON

```json
{
  "nombre": "CoThunder",
  "version": "2.6.6",
  "temas": ["upo", "dracula", "nord"],
  "activo": true
}
```

### Bash

```bash
# empaqueta y valida
for f in *.js; do node --check "$f"; done
zip -r cothunder.xpi . -x '*.md'
```

### SQL

```sql
SELECT nombre, email
FROM usuarios
WHERE activo = 1 AND alta > '2026-01-01'
ORDER BY alta DESC;
```

### CSS

```css
.markdown-here-wrapper h1 { color: #003772; border-bottom: 3px solid #FCC100; }
```

### Bloque LARGO (probar scroll vertical)

```python
class Pila:
    def __init__(self):
        self._items = []

    def apilar(self, x):
        self._items.append(x)

    def desapilar(self):
        if not self._items:
            raise IndexError("pila vacía")
        return self._items.pop()

    def cima(self):
        return self._items[-1] if self._items else None

    def vacia(self):
        return len(self._items) == 0

    def __len__(self):
        return len(self._items)
```

### Bloque SIN lenguaje (sin colores, escapado seguro)

```
<script>alert("no se ejecuta")</script>
a < b && c > d
"comillas" y & ampersand
```

---

## 8. Admonitions (las 5, y con contenido rico dentro)

> [!NOTE]
> Una nota simple con **énfasis**, `código` y un [enlace](https://example.com).

> [!TIP]
> Consejo con una **lista** dentro:
>
> - Primer consejo
> - Segundo consejo con `código`
> - Tercero

> [!IMPORTANT]
> Importante, con un **bloque de código** dentro:
>
> ```js
> if (fecha > limite) enviar();
> ```

> [!WARNING]
> Advertencia con una **tabla** dentro:
>
> | Riesgo | Nivel |
> | --- | --- |
> | Pérdida de datos | Alto |
> | Retraso | Medio |

> [!CAUTION]
> Precaución con una **imagen** y varios párrafos:
>
> ![aviso](https://www.thunderbird.net/media/img/thunderbird/favicon.png)
>
> Segundo párrafo tras la imagen, con ~~texto tachado~~ y ==resaltado==.

---

## 9. Citas anidadas y con elementos

> Cita de primer nivel con **negrita**.
>
> > Cita anidada (segundo nivel) con `código`.
> >
> > > Tercer nivel, más profundo.

> Cita con una lista:
>
> 1. uno
> 2. dos

---

## 10. Notas al pie y listas de definición

Frase con una nota al pie[^1] y otra referencia más adelante[^dos]. Incluso la misma nota repetida[^1].

[^1]: Primera nota, con **énfasis** y un [enlace](https://example.com).
[^dos]: Segunda nota, más larga, para ver cómo queda el bloque de notas al final del correo.

### Lista de definición

Markdown
: Lenguaje de marcado ligero para dar formato a texto plano.

CoThunder
: Extensión de Thunderbird que integra Copilot y trae este editor Markdown.

Tema
: Conjunto de colores aplicados al correo; se elige en Opciones.

---

## 11. Regla horizontal entre secciones

Texto antes de la regla.

---

Texto después de la regla.

---

## 12. Correo de ejemplo completo (todo mezclado)

# Informe semanal :rocket:

Hola equipo,

Resumen de la semana con lo **más relevante** y algún ~~punto descartado~~:

1. Cerramos el *hito 1* (ver [detalles](https://example.com "Hito 1")).
2. Pendiente revisar la nueva configuración ==antes del viernes==.

> [!IMPORTANT]
> La entrega es el **viernes**. Avisad con :warning: si hay bloqueos.

Estado del equipo:

| Tarea | Responsable | Estado |
| --- | --- | --- |
| Diseño | Ana | ✅ |
| Backend | Luis | ⏳ |
| Pruebas | Marta | ❌ |

Fragmento de la configuración acordada:

```json
{ "release": "2.6.6", "tema": "upo", "activo": true }
```

> [!TIP]
> Si algo no se ve bien con un tema, probad **UPO mixto** o **GitHub claro**.

Un saludo :wave:

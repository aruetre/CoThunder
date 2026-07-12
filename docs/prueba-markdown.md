# CoThunder — Prueba de Markdown

> Copia el contenido de este archivo en el editor Markdown de la redacción para
> ver cómo se renderiza cada etiqueta. Cubre toda la sintaxis básica y extendida.

---

## 1. Encabezados

# Encabezado 1
## Encabezado 2
### Encabezado 3
#### Encabezado 4
##### Encabezado 5
###### Encabezado 6

### Encabezado con ID {#mi-id-personalizado}

---

## 2. Énfasis en línea

Texto normal, **negrita**, *cursiva*, _cursiva con guion bajo_, ***negrita y cursiva***, ___también así___.

Tachado: ~~esto está tachado~~.

Resaltado: necesito ==resaltar esto== dentro de la frase.

Subíndice y superíndice: H~2~O y X^2^ + Y^2^.

Código en línea: usa la función `render()` con `a < b && c > d`.

Escapado con barra invertida: \*esto no es cursiva\* y \_esto tampoco\_ y \# no es encabezado.

---

## 3. Enlaces y correos

Enlace normal: [Markdown Guide](https://www.markdownguide.org).

Enlace con título: [pasa el ratón](https://example.com "Título del enlace").

Autoenlace angular: <https://www.thunderbird.net>.

Autoenlace de URL suelta: visita https://addons.thunderbird.net directamente.

Correo: escríbeme a <alguien@ejemplo.com>.

Enlace de SharePoint (con `==` y `:x:`, no debe romperse): https://contoso.sharepoint.com/:x:/g/personal/user/EabcXYZ==

---

## 4. Imágenes

Imagen web (puede que tu cliente pida "cargar imágenes"):

![Gatito de prueba](https://placekitten.com/240/140 "Un gatito")

Imagen enlazada (la imagen es un enlace):

[![Logo](https://www.thunderbird.net/media/img/thunderbird/favicon.png)](https://www.thunderbird.net)

---

## 5. Listas

### Desordenada (con anidación)

- Primer elemento
- Segundo elemento
  - Sub-elemento a
  - Sub-elemento b
    - Sub-sub-elemento
- Tercer elemento

### Ordenada (con anidación)

1. Uno
2. Dos
   1. Dos punto uno
   2. Dos punto dos
3. Tres

### Lista de tareas

- [x] Tarea completada
- [ ] Tarea pendiente
- [ ] Otra pendiente con **negrita**

---

## 6. Citas y admonitions

### Cita normal

> Esto es una cita.
> Sigue en la misma cita.

### Cita anidada

> Nivel uno
> > Nivel dos dentro de la cita

### Admonitions (cajas de colores)

> [!NOTE]
> Esto es una nota informativa.

> [!TIP]
> Un consejo útil con **énfasis** dentro.

> [!IMPORTANT]
> Algo importante que no debes pasar por alto.

> [!WARNING]
> Cuidado con esto.

> [!CAUTION]
> Acción potencialmente peligrosa.

---

## 7. Código en bloque (con resaltado de sintaxis)

JavaScript:

```js
// suma dos números
function suma(a, b) {
  const total = a + b;
  return total; // devuelve el resultado
}
```

Python:

```python
# saluda al mundo
def saludar(nombre):
    mensaje = "Hola, " + nombre
    return mensaje  # cadena resultante
```

JSON:

```json
{
  "nombre": "CoThunder",
  "version": 2.5,
  "activo": true
}
```

Bash:

```bash
# lista y filtra
ls -la | grep ".xpi"
echo "hecho"
```

SQL:

```sql
-- selecciona usuarios activos
SELECT nombre, email FROM usuarios WHERE activo = 1;
```

Bloque sin lenguaje (sin colores, escapado seguro):

```
<script>alert("no se ejecuta")</script>
a < b && c > d
```

---

## 8. Tablas

| Función | Descripción | Estado |
| --- | --- | --- |
| Editor | Panel dividido con preview | ✅ |
| Envío | Maquetado en un clic | ✅ |
| Imágenes | Se conservan | ✅ |

Tabla pegada a un párrafo (sin línea en blanco):

Resultados del trimestre:
| Mes | Ventas |
| - | - |
| Enero | 100 |
| Febrero | 120 |

---

## 9. Regla horizontal

Texto antes de la regla.

---

Texto después de la regla.

---

## 10. Notas al pie

Aquí hay una afirmación con nota al pie.[^1] Y otra más.[^nota]

[^1]: Esta es la primera nota al pie.
[^nota]: Las notas admiten **énfasis** y se numeran por orden de aparición.

---

## 11. Listas de definición

Markdown
: Lenguaje de marcado ligero para dar formato a texto.

CoThunder
: Extensión de Thunderbird que integra Copilot y este editor Markdown.

---

## 12. Emoji

Buen trabajo :+1: :tada: — esto está :fire:. Recuerda :bulb: revisar el :calendar: y avisar con :warning: si hay un :bug:.

---

## 13. Combinado (correo de ejemplo)

# Informe semanal :rocket:

Hola equipo,

Resumen de la semana con lo **más relevante**:

1. Cerramos el *hito 1* (ver [detalles](https://example.com "Hito 1")).
2. Pendiente revisar la ~~versión antigua~~ nueva configuración.

> [!IMPORTANT]
> La entrega es el **viernes**. Avisad si hay bloqueos.

| Tarea | Responsable | Estado |
| --- | --- | --- |
| Diseño | Ana | ✅ |
| Backend | Luis | ⏳ |

```js
const estado = "en progreso";
```

Un saludo :wave:

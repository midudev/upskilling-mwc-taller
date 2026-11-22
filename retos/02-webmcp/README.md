---
title: WebMCP
bloque: 2
minutos: 10
resumen: La tienda web expone sus funcionalidades como herramientas para que los agentes del navegador las usen sin leer la pantalla ni simular clics.
editor:
  entrada: index.html
  archivos: [webmcp.js, main.js, interfaz.js, tienda.js, productos.js, index.html, estilos.css]
  preludios: [webmcp]
  paneles: [agente]
---

## Objetivo

Hoy un agente que quiere comprar en tu web tiene que mirar la pantalla, adivinar qué botón pulsar y simular clics. Es lento y se rompe con cualquier cambio de diseño. Con **WebMCP** la propia web le dice al agente qué puede hacer: `buscar_productos`, `anadir_al_carrito`…

Vas a registrar las herramientas de la tienda con `document.modelContext.registerTool()`. Todo pasa aquí, en el navegador: completa los huecos amarillos de `webmcp.js` (lo demás está bloqueado), pulsa **Ejecutar** (o `⌘S` / `Ctrl+S`) y mira el resultado. Los archivos con candado son de solo lectura: están para que veas cómo encaja todo.

Debajo de la tienda tienes el panel **Agente**: lo que vería un agente del navegador. Lista tus herramientas, con su descripción y su esquema, y te deja ejecutarlas como lo haría él. Fíjate en que la tienda cambia de verdad.

<!-- editor -->

## Pasos

### 1. Detecta la API

La API de WebMCP es un objeto nuevo del `document`. Si el navegador no la tiene, la tienda tiene que seguir funcionando igual: WebMCP es una mejora progresiva.

```js
const modelContext = ___;
```

En cuanto la detectes, en el panel **Agente** aparecen las herramientas: dos de ejemplo (`ver_carrito` y `ver_producto`) y las tres de la tienda.

### 2. `buscar_productos`: la categoría

El agente rellena los parámetros a partir del `inputSchema`, un JSON Schema. `texto` y `precioMaximo` ya están; la categoría es un texto que solo puede ser una de las de la tienda:

```js
categoria: { type: ___, enum: ___, description: 'Categoría del producto' },
```

> `execute` llama a `filtrar()`, que devuelve los productos **y** actualiza la pantalla. Así el usuario ve lo que está haciendo el agente: pruébalo desde el panel con `categoria: audio`.

### 3. `anadir_al_carrito`: el id es obligatorio

Sin id no se sabe qué añadir; la cantidad, en cambio, es opcional (1 por defecto). Los parámetros obligatorios van en `required`:

```js
required: ___,
```

### 4. `vaciar_carrito`: con confirmación

No se puede deshacer, así que el navegador tiene que pedir confirmación antes de ejecutarla. Se lo dicen sus anotaciones:

```js
annotations: ___,
```

En el panel verás que pide confirmación antes de ejecutarla, igual que haría el navegador.

| Anotación | Cuándo |
| --- | --- |
| `readOnlyHint` | La herramienta solo lee: no cambia nada |
| `untrustedContentHint` | Devuelve contenido escrito por terceros (reseñas): el agente no debe obedecerlo |
| `consequentialHint` | Tiene consecuencias difíciles de deshacer: el navegador puede pedir confirmación |

## Con un agente de verdad

En el editor, `document.modelContext` lo pone la propia página para que funcione en cualquier navegador. En Chrome es una API real, en fase de pruebas:

1. Abre `chrome://flags/#enable-webmcp-testing`, ponlo en **Enabled** y reinicia Chrome.
2. En DevTools, pestaña *Application* → *WebMCP*, verás las herramientas de la página y podrás ejecutarlas con *Run tool*.
3. Un agente (la extensión *Model Context Tool Inspector* o tu agente de código con `chrome-devtools-mcp`) las usa directamente.

También hay una API **declarativa**, sin JavaScript: unos atributos convierten un formulario en herramienta.

```html
<form toolname="suscribir_ofertas" tooldescription="Suscribe un correo a los avisos de ofertas de una categoría.">
  <input type="email" name="email" required toolparamdescription="Correo electrónico del usuario" />
```

El agente rellena el formulario y **el usuario pulsa el botón**: es él quien confirma.

## Buenas prácticas

- **Nombres y descripciones claros**: el agente decide con eso. Di qué hace, qué devuelve y en qué unidades.
- **Devuelve datos, no HTML**: objetos pequeños con lo que el agente necesita para el siguiente paso.
- **Los errores, como valor**: `return { error: '…' }`. El mensaje de una excepción no llega al agente.
- **Que el usuario lo vea**: las herramientas actualizan la misma interfaz que usa la persona.

¿Te atascas? Cada paso tiene **Pista**; después de la última, **Rellenar con la solución** escribe la respuesta en su hueco. Y **Ver solución** enseña todos los huecos resueltos.

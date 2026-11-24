---
title: MCP UI
bloque: 1
minutos: 10
resumen: Un servidor MCP para la tienda que, además de texto, devuelve una interfaz interactiva con el catálogo dentro del chat.
editor:
  entrada: probador.html
  archivos: [server.js, vista/app.js, vista/index.html, vista/estilos.css, tienda.js, productos.js]
  ocultos: [probador.html, probador.js]
  generados: [{ ruta: lib/vista.js, tipo: vista-mcp-app, carpeta: vista }]
---

## Objetivo

El servidor MCP de la tienda ya tiene una herramienta `buscar_productos`, pero sin interfaz. Vas a convertirla en una **MCP App**: el asistente mostrará una cuadrícula de productos dentro del chat, con un botón para añadir al carrito que llama de vuelta al servidor.

<figure class="flujo">
<div class="flujo-scroll">
<div class="flujo-grid">
  <div class="flujo-panel flujo-panel--cliente" aria-hidden="true"></div>
  <div class="flujo-panel flujo-panel--servidor" aria-hidden="true"></div>
  <p class="flujo-titulo flujo-tc"><strong>Cliente MCP</strong> <span>el chat · VS Code, Claude…</span></p>
  <p class="flujo-titulo flujo-ts"><strong>Servidor MCP</strong> <span>la tienda · <code>server.js</code></span></p>
  <div class="flujo-c1">
    <p class="chat chat--usuario">busca algo de audio</p>
    <div class="chat chat--modelo">
      <p class="chat-quien">◆ modelo</p>
      <p>Busco en la tienda…</p>
      <p class="chat-tool"><code>buscar_productos({ categoria: 'audio' })</code></p>
    </div>
  </div>
  <div class="flujo-m flujo-m1">
    <span class="flujo-n">1</span>
    <p class="flecha flecha--ida"><code>tools/call</code></p>
    <p class="flecha flecha--vuelta"><code>texto + datos</code></p>
  </div>
  <div class="pieza flujo-s1">
    <p class="pieza-tipo">herramienta · <code>registerAppTool</code> <span class="todo">TODO 1–2</span></p>
    <p class="pieza-nombre"><code>buscar_productos</code></p>
    <p class="pieza-meta"><code>_meta.ui.resourceUri</code> <code class="uri">ui://tienda/catalogo.html</code></p>
    <dl>
      <dt><code>content</code></dt>
      <dd>texto para el modelo</dd>
      <dt><code>structuredContent</code></dt>
      <dd>datos para la vista</dd>
    </dl>
  </div>
  <div class="iframe flujo-cv">
    <p class="iframe-barra"><span class="iframe-puntos" aria-hidden="true"></span> <code class="uri">ui://tienda/catalogo.html</code> <span class="iframe-tag">iframe aislado</span></p>
    <p class="flujo-nota"><span class="flujo-n">3</span> <span>El cliente pinta el HTML y le pasa los datos con <code>toolresult</code> <span class="todo">TODO 4</span></span></p>
    <ul class="iframe-productos">
      <li><span class="emoji">🎧</span> Auriculares <b>149 €</b> <span class="boton boton--activo">Añadir</span></li>
      <li><span class="emoji">🎙️</span> Micrófono <b>79 €</b> <span class="boton">Añadir</span></li>
      <li><span class="emoji">🔊</span> Altavoz <b>59 €</b> <span class="boton">Añadir</span></li>
    </ul>
    <p class="flujo-nota"><span class="flujo-n">4</span> <span>El botón llama al servidor con <code>app.callServerTool()</code> <span class="todo">TODO 5</span></span></p>
    <p class="iframe-carrito">Carrito · 1 · 149 €</p>
  </div>
  <div class="flujo-m flujo-m2">
    <span class="flujo-n">2</span>
    <p class="flecha flecha--ida"><code>resources/read</code></p>
    <p class="flecha flecha--vuelta"><code>HTML</code></p>
  </div>
  <div class="pieza flujo-s2">
    <p class="pieza-tipo">recurso · <code>registerAppResource</code> <span class="todo">TODO 3</span></p>
    <p class="pieza-nombre uri"><code>ui://tienda/catalogo.html</code></p>
    <p class="pieza-desc">La carpeta <code>vista/</code> empaquetada en un único HTML</p>
  </div>
  <div class="flujo-m flujo-m3">
    <span class="flujo-n">4</span>
    <p class="flecha flecha--ida"><code>callServerTool</code></p>
    <p class="flecha flecha--vuelta"><code>carrito</code></p>
  </div>
  <div class="pieza flujo-s3">
    <p class="pieza-tipo">herramienta · <code>registerTool</code> <span class="muted">ya hecha</span></p>
    <p class="pieza-nombre"><code>anadir_al_carrito</code></p>
    <p class="pieza-desc"><code>{ id, cantidad }</code> → carrito. La puede usar el modelo… y también la vista</p>
  </div>
  <p class="flujo-nota flujo-c5"><span class="flujo-n flujo-n--extra">5</span> <span><code>app.updateModelContext()</code> avisa al modelo de lo que ha hecho el usuario <span class="muted">(ya hecho)</span></span></p>
</div>
</div>
<figcaption><span class="leyenda leyenda--ida">petición</span> <span class="leyenda leyenda--vuelta">respuesta</span> <span><span class="todo">TODO n</span> dónde lo completas: 1–3 en <code>server.js</code>, 4–5 en <code>vista/app.js</code></span></figcaption>
</figure>

Aquí no hace falta Node: tu `server.js` se ejecuta en el navegador y la pestaña **Resultado** es un cliente MCP, un *probador*. Empieza con una consulta de ejemplo («busca algo de audio») y te deja **chatear libremente** para probar tus herramientas (usa el modelo del taller si tienes token, o un modo local si no). Arriba muestra cuántas herramientas se han detectado correctas y, debajo, los checks de cada una y formularios para probarlas a mano. Los TODO 1 a 3 están en `server.js`; el 4 y el 5, en `vista/app.js`. Solo se escribe en sus huecos amarillos: lo demás está bloqueado.

<!-- editor -->

## Pasos

### 1. La herramienta apunta a su vista

En `server.js`, `buscar_productos` ya se registra con `registerAppTool`, la versión de MCP Apps de `server.registerTool`. Lo que la convierte en una herramienta con interfaz es su `_meta`: la dirección `ui://` de la vista que la muestra.

```js
_meta: { ui: { resourceUri: ___ } },
```

### 2. Los datos para la vista

La herramienta devuelve dos cosas: `content`, el texto que lee el modelo (y lo que ven los clientes que no muestran interfaces), y `structuredContent`, los datos con los que se pinta la vista.

```js
structuredContent: { productos: ___, carrito: ___ },
```

### 3. El recurso con el HTML

La herramienta apunta a `ui://tienda/catalogo.html` y el cliente lo pide con `resources/read`. El recurso ya está registrado con `registerAppResource`; falta lo que devuelve: un HTML de MCP Apps (su `mimeType`) y el propio HTML.

```js
{ uri: VISTA_CATALOGO, mimeType: ___, text: await ___ },
```

`crearVista()` junta `vista/index.html`, `vista/estilos.css` y `vista/app.js` en un único HTML: el cliente muestra la vista en un iframe aislado, sin acceso a archivos externos. En cuanto ejecutes, el probador pinta la vista… todavía vacía.

### 4. La vista recibe el resultado

En `vista/app.js`, el cliente le pasa a la vista el resultado de la herramienta con el evento `toolresult`. Saca de él los datos del paso 2:

```js
const { productos, carrito } = ___;
```

### 5. La vista llama al servidor

El botón «Añadir» no habla con el servidor directamente: le pide al cliente que llame a otra herramienta.

```js
const resultado = await app.callServerTool({ name: ___, arguments: { id: ___, cantidad: 1 } });
```

Debajo de la vista, el probador apunta lo que le pide: verás la llamada `tools/call anadir_al_carrito`. Después, la vista avisa al modelo con `app.updateModelContext()` (ya está hecho): si el usuario añade algo desde la interfaz, el modelo no se entera de otra forma.

## Qué te llevas

- Una herramienta MCP puede devolver **texto para el modelo** y **datos para una interfaz** a la vez.
- La interfaz es un recurso `ui://` con HTML que el cliente muestra en un **iframe aislado**.
- La comunicación es en los dos sentidos: `toolresult` (cliente → vista) y `callServerTool` (vista → servidor).

¿Te atascas? Cada paso tiene **Pista**; después de la última, **Rellenar con la solución** escribe la respuesta en su hueco. Y **Ver solución** enseña todos los huecos resueltos.

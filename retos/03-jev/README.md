---
title: Jev
bloque: 3
minutos: 10
resumen: Decisiones rápidas y estructuradas para la tienda, con una búsqueda inteligente que puntúa el catálogo y un moderador de reseñas.
editor:
  entrada: index.html
  archivos: [jev.js, main.js, interfaz.js, tienda.js, productos.js, index.html, estilos.css]
  ocultos: [config.js]
---

## Objetivo

Muchas veces no necesitas que un modelo *escriba*: necesitas que **decida**. ¿Este producto encaja con lo que busca el cliente? ¿Esta reseña es spam? Con un modelo generativo tendrías que pedir un JSON, esperar y cruzar los dedos.

**Jev** (de TypeSafe) responde preguntas sobre un contenido con datos que tu código usa tal cual:

| Tipo | Pregunta | Respuesta |
| --- | --- | --- |
| `choice` | Elige una opción | `choice: 'envio'`, `confidence`, `probabilities` |
| `score` | Puntúa en una escala | `score: 1.7` (media ponderada de los niveles) |
| `noul` | ¿Sí o no? | `noul: 0.93` (probabilidad de «sí») |

Vas a añadir dos funciones a la tienda: **búsqueda inteligente** y **moderación de reseñas**. Todo el trabajo está en los huecos amarillos de `jev.js`. El token del taller se toma del que hayas guardado en la web (se inyecta en `config.js`).

<!-- editor -->

## Pasos

### 1. La llamada a Jev

`preguntarAJev(state, questions)` hace un `POST` a la API del taller. Falta lo que lleva la petición: el token (en la cabecera `Authorization`) y el cuerpo.

```js
headers: { Authorization: `Bearer ${___}`, 'Content-Type': 'application/json' },
body: JSON.stringify(___),
```

- `state`: el contenido sobre el que se pregunta (texto u objeto).
- `questions`: un objeto. Cada clave es el nombre que tú eliges; la respuesta vuelve con esa misma clave.

### 2. Búsqueda inteligente

Las preguntas ya están hechas: **una pregunta `score` por producto, todas en la misma llamada**. `answers[producto.id].score` va de `0` a `2` (la posición en `NIVELES`); pásalo a un encaje entre `0` y `1`. Filtrar y ordenar ya está hecho.

```js
encaje: ___,
```

Pruébalo en el resultado: «un regalo para alguien que teletrabaja, por menos de 60 €». Fíjate en el tiempo que aparece junto a los resultados: doce decisiones en una sola llamada. En la **Consola** verás las respuestas de Jev.

### 3. Moderar reseñas

Antes de publicar una reseña, tres preguntas en una llamada (`noul`, `choice` y `score`). El código decide con números: `inapropiada.noul` es la probabilidad de «sí» (de 0 a 1) y `nota.score` va de 0 a 4.

```js
const inapropiada = ___;
const estrellas = ___;
```

Pruébalo: abre un producto y escribe una reseña normal, una con publicidad y una que hable de fútbol.

> Los pasos se comprueban llamando a Jev de verdad con el token del taller que hayas guardado arriba. Para no gastar peticiones mientras escribes, se comprueban solo cuando pulsas **Ejecutar** (y solo los pasos donde ya hayas rellenado los `___`).

## Qué te llevas

- **Sin interpretar texto**: nada de `JSON.parse` ni de «responde solo con sí o no».
- **Probabilidades, no solo respuestas**: tú eliges el umbral (`> 0.5`, `> 0.9`…) según lo que cueste equivocarse.
- **Varias preguntas por llamada** sobre el mismo contenido.
- Úsalo para clasificar, enrutar, moderar, ordenar o validar. Para redactar texto sigue haciendo falta un modelo generativo.

# En directo: IA en local con runonweb

Una foto de la tienda pasa por tres modelos que se ejecutan en el navegador con [runonweb](https://runonweb.ai): uno quita el fondo, otro la describe en español y otro lee la descripción en voz alta. Sin servidor, sin API key y sin que la foto salga del dispositivo. El código está en `foto.js` y se ve en `/directo/runonweb` de la web del taller (`pnpm dev` en la raíz).

**En directo no se escribe código: se descomenta.** Selecciona las líneas de código de cada `PASO N` y pulsa `Cmd + /`. La página se recarga sola al guardar.

| Paso | Módulo | Qué se ve |
| --- | --- | --- |
| 1 | `runonweb/remove-bg` | El producto sin fondo (PNG transparente) |
| 2 | `runonweb/caption` | La descripción de la foto, escribiéndose en español |
| 3 | `runonweb/tts` | La descripción leída en voz alta |

Los tres modelos pesan unos 670 MB en total. **Ábrelos una vez antes de la charla** (descomenta los tres pasos, pulsa **Todo** y vuelve a empezar): se quedan en la caché del navegador y en directo cargan en segundos.

Para volver a empezar: `git checkout -- foto.js`.

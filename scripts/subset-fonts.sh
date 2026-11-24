#!/usr/bin/env bash
# Genera las fuentes optimizadas de src/assets/fonts/ a partir del paquete `geist`:
# subset a los glifos que usa la web, sin hinting, sin tablas innecesarias y en woff2.
# Uso: pnpm fonts   (requiere uv: https://docs.astral.sh/uv/)
# Vuelve a ejecutarlo si añades contenido con símbolos nuevos (flechas, cajas, emojis de texto…).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=node_modules/geist/dist/fonts
OUT=src/assets/fonts
FT=(uvx --from 'fonttools[woff]' fonttools)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Base fija para que el contenido nuevo en español/catalán no caiga al fallback:
# ASCII imprimible, Latin-1 (á é í ó ú ñ ü ç ¿ ¡ « » · …) y la puntuación tipográfica habitual.
BASE='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC,U+2122,U+2212'

# Más todos los caracteres que aparecen en el contenido real de la web (páginas, datos y retos).
# Los que no existen en la fuente (p. ej. emojis) se ignoran.
{ find src -type f \( -name '*.astro' -o -name '*.ts' -o -name '*.css' -o -name '*.md' \); ls retos/*/README.md; } |
  xargs cat >"$TMP/text.txt"

OPTS=(
  --unicodes="$BASE"
  --text-file="$TMP/text.txt"
  # Solo las features que el navegador aplica por defecto (rvrn: sustituciones de la variable)
  --layout-features='kern,liga,ccmp,locl,mark,mkmk,rvrn'
  --no-hinting
  --desubroutinize
  --drop-tables+=DSIG,meta,STAT
  --name-IDs=1,2
  --flavor=woff2
)

mkdir -p "$OUT"

# Geist Mono variable recortada a los pesos que usa la web: 400, 500 (.intro strong) y 700 (<strong>, <th>)
"${FT[@]}" varLib.instancer "$SRC/geist-mono/GeistMono-Variable.ttf" wght=400:700 -q -o "$TMP/mono.ttf"
"${FT[@]}" subset "$TMP/mono.ttf" "${OPTS[@]}" --output-file="$OUT/GeistMono-Latin.woff2"
# Geist Sans variable recortada para lectura cómoda en los textos largos de los retos (400–600)
"${FT[@]}" varLib.instancer "$SRC/geist-sans/Geist-Variable.ttf" wght=400:600 -q -o "$TMP/sans.ttf"
"${FT[@]}" subset "$TMP/sans.ttf" "${OPTS[@]}" --output-file="$OUT/Geist-Latin.woff2"
"${FT[@]}" subset "$SRC/geist-pixel/GeistPixel-Square.woff2" "${OPTS[@]}" --output-file="$OUT/GeistPixel-Square-Latin.woff2"

ls -l "$OUT"

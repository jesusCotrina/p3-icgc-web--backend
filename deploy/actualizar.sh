#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Actualiza UN servicio en el servidor con una imagen nueva del registro
# (GitHub Container Registry). Lo ejecuta GitHub Actions por SSH; el mismo
# archivo vive en el repo del backend y en el del gestor.
#
#   echo "$TOKEN" | DIR=/opt/icgc SERVICIO=backend VAR_IMAGEN=BACKEND_IMAGE \
#     IMAGEN=ghcr.io/dueño/repo:sha SALUD_URL=http://127.0.0.1:4000/api/health \
#     bash actualizar.sh
#
# Variables:
#   DIR          carpeta del proyecto en el servidor (con docker-compose.prod.yml y .env)
#   SERVICIO     servicio de docker compose a actualizar
#   VAR_IMAGEN   variable del .env que guarda la imagen en uso (p. ej. BACKEND_IMAGE)
#   IMAGEN       imagen nueva, con su tag (el sha del commit)
#   SALUD_URL    URL local que debe responder 200 cuando el servicio está bien
#   REGISTRO, REGISTRO_USUARIO   registro y usuario para `docker login`
#   NGINX_SITIO, DOMINIO         (opcional) instala el sitio de Nginx y su https
#                                la primera vez; después no lo toca
#
# El token de lectura del registro llega por la entrada estándar (nunca por
# argumentos: quedaría a la vista en la lista de procesos).
#
# Si el servicio nuevo no responde, vuelve a la imagen anterior y falla: el
# sitio nunca queda caído por un despliegue malo.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${DIR:?}" "${SERVICIO:?}" "${VAR_IMAGEN:?}" "${IMAGEN:?}" "${SALUD_URL:?}"
REGISTRO="${REGISTRO:-ghcr.io}"
COMPOSE="docker compose -f $DIR/docker-compose.prod.yml --project-directory $DIR"

paso() { printf '\n==> %s\n' "$1"; }

# El token se lee antes que nada; después nadie más lee la entrada estándar
TOKEN="$(head -n1 || true)"
exec </dev/null

mkdir -p "$DIR"
touch "$DIR/.env"
chmod 600 "$DIR/.env"

# ── Nginx y https (solo la primera vez en un servidor nuevo) ────────────────
if [ -n "${NGINX_SITIO:-}" ] && [ -f "/tmp/$NGINX_SITIO.conf" ]; then
  if [ ! -f "/etc/nginx/sites-available/$NGINX_SITIO" ]; then
    paso "Instalando el sitio de Nginx $NGINX_SITIO"
    cp "/tmp/$NGINX_SITIO.conf" "/etc/nginx/sites-available/$NGINX_SITIO"
    ln -sf "/etc/nginx/sites-available/$NGINX_SITIO" "/etc/nginx/sites-enabled/$NGINX_SITIO"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t -q && systemctl reload nginx
  fi
  rm -f "/tmp/$NGINX_SITIO.conf"
  # https: requiere que el DNS del dominio ya apunte a este servidor
  if [ -n "${DOMINIO:-}" ] && [ ! -d "/etc/letsencrypt/live/$DOMINIO" ]; then
    paso "Pidiendo el certificado https para $DOMINIO"
    certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos \
      --register-unsafely-without-email --redirect \
      || echo "::warning::No se pudo obtener https para $DOMINIO (¿el DNS ya apunta a este servidor?)"
  fi
fi

# ── Imagen nueva ─────────────────────────────────────────────────────────────
paso "Descargando $IMAGEN"
if [ -n "$TOKEN" ]; then
  echo "$TOKEN" | docker login "$REGISTRO" -u "${REGISTRO_USUARIO:-github}" --password-stdin >/dev/null
fi
docker pull -q "$IMAGEN"
[ -n "$TOKEN" ] && docker logout "$REGISTRO" >/dev/null

ANTERIOR="$(grep -E "^$VAR_IMAGEN=" "$DIR/.env" | tail -n1 | cut -d= -f2- || true)"

usar_imagen() {
  sed -i "/^$VAR_IMAGEN=/d" "$DIR/.env"
  echo "$VAR_IMAGEN=$1" >> "$DIR/.env"
  $COMPOSE up -d --remove-orphans "$SERVICIO"
}

responde() {
  for _ in $(seq 1 45); do
    curl -fs -o /dev/null "$SALUD_URL" && return 0
    sleep 2
  done
  return 1
}

paso "Levantando $SERVICIO"
usar_imagen "$IMAGEN"

if responde; then
  echo "$SERVICIO responde en $SALUD_URL"
else
  echo "::error::$SERVICIO no respondió con la imagen nueva"
  $COMPOSE logs --tail 60 "$SERVICIO" || true
  if [ -n "$ANTERIOR" ] && [ "$ANTERIOR" != "$IMAGEN" ]; then
    paso "Volviendo a la imagen anterior: $ANTERIOR"
    usar_imagen "$ANTERIOR"
    responde && echo "restaurado" || echo "::error::la imagen anterior tampoco responde"
  fi
  exit 1
fi

# Las imágenes viven en el registro de GitHub: en el servidor solo queda la
# que está en uso (el disco del droplet es chico)
paso "Limpiando imágenes viejas"
docker image prune -af >/dev/null
$COMPOSE ps
df -h / | tail -n1
free -m | sed -n 2p

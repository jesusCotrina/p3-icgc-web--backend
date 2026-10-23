#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prepara el droplet (Ubuntu/Debian) para el backend del ICGC.
# Se puede ejecutar varias veces: cada paso revisa si ya está hecho.
#
#   ssh root@IP 'bash -s' < instalar-servidor.sh
#
# Hace: swap de 2 GB, Docker + Compose, Nginx + Certbot, firewall,
# /opt/icgc con su .env (secretos aleatorios) y la carpeta de uploads.
# NO toca la configuración SSH ni borra nada existente.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMINIO_API="api.prometeoperu.com"
DIR=/opt/icgc

paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

paso "Memoria de intercambio (swap) de 2 GB"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Usar el swap solo cuando de verdad falte RAM
  sysctl -q vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-icgc-swap.conf
  echo "swap creado"
else
  echo "ya existía"
fi

paso "Paquetes: Docker, Compose, Nginx, Certbot, firewall"
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw nginx certbot python3-certbot-nginx >/dev/null
if ! command -v docker >/dev/null; then
  apt-get install -y -qq docker.io >/dev/null
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null
docker --version
docker compose version

paso "Firewall: solo SSH, http y https"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/   /'

paso "Carpetas en $DIR"
mkdir -p "$DIR/uploads/images" "$DIR/uploads/videos" "$DIR/uploads/logo"
# El contenedor corre con el usuario "node" (uid 1000)
chown -R 1000:1000 "$DIR/uploads"

paso "Variables de entorno ($DIR/.env)"
if [ ! -f "$DIR/.env" ]; then
  aleatorio() { openssl rand -hex "$1"; }
  cat > "$DIR/.env" <<EOF
# Generado por instalar-servidor.sh — NO subir a git.
POSTGRES_USER=icgc
POSTGRES_PASSWORD=$(aleatorio 24)
POSTGRES_DB=icgc

JWT_SECRET=$(aleatorio 48)
JWT_EXPIRES_IN=7d

# URL pública de este backend: con ella se arman las URLs de las fotos
PUBLIC_API_URL=https://$DOMINIO_API

# Dominios que pueden llamar a la API desde el navegador (web y gestor).
# Acepta comodines: https://mi-proyecto*.vercel.app cubre las vistas previas.
CORS_ORIGINS=https://p3-icgc-web-frontend*.vercel.app

# La web se regenera al publicar desde el gestor (mismo secreto en Vercel)
WEB_REVALIDATE_URL=https://p3-icgc-web-frontend.vercel.app/api/revalidate
REVALIDATE_SECRET=$(aleatorio 32)

MAX_IMAGE_SIZE_MB=10
MAX_VIDEO_SIZE_MB=500
EOF
  chmod 600 "$DIR/.env"
  echo ".env creado con secretos nuevos"
else
  echo "ya existía: no se modifica"
fi

paso "Nginx para $DOMINIO_API"
if [ -f /tmp/icgc-nginx-api.conf ]; then
  cp /tmp/icgc-nginx-api.conf /etc/nginx/sites-available/icgc-api
  ln -sf /etc/nginx/sites-available/icgc-api /etc/nginx/sites-enabled/icgc-api
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  echo "configuración aplicada"
else
  echo "falta /tmp/icgc-nginx-api.conf (se sube antes de ejecutar este script)"
fi

paso "Listo"
free -m | sed 's/^/   /'
df -h / | sed 's/^/   /'

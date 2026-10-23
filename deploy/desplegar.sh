#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Despliega el backend en el droplet desde tu PC (Git Bash).
#
#   cd backend && bash deploy/desplegar.sh              # actualiza el código
#   cd backend && bash deploy/desplegar.sh --con-datos  # 1.ª vez: copia también
#                                                       # la base de datos y las fotos
#
# La imagen se compila aquí (en el droplet de 512 MB no alcanza la memoria)
# y se sube comprimida. Requiere Docker Desktop y acceso SSH por clave
# (en Windows, cargada en el agente SSH de Windows).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash: no convertir /opt/... en rutas de Windows

SERVIDOR="${SERVIDOR:-root@159.65.237.93}"

# En Windows se usa el ssh de Windows: toma la clave del agente SSH de Windows
# (con la frase ya ingresada). El ssh de Git Bash no ve ese agente.
WIN_SSH=/c/Windows/System32/OpenSSH
if [ -x "$WIN_SSH/ssh.exe" ]; then ssh() { "$WIN_SSH/ssh.exe" "$@"; }; scp() { "$WIN_SSH/scp.exe" "$@"; }; fi
DIR=/opt/icgc
DB_LOCAL="${DB_LOCAL:-icgc-db}"   # contenedor de PostgreSQL de desarrollo
CON_DATOS=false
[ "${1:-}" = "--con-datos" ] && CON_DATOS=true

cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
# Ruta estilo C:/... para que la entiendan tanto Git Bash como el scp de Windows
command -v cygpath >/dev/null && TMP="$(cygpath -m "$TMP")"
trap 'rm -rf "$TMP"' EXIT
paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

paso "Compilando la imagen del backend (linux/amd64)"
docker build --platform linux/amd64 --target production -t icgc-backend:latest . -q
docker save icgc-backend:latest | gzip -1 > "$TMP/imagen.tar.gz"
du -h "$TMP/imagen.tar.gz" | cut -f1

paso "Subiendo imagen y configuración"
scp -q "$TMP/imagen.tar.gz" "$SERVIDOR:/tmp/icgc-imagen.tar.gz"
scp -q deploy/docker-compose.prod.yml "$SERVIDOR:$DIR/docker-compose.prod.yml"
scp -q deploy/nginx-api.conf "$SERVIDOR:/tmp/icgc-nginx-api.conf"

if $CON_DATOS; then
  paso "Copiando la base de datos y las fotos de desarrollo"
  docker exec "$DB_LOCAL" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$TMP/base.dump"
  tar --force-local -czf "$TMP/uploads.tar.gz" -C uploads --exclude='.gitkeep' .
  du -h "$TMP/base.dump" "$TMP/uploads.tar.gz" | sed 's/^/   /'
  scp -q "$TMP/base.dump" "$SERVIDOR:/tmp/icgc-base.dump"
  scp -q "$TMP/uploads.tar.gz" "$SERVIDOR:/tmp/icgc-uploads.tar.gz"
fi

paso "Aplicando en el servidor"
# El script remoto se sube como archivo: si se pasara por stdin, el primer
# "docker compose exec" se "come" el resto del script y se corta a la mitad
cat > "$TMP/remoto.sh" <<'REMOTO'
set -euo pipefail
cd "$DIR"
gunzip -c /tmp/icgc-imagen.tar.gz | docker load -q
rm -f /tmp/icgc-imagen.tar.gz

# Nginx: se actualiza la config del sitio sin pisar lo que Certbot agregó (https)
if ! grep -q 'managed by Certbot' /etc/nginx/sites-available/icgc-api 2>/dev/null; then
  cp /tmp/icgc-nginx-api.conf /etc/nginx/sites-available/icgc-api
  ln -sf /etc/nginx/sites-available/icgc-api /etc/nginx/sites-enabled/icgc-api
  rm -f /etc/nginx/sites-enabled/default
  nginx -t -q && systemctl reload nginx
fi

if [ "$CON_DATOS" = true ]; then
  docker compose -f docker-compose.prod.yml up -d db
  until docker compose -f docker-compose.prod.yml exec -T db pg_isready -q; do sleep 2; done
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
  docker compose -f docker-compose.prod.yml exec -T db \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl \
    < /tmp/icgc-base.dump || true
  tar -xzf /tmp/icgc-uploads.tar.gz -C "$DIR/uploads"
  chown -R 1000:1000 "$DIR/uploads"
  rm -f /tmp/icgc-base.dump /tmp/icgc-uploads.tar.gz
fi

docker compose -f docker-compose.prod.yml up -d
docker image prune -f >/dev/null
for i in $(seq 1 30); do
  curl -fs http://127.0.0.1:4000/api/health >/dev/null && break
  sleep 2
done
curl -fs http://127.0.0.1:4000/api/health && echo
docker compose -f docker-compose.prod.yml ps
free -m
REMOTO
scp -q "$TMP/remoto.sh" "$SERVIDOR:/tmp/icgc-remoto.sh"
ssh "$SERVIDOR" "CON_DATOS=$CON_DATOS DIR=$DIR bash /tmp/icgc-remoto.sh < /dev/null; rm -f /tmp/icgc-remoto.sh"

paso "Listo"

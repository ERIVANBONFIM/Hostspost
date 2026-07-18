#!/usr/bin/env bash
# Setup de 1 comando na VPS (rodar como root, DENTRO do repositório clonado).
# - Instala Docker se faltar
# - Cria deploy/.env (DOMAIN=:80 => HTTP no IP; ADMIN_TOKEN gerado)
# - Sobe app + backend com Docker Compose
#
# Uso:  bash deploy/vps-setup.sh
# Depois, para HTTPS: edite DOMAIN no deploy/.env para o seu domínio e rode de novo.
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

ENVF=deploy/.env
if [ ! -f "$ENVF" ]; then
  cp deploy/.env.example "$ENVF"
  # DOMAIN=:80 -> Caddy serve HTTP direto no IP (sem TLS). Troque pelo domínio p/ HTTPS.
  sed -i 's|^DOMAIN=.*|DOMAIN=:80|' "$ENVF"
  TOKEN=$(openssl rand -hex 24 2>/dev/null || (date +%s%N | sha256sum | cut -c1-48))
  sed -i "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=$TOKEN|" "$ENVF"
  echo "==> Gerado $ENVF (DOMAIN=:80, ADMIN_TOKEN definido)."
fi

echo "==> Subindo os containers..."
docker compose -f deploy/docker-compose.prod.yml --env-file "$ENVF" up -d --build

echo
echo "==> Estado:"
docker compose -f deploy/docker-compose.prod.yml ps
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo SEU_IP)
echo
echo "Pronto! Acesse:"
echo "  Portal:  http://$IP/portal.html"
echo "  Admin:   http://$IP/admin.html"
echo "  (launcher em http://$IP/)"

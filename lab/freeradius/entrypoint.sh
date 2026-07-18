#!/bin/sh
# Entrypoint do LAB: habilita o módulo sql, ativa-o nos sites e sobe o FreeRADIUS
# em modo debug (-X) para facilitar o diagnóstico durante a homologação.
set -e

RADDB=/etc/raddb

# 1) Habilita o módulo sql
ln -sf "$RADDB/mods-available/sql" "$RADDB/mods-enabled/sql"

# 2) Descomenta as referências "sql" nos sites (authorize/accounting/session/post-auth).
#    A regex casa uma linha que contenha SOMENTE um comentário "# sql".
for site in default inner-tunnel; do
    f="$RADDB/sites-enabled/$site"
    [ -f "$f" ] || continue
    sed -i 's/^[[:space:]]*#[[:space:]]*sql[[:space:]]*$/\tsql/' "$f"
done

# 3) Garante os certificados de bootstrap. O módulo eap vem habilitado por padrão e
#    exige certs/server.pem no boot; sem eles o radiusd nem inicia. Só gera se faltarem.
if [ ! -f "$RADDB/certs/server.pem" ]; then
    echo "[lab] Gerando certificados de bootstrap para o eap..."
    ( cd "$RADDB/certs" && make )       >/dev/null 2>&1 \
      || ( cd "$RADDB/certs" && ./bootstrap ) >/dev/null 2>&1 \
      || echo "[lab] AVISO: não gerei certs automaticamente. Se o eap falhar, rode: docker compose exec freeradius sh -c 'cd /etc/raddb/certs && make'"
fi

# 4) Sobe em foreground, modo debug. Troque -X por -f em uso prolongado.
echo "[lab] FreeRADIUS iniciando em modo debug (-X)..."
exec radiusd -X -f

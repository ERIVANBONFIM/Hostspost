#!/usr/bin/env bash
# Testes de aceite do LAB Hostspost — Nível 1 (só FreeRADIUS + MariaDB).
# Usa radclient DE DENTRO do container para simular o NAS MikroTik.
#
# Pré-requisitos: docker compose up -d (stack saudável).
# Uso: bash tests/run-acceptance.sh
set -uo pipefail

# Executa a partir do diretório do compose (lab/)
cd "$(dirname "$0")/.." || exit 1

SECRET="testing123"
RAD_AUTH="127.0.0.1:1812"
RAD_ACCT="127.0.0.1:1813"
USER_OK="12345678900"

FR() { docker compose exec -T freeradius "$@"; }
DB() { docker compose exec -T mariadb mysql -uradius -pradpass radius -N -B -e "$1" 2>/dev/null; }

pass=0; fail=0
ok()   { echo "  ✅ PASS: $1"; pass=$((pass+1)); }
ko()   { echo "  ❌ FAIL: $1"; fail=$((fail+1)); }

# radclient: envia $2 (conteúdo do pacote) para $1 (auth|acct), retorna a saída
send() {
  local kind="$1" target="$2" body="$3"
  printf '%s\n' "$body" | FR radclient -x "$target" "$kind" "$SECRET" 2>&1
}

echo "==> Aguardando o FreeRADIUS responder..."
for i in $(seq 1 30); do
  if printf 'User-Name="ping"\n' | FR radclient -c 1 "$RAD_AUTH" auth "$SECRET" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo
echo "=== T1 — Login com credencial válida deve ACEITAR e retornar banda ==="
DB "DELETE FROM radacct WHERE username='$USER_OK';"   # zera sessões residuais
out="$(send auth "$RAD_AUTH" "$(cat tests/packets/auth-valid.txt)")"
if grep -q "Access-Accept" <<<"$out"; then
  if grep -qi "Mikrotik-Rate-Limit" <<<"$out"; then
    ok "Access-Accept com Mikrotik-Rate-Limit (banda aplicada)"
  else
    ko "Aceitou, mas sem Mikrotik-Rate-Limit no retorno"
  fi
else
  ko "Esperava Access-Accept; veja a saída acima"
  echo "$out" | tail -20
fi

echo
echo "=== T8 — Usuário na blacklist deve REJEITAR ==="
out="$(send auth "$RAD_AUTH" "$(cat tests/packets/auth-blacklist.txt)")"
if grep -q "Access-Reject" <<<"$out"; then
  ok "Access-Reject para o CPF blacklistado (Auth-Type := Reject)"
else
  ko "Esperava Access-Reject para o CPF blacklistado"
  echo "$out" | tail -20
fi

echo
echo "=== T4 — Limite de 2 dispositivos por CPF (Simultaneous-Use := 2) ==="
DB "DELETE FROM radacct WHERE username='$USER_OK';"   # começa sem sessões abertas
# Abre 2 sessões (Acct-Start) para 2 MACs distintos
for n in 1 2; do
  body="Acct-Status-Type = Start
User-Name = \"$USER_OK\"
Acct-Session-Id = \"sess-dev$n\"
NAS-IP-Address = 127.0.0.1
NAS-Port = $n
Framed-IP-Address = 10.20.0.5$n
Calling-Station-Id = \"00-11-22-33-44-0$n\""
  send acct "$RAD_ACCT" "$body" >/dev/null
done
abertas="$(DB "SELECT COUNT(*) FROM radacct WHERE username='$USER_OK' AND acctstoptime IS NULL;")"
echo "  (sessões abertas em radacct: ${abertas:-?})"
# 3º dispositivo tenta autenticar -> deve ser rejeitado
body3="User-Name = \"$USER_OK\"
User-Password = \"senha-teste\"
NAS-IP-Address = 127.0.0.1
NAS-Port = 3
NAS-Port-Type = Wireless-802.11
Calling-Station-Id = \"00-11-22-33-44-03\""
out="$(send auth "$RAD_AUTH" "$body3")"
if grep -q "Access-Reject" <<<"$out"; then
  ok "3º dispositivo REJEITADO com 2 sessões abertas"
else
  ko "3º dispositivo NÃO foi rejeitado (verifique 'sql' na seção session do site default)"
  echo "$out" | tail -20
fi
# Limpeza: fecha as sessões de teste
DB "DELETE FROM radacct WHERE username='$USER_OK';"

echo
echo "======================================================"
echo "  Resultado: $pass PASS / $fail FAIL"
echo "======================================================"
[ "$fail" -eq 0 ]

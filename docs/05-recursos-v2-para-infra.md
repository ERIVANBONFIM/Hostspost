# 05 — Recursos V2 → Infraestrutura

Matriz de rastreabilidade: **cada recurso do painel admin da Versão 2** e o mecanismo
concreto de MikroTik/FreeRADIUS que o implementa em produção.

## 5.1 Matriz de rastreabilidade

| Recurso V2 (painel) | Camada | Mecanismo de produção | Detalhe |
|---------------------|--------|-----------------------|---------|
| Verificação por SMS | Portal | Fluxo no portal + walled garden do gateway SMS | [04](04-integracao-portal.md) |
| Login com Google | Portal | OAuth + walled garden Google | [04](04-integracao-portal.md) |
| Reconexão automática 30 dias | MikroTik | `mac-cookie-timeout=30d` | [02](02-mikrotik-hotspot.md), [04](04-integracao-portal.md) |
| Pesquisa NPS | Portal | Redirect pós-login; dado no app | [04](04-integracao-portal.md) |
| Página de avisos / Banner campanha | Portal | UI; walled garden se pré-login | [04](04-integracao-portal.md) |
| Termo LGPD em áudio | Portal | TTS no navegador; sem infra | [06](06-seguranca-lgpd.md) |
| **Limite de 2 dispositivos por CPF** | RADIUS | `Simultaneous-Use := 2` | §5.2 |
| **Filtro de conteúdo por categoria** | MikroTik/DNS | Address-list + DNS filtrado | §5.3 |
| **Agendamento de banda por horário** | RADIUS/MikroTik | CoA + `Mikrotik-Rate-Limit` ou scheduler | §5.4 |
| **Blacklist MAC/CPF** | RADIUS/MikroTik | `Auth-Type := Reject` + Disconnect/firewall | §5.5 |
| **Alertas automáticos** | Accounting | Consultas `radacct` + monitoramento | §5.6 |
| **Relatório mensal exportável** | Banco | Queries SQL em `radacct` | §5.7 |
| Segurança & LGPD (2FA, anonimização, auditoria) | Vários | Ver documento dedicado | [06](06-seguranca-lgpd.md) |

Toda ativação/desativação de toggle é registrada como **evento CONFIG** no log do app —
do lado da infra, isso significa que mudanças de comportamento (ex.: `mac-cookie-timeout`,
liberação de domínio) devem ser versionadas/auditadas junto (ver [06](06-seguranca-lgpd.md)).

## 5.2 Limite de 2 dispositivos por CPF

O CPF é o `username` no RADIUS. O atributo `Simultaneous-Use` limita sessões simultâneas.

```sql
-- Por usuário
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('CPF', 'Simultaneous-Use', ':=', '2');
```

Ou por **grupo** (aplica a todos do perfil), evitando repetir por CPF:

```sql
INSERT INTO radgroupcheck (groupname, attribute, op, value)
VALUES ('visitantes', 'Simultaneous-Use', ':=', '2');

INSERT INTO radusergroup (username, groupname, priority)
VALUES ('CPF', 'visitantes', 1);
```

**Requisito:** o FreeRADIUS precisa da seção `session` habilitada e do accounting em dia
(`radacct`) para contar sessões abertas. No MikroTik, `shared-users=2` no perfil reforça o
limite localmente (ver [02](02-mikrotik-hotspot.md)).

> **Toggle:** desligar o limite = trocar o valor para um número alto (ex.: `99`) no grupo,
> ou remover o atributo.

## 5.3 Filtro de conteúdo por categoria

Duas abordagens (podem ser combinadas):

**A) DNS filtrado (recomendado — cobre categorias com manutenção externa)**

Encaminhe o DNS dos visitantes a um resolvedor com filtro de categorias (adulto, apostas,
malware, etc.) e force o uso desse DNS:

```routeros
/ip dns set servers=DNS_FILTRADO_IP allow-remote-requests=yes
# Redireciona qualquer DNS do cliente para o resolvedor do gateway (evita bypass)
/ip firewall nat add chain=dstnat in-interface=bridge-visitantes protocol=udp dst-port=53 \
    action=redirect to-ports=53
/ip firewall nat add chain=dstnat in-interface=bridge-visitantes protocol=tcp dst-port=53 \
    action=redirect to-ports=53
# Bloqueia DoH conhecido para não furar o filtro (exemplos)
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    dst-address-list=doh-servers action=drop comment="Bloqueia DNS-over-HTTPS"
```

**B) Address-list por categoria no firewall MikroTik**

```routeros
# Uma address-list por categoria, populada por script/importação periódica
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    dst-address-list=cat-adulto  action=drop comment="Bloqueio adulto"
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    dst-address-list=cat-apostas action=drop comment="Bloqueio apostas"
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    dst-address-list=cat-malware action=drop comment="Bloqueio malware"
# Torrent: bloquear por protocolo/porta e P2P
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    p2p=all-p2p action=drop comment="Bloqueio torrent/P2P"
```

> **Toggle por categoria:** habilitar/desabilitar a regra `filter` correspondente
> (`/ip firewall filter enable`/`disable`) ou a lista da categoria.

## 5.4 Agendamento de banda por horário e perfil

Objetivo: banda diferente por horário (ex.: reduzir no horário de pico) e por perfil.

**Recomendado — CoA (RFC 5176):** o app/servidor de agendamento dispara uma mudança de
`Mikrotik-Rate-Limit` para sessões ativas, sem derrubar ninguém:

```bash
# Aplica novo rate-limit a uma sessão ativa
printf 'User-Name=CPF,Mikrotik-Rate-Limit=2M/4M\n' \
  | radclient -x MIKROTIK_IP:3799 coa RADIUS_SECRET
```

**Alternativa — perfis + scheduler no MikroTik** (mais simples, sem app):

```routeros
# Reduz a banda do perfil padrão às 12:00
/system scheduler add name=banda-pico-on start-time=12:00:00 interval=1d \
    on-event="/ip hotspot user profile set perfil-padrao rate-limit=2M/4M"
# Restaura às 14:00
/system scheduler add name=banda-pico-off start-time=14:00:00 interval=1d \
    on-event="/ip hotspot user profile set perfil-padrao rate-limit=5M/10M"
```

Para novas sessões, o `Mikrotik-Rate-Limit` também pode vir do `radreply`/`radgroupreply`
conforme o perfil do usuário.

## 5.5 Blacklist de MAC/CPF

**No RADIUS (rejeita autenticação):**

```sql
-- Bloqueia o CPF (ou o MAC, se username=MAC)
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('CPF_OU_MAC', 'Auth-Type', ':=', 'Reject');
```

**Derrubar sessão ativa imediatamente (botão "Bloquear" do admin):**

```bash
echo "User-Name=CPF" | radclient -x MIKROTIK_IP:3799 disconnect RADIUS_SECRET
```

**Reforço no firewall MikroTik (por MAC):**

```routeros
/ip firewall filter add chain=forward src-mac-address=AA:BB:CC:DD:EE:FF action=drop \
    comment="Blacklist admin"
```

> Fluxo do botão "Bloquear" na tabela de usuários: `INSERT` da regra `Reject` + `Disconnect`
> da sessão + (opcional) drop por MAC. "Remover da lista" desfaz os três.

## 5.6 Alertas automáticos

Derivados do accounting (`radacct`) e dos logs de rejeição (`radpostauth` / firewall).
Um job (cron) consulta periodicamente e dispara webhook/e-mail para o painel.

```sql
-- Consumo elevado: sessões que passaram de X GB nas últimas 24h
SELECT username, callingstationid,
       ROUND((acctinputoctets + acctoutputoctets)/1073741824, 2) AS gb
FROM radacct
WHERE acctstarttime > (NOW() - INTERVAL 1 DAY)
HAVING gb > 10
ORDER BY gb DESC;

-- Pico de conexões: sessões abertas agora
SELECT COUNT(*) AS sessoes_ativas
FROM radacct
WHERE acctstoptime IS NULL;

-- Tentativa de invasão: rajada de rejeições por MAC/CPF
SELECT username, COUNT(*) AS falhas
FROM radpostauth
WHERE reply = 'Access-Reject' AND authdate > (NOW() - INTERVAL 10 MINUTE)
GROUP BY username
HAVING falhas > 10;
```

## 5.7 Relatório mensal exportável

Queries de referência sobre `radacct` (o app exporta em CSV/PDF):

```sql
-- Sessões e tráfego total no mês
SELECT COUNT(*) AS sessoes,
       ROUND(SUM(acctinputoctets + acctoutputoctets)/1073741824, 2) AS trafego_gb,
       ROUND(AVG(acctsessiontime)/60, 1) AS duracao_media_min
FROM radacct
WHERE acctstarttime >= '2026-07-01' AND acctstarttime < '2026-08-01';

-- Setor mais ativo (por NAS-Port / SSID, se mapeado)
SELECT calledstationid AS ponto, COUNT(*) AS sessoes
FROM radacct
WHERE acctstarttime >= '2026-07-01' AND acctstarttime < '2026-08-01'
GROUP BY calledstationid
ORDER BY sessoes DESC;
```

> NPS e satisfação vêm do banco do app, não do `radacct`; o relatório final combina as
> duas fontes.

Prossiga para [06-seguranca-lgpd.md](06-seguranca-lgpd.md).

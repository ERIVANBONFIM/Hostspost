# Deploy na VPS — Hostspost (app + backend)

Coloca o **portal + painel admin + backend de integração** no ar numa VPS, com **HTTPS
automático** (Caddy). O MikroTik + FreeRADIUS são infra de rede à parte (ver
[`../docs`](../docs) e [`../lab`](../lab)).

> **O que este deploy cobre:** a aplicação web e a API. **O que ele NÃO cobre:** o gateway
> MikroTik, o servidor FreeRADIUS e o gateway de SMS/OAuth reais — esses são do seu
> ambiente e ficam configurados via `.env` e pela documentação de rede.

## Pré-requisitos

- Uma VPS (Ubuntu 22.04+ recomendado) com IP público.
- Um **domínio** (ex.: `portal.seuhospital.com.br`) com registro **A/AAAA** apontando
  para o IP da VPS. (O Caddy só emite o certificado HTTPS se o DNS já resolver.)
- Portas **80** e **443** liberadas no firewall.

## Passo a passo

```bash
# 1) Instalar Docker (uma vez)
curl -fsSL https://get.docker.com | sh

# 2) Clonar o repositório
git clone <URL_DO_REPO> hostspost && cd hostspost

# 3) Configurar o ambiente
cp deploy/.env.example deploy/.env
nano deploy/.env         # defina DOMAIN e ADMIN_TOKEN (gere com: openssl rand -hex 24)
                         # (opcional) DB_* apontando para o MySQL do FreeRADIUS

# 4) Subir
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build

# 5) Ver logs / estado
docker compose -f deploy/docker-compose.prod.yml logs -f
```

Pronto: acesse `https://SEU_DOMINIO` (launcher), `https://SEU_DOMINIO/portal.html` e
`https://SEU_DOMINIO/admin.html`. O app chama a API na **mesma origem** (`/api/...`), que
o Caddy encaminha para o backend — sem CORS, sem porta exposta.

## Onde fica cada configuração

| Configuração | Onde |
|---|---|
| Domínio, token de admin, credenciais do banco | `deploy/.env` (servidor) — **nunca na UI** |
| Toggles do portal (SMS, banner, limite…) | Painel Admin → **Configurações do Portal** |
| Rede (VLAN, hotspot, walled garden, RADIUS) | MikroTik/FreeRADIUS — ver [`../docs`](../docs) |

## Persistência (importante para LGPD/Marco Civil)

- **Sem `DB_*`**: o backend roda **em memória** — bom para um primeiro teste, mas **os
  dados somem ao reiniciar**. Não use assim em produção.
- **Com `DB_*`**: o backend grava no **MySQL do FreeRADIUS** (`radcheck`/`radacct`) via
  `backend/adapters/mysql.js`. Para isso, **descomente** a instalação do `mysql2` em
  [`Dockerfile.backend`](Dockerfile.backend) e rebuild (`up -d --build`).

## Atualizar

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

## Segurança mínima antes de abrir ao público

- `ADMIN_TOKEN` forte e único (as rotas de blacklist exigem esse token).
- Firewall: exponha só 80/443; o backend (3000) fica interno na rede do compose.
- Backups do banco e retenção/anonimização de logs (ver [`../docs/06-seguranca-lgpd.md`](../docs/06-seguranca-lgpd.md)).

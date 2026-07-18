# Backend de Integração — Hostspost

Serviço de referência que implementa o contrato **portal ↔ FreeRADIUS** descrito em
[`../docs/04-integracao-portal.md`](../docs/04-integracao-portal.md): valida SMS, trata
login (CPF e Google), aplica **lista negra** e **limite de dispositivos**, grava a
credencial no **radcheck** e abre a sessão no **radacct**.

- **Sem dependências** para rodar a versão de demonstração (só Node built-in).
- **Store plugável:** em memória (padrão, para demo/testes) ou **MySQL/MariaDB** do
  FreeRADIUS (produção, via `adapters/mysql.js` + `mysql2`).

## Rodar

```bash
cd backend
node server.js                                   # http://localhost:3000 (store em memória)
PORT=8081 DEVICE_LIMIT=2 ADMIN_TOKEN=segredo node server.js
```

Sem `ADMIN_TOKEN`, o servidor sobe em **modo dev** (rotas de admin abertas) e avisa no
console. Em produção, **sempre** defina `ADMIN_TOKEN`.

## Testar

```bash
node test.js     # 33 testes: lógica + HTTP real + auth admin + rate-limit + métricas
```

## Endpoints

| Método | Rota | Auth | Corpo | Resposta |
|--------|------|------|-------|----------|
| GET | `/api/health` | — | — | `{ ok }` |
| GET | `/api/status` | — | — | `{ deviceLimit, activeSessions, blacklist }` |
| GET | `/api/metrics` | — | — | `{ requests, byStatus, byRoute, uptimeMs }` |
| POST | `/api/sms/send` | — | `{ cpf }` | `{ ok, mockCode }` ou `429 { reason:'rate_limited', retryAfterMs }` |
| POST | `/api/sms/verify` | — | `{ cpf, code }` | `200 { ok }` ou `401` |
| POST | `/api/login` | — | `{ cpf, mac, enforceLimit? }` | `200 { credential }` ou `403 { reason }` |
| POST | `/api/login/google` | — | `{ cpf, mac }` | idem login |
| POST | `/api/logout` | — | `{ cpf, mac? }` | `{ ok, stopped }` |
| POST | `/api/blacklist` | **Bearer** | `{ valor, motivo }` | `{ ok }` ou `401` |
| DELETE | `/api/blacklist` | **Bearer** | `{ valor }` | `{ ok }` ou `401` |

`reason` no login: `blacklist`, `device_limit`, `cpf_invalido`. No SMS: `rate_limited`,
`cpf_invalido`.

### Autenticação de admin
Rotas de admin exigem `Authorization: Bearer <ADMIN_TOKEN>` (quando o token está definido).
No app, use `HostspostAPI.setToken('<token>')` ou defina
`localStorage.hostspost.adminToken` — o cliente envia o header automaticamente.

### Rate-limit de SMS
Por CPF: intervalo mínimo entre envios (30s) e máximo por janela (3 / 10 min).
Configurável em `createService(store, { smsMax, smsWindowMs, smsCooldownMs })`.

### Exemplo (curl)

```bash
curl -s localhost:3000/api/sms/send -d '{"cpf":"123.456.789-00"}'
# {"ok":true,"expiresInMs":300000,"mockCode":"4821"}
curl -s localhost:3000/api/sms/verify -d '{"cpf":"123.456.789-00","code":"4821"}'
curl -s localhost:3000/api/login -d '{"cpf":"123.456.789-00","mac":"AA:BB:CC:00:00:01"}'
# {"ok":true,"credential":{"username":"123.456.789-00","password":"<token>"}}
```

## Produção com FreeRADIUS (MySQL)

O `adapters/mysql.js` implementa a **mesma interface** gravando no schema do FreeRADIUS
(ver [`../docs/03-freeradius.md`](../docs/03-freeradius.md)):

| Operação | SQL |
|----------|-----|
| credencial | `radcheck` (`Cleartext-Password`, `Simultaneous-Use`) |
| sessão | `radacct` (start/stop; `acctstoptime IS NULL` = ativa) |
| lista negra | `radcheck` (`Auth-Type := Reject`) |

```bash
npm i mysql2
```
```js
const { createMysqlStore } = require('./adapters/mysql.js');
const store = await createMysqlStore({ host: 'DB_HOST', user: 'radius', password: 'radpass', database: 'radius' });
const service = require('./lib/service.js').createService(store, { deviceLimit: 2 });
// use `service` no lugar do store em memória em server.js
```

> Depois do login, o portal injeta `credential.password` no `/login` do hotspot
> MikroTik (CHAP) — fecha o ciclo descrito em docs/04.

## Interface do store (para novos adapters)

`upsertCredential(user, pass, simUse)` · `getCredential(user)` · `startSession(user, mac)`
· `stopSession(user, mac)` · `countActiveSessions(user)` · `totalActive()` ·
`isBlacklisted(v)` · `addBlacklist(v, motivo)` · `removeBlacklist(v)` · `blacklistCount()`
· `putCode/getCode/delCode(cpf)` · `log(tipo, msg)`. Métodos podem ser síncronos ou
retornar Promise — o serviço usa `await` em todos.

## Escopo

Referência funcional e testável. **Já endurecido:** autenticação de admin (Bearer),
rate-limit de SMS por CPF, métricas (`/api/metrics`), logging de requisições e tratamento
de erro (400/401/403/429/500). **Falta, para produção:** TLS/HTTPS (terminar num proxy
reverso), integração real do gateway SMS e do OAuth Google, persistência do rate-limit
compartilhada entre instâncias (ex.: Redis) e uso do adaptador MySQL no lugar do store em
memória.

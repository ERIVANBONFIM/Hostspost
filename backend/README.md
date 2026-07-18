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
node server.js                 # http://localhost:3000 (store em memória)
PORT=8081 DEVICE_LIMIT=2 node server.js
```

## Testar

```bash
node test.js     # 24 testes: lógica + servidor HTTP real em localhost
```

## Endpoints

| Método | Rota | Corpo | Resposta |
|--------|------|-------|----------|
| GET | `/api/health` | — | `{ ok }` |
| GET | `/api/status` | — | `{ deviceLimit, activeSessions, blacklist }` |
| POST | `/api/sms/send` | `{ cpf }` | `{ ok, mockCode }` (mock devolve o código) |
| POST | `/api/sms/verify` | `{ cpf, code }` | `200 { ok }` ou `401` |
| POST | `/api/login` | `{ cpf, mac, enforceLimit? }` | `200 { credential }` ou `403 { reason }` |
| POST | `/api/login/google` | `{ cpf, mac }` | idem login |
| POST | `/api/logout` | `{ cpf, mac? }` | `{ ok, stopped }` |
| POST | `/api/blacklist` | `{ valor, motivo }` | `{ ok }` |
| DELETE | `/api/blacklist` | `{ valor }` | `{ ok }` |

`reason` possíveis no login: `blacklist`, `device_limit`, `cpf_invalido`.

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

- Referência funcional e testável; **não** é um produto endurecido. Falta, para produção:
  rate-limiting/anti-abuso no envio de SMS, autenticação de administrador nas rotas de
  blacklist, TLS/HTTPS, integração real do gateway SMS e do OAuth Google, e observabilidade.

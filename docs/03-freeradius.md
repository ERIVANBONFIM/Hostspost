# 03 — FreeRADIUS

Instalação e configuração do FreeRADIUS 3.x com backend SQL (MySQL/MariaDB) para atender
o hotspot MikroTik.

> Substitua: `RADIUS_SECRET`, `MIKROTIK_IP`, `SQL_HOST`, `SQL_USER`, `SQL_PASS`,
> `SQL_DB`. Sistema de referência: Debian 12 / Ubuntu 22.04.

## 3.1 Instalação

```bash
sudo apt update
sudo apt install -y freeradius freeradius-mysql freeradius-utils mariadb-server

# (opcional) validar em modo debug antes de habilitar como serviço
sudo systemctl stop freeradius
sudo freeradius -X   # saída detalhada; Ctrl+C para sair
```

## 3.2 Banco de dados e schema

O pacote já inclui o schema SQL. Crie o banco e importe as tabelas
(`radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, `radacct`,
`radpostauth`, `nas`).

```bash
sudo mysql -e "CREATE DATABASE SQL_DB CHARACTER SET utf8mb4;"
sudo mysql -e "CREATE USER 'SQL_USER'@'localhost' IDENTIFIED BY 'SQL_PASS';"
sudo mysql -e "GRANT ALL ON SQL_DB.* TO 'SQL_USER'@'localhost';"

# Importa o schema padrão do FreeRADIUS
sudo mysql SQL_DB < /etc/freeradius/3.0/mods-config/sql/main/mysql/schema.sql
```

Tabelas principais:

| Tabela | Uso |
|--------|-----|
| `radcheck` | Atributos de verificação por usuário (senha, `Simultaneous-Use`, `Auth-Type := Reject`) |
| `radreply` | Atributos de retorno por usuário (`Mikrotik-Rate-Limit`, `Session-Timeout`) |
| `radgroupcheck` / `radgroupreply` | Idem, por **grupo** (perfis) |
| `radusergroup` | Associa usuário → grupo (perfil) |
| `radacct` | **Accounting** (sessões, bytes, tempo) — base de relatórios e alertas |
| `radpostauth` | Log de tentativas de autenticação (aceitas/rejeitadas) |

## 3.3 Habilitar o módulo SQL

```bash
# Ativa o módulo sql
sudo ln -s /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
```

Edite `/etc/freeradius/3.0/mods-available/sql`:

```ini
sql {
    dialect = "mysql"
    driver = "rlm_sql_${dialect}"

    server = "SQL_HOST"
    port = 3306
    login = "SQL_USER"
    password = "SQL_PASS"
    radius_db = "SQL_DB"

    # lê grupos/perfis do SQL
    read_groups = yes
    # registra accounting no SQL
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
}
```

Nos sites `sites-enabled/default` e `sites-enabled/inner-tunnel`, garanta que `sql` esteja
presente nas seções `authorize`, `accounting`, `session` e `post-auth`
(descomente as linhas `sql`).

## 3.4 Cadastro do NAS (MikroTik) — `clients.conf`

Edite `/etc/freeradius/3.0/clients.conf`:

```ini
client mikrotik-hotspot {
    ipaddr     = MIKROTIK_IP
    secret     = RADIUS_SECRET
    nas_type   = mikrotik
    shortname  = mikrotik-visitantes
}
```

> O `secret` **deve ser idêntico** ao `/radius add ... secret=RADIUS_SECRET` no MikroTik
> (ver [02-mikrotik-hotspot.md](02-mikrotik-hotspot.md)).

## 3.5 Dicionário MikroTik

O dicionário MikroTik já acompanha o FreeRADIUS
(`/usr/share/freeradius/dictionary.mikrotik`), habilitando atributos como:

- `Mikrotik-Rate-Limit` — limite de banda por usuário/sessão.
- `Mikrotik-Total-Limit` / `Mikrotik-Recv-Limit` / `Mikrotik-Xmit-Limit` — cotas.
- `Mikrotik-Wireless-*` — parâmetros wireless.

## 3.6 Suporte a CoA / Disconnect (RFC 5176)

Para **mudar banda em tempo real** ou **derrubar uma sessão** (blacklist), habilite o
envio de CoA/Disconnect para o MikroTik (porta 3799). Ferramenta:

```bash
# Exemplo: derrubar uma sessão pelo Acct-Session-Id
echo "Acct-Session-Id=SESSION_ID" | radclient -x MIKROTIK_IP:3799 disconnect RADIUS_SECRET
```

## 3.7 Usuário de exemplo e teste

Insira um usuário de teste em `radcheck` e valide com `radtest`:

```sql
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('12345678900', 'Cleartext-Password', ':=', 'senha-teste');

-- Limite de 2 dispositivos por CPF (ver doc 05)
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('12345678900', 'Simultaneous-Use', ':=', '2');

-- Banda de retorno (opcional; pode vir do perfil/grupo)
INSERT INTO radreply (username, attribute, op, value)
VALUES ('12345678900', 'Mikrotik-Rate-Limit', ':=', '5M/10M');
```

```bash
# Testa a autenticação diretamente contra o FreeRADIUS local
radtest 12345678900 senha-teste 127.0.0.1 0 testing123
# (o secret 127.0.0.1 padrao "testing123" fica em clients.conf, client localhost)
```

Resultado esperado: `Access-Accept` com os atributos de retorno. Se rejeitar, rode
`sudo freeradius -X` em outro terminal e observe a autorização/SQL.

## 3.8 Serviço em produção

```bash
sudo systemctl enable --now freeradius
sudo systemctl status freeradius
```

Prossiga para [04-integracao-portal.md](04-integracao-portal.md).

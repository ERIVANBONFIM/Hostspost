-- Cenários de teste — LAB Hostspost
-- Derivado do SQL de docs/03-freeradius.md e docs/05-recursos-v2-para-infra.md.
-- CPFs e senhas são FICTÍCIOS, apenas para homologação.

-- ---------------------------------------------------------------------------
-- Grupo "visitantes": limite de 2 dispositivos por CPF + banda de retorno
-- ---------------------------------------------------------------------------
INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES
  ('visitantes', 'Simultaneous-Use', ':=', '2');

INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
  ('visitantes', 'Mikrotik-Rate-Limit', ':=', '5M/10M'),
  ('visitantes', 'Session-Timeout',     ':=', '86400'),
  ('visitantes', 'Acct-Interim-Interval', ':=', '300');

-- ---------------------------------------------------------------------------
-- T1 — Usuário válido (CPF). Senha fictícia. Membro do grupo "visitantes".
-- ---------------------------------------------------------------------------
INSERT INTO radcheck (username, attribute, op, value) VALUES
  ('12345678900', 'Cleartext-Password', ':=', 'senha-teste');

INSERT INTO radusergroup (username, groupname, priority) VALUES
  ('12345678900', 'visitantes', 1);

-- ---------------------------------------------------------------------------
-- T8 — Usuário na BLACKLIST: sempre rejeitado (Auth-Type := Reject)
-- ---------------------------------------------------------------------------
INSERT INTO radcheck (username, attribute, op, value) VALUES
  ('99999999999', 'Auth-Type', ':=', 'Reject');

-- ---------------------------------------------------------------------------
-- Usuário por MAC (reconexão / auto-login) — validado ponta a ponta só no Nível 2
-- ---------------------------------------------------------------------------
INSERT INTO radcheck (username, attribute, op, value) VALUES
  ('AA-BB-CC-DD-EE-FF', 'Cleartext-Password', ':=', 'AA-BB-CC-DD-EE-FF');
INSERT INTO radusergroup (username, groupname, priority) VALUES
  ('AA-BB-CC-DD-EE-FF', 'visitantes', 1);

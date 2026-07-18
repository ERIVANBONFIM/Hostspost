/* ==========================================================================
 * Adaptador MySQL/MariaDB — MESMA interface do store-memory, gravando no
 * schema do FreeRADIUS (radcheck / radacct / lista negra via radcheck).
 *
 * Requer a dependência 'mysql2':  npm i mysql2
 * (mantido fora do caminho padrão para o backend rodar sem dependências.)
 *
 * Uso:
 *   const { createMysqlStore } = require('./adapters/mysql.js');
 *   const store = await createMysqlStore({ host, user, password, database });
 *   const service = require('./lib/service.js').createService(store);
 *
 * Mapeamento (ver docs/03-freeradius.md):
 *   credencial       -> radcheck(Cleartext-Password, Simultaneous-Use)
 *   sessão           -> radacct (start/stop, acctstoptime IS NULL = ativa)
 *   lista negra      -> radcheck(Auth-Type := Reject)
 * ========================================================================== */
'use strict';

async function createMysqlStore(cfg) {
  var mysql = require('mysql2/promise');           // lança se não instalado
  var pool = mysql.createPool(Object.assign({ waitForConnections: true, connectionLimit: 8 }, cfg));

  async function q(sql, params) { var r = await pool.query(sql, params || []); return r[0]; }

  return {
    // ---- credenciais (radcheck) ----
    upsertCredential: async function (username, password, simUse) {
      await q("DELETE FROM radcheck WHERE username=? AND attribute IN ('Cleartext-Password','Simultaneous-Use')", [username]);
      await q("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)", [username, password]);
      await q("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', ?)", [username, String(simUse || 2)]);
    },
    getCredential: async function (username) {
      var rows = await q("SELECT value FROM radcheck WHERE username=? AND attribute='Cleartext-Password' LIMIT 1", [username]);
      return rows.length ? { password: rows[0].value, simUse: 2 } : null;
    },

    // ---- sessões (radacct) ----
    startSession: async function (username, mac) {
      var sid = 'sess-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      await q("INSERT INTO radacct (acctsessionid, acctuniqueid, username, callingstationid, acctstarttime, nasipaddress) " +
              "VALUES (?, ?, ?, ?, NOW(), '0.0.0.0')", [sid, sid, username, mac || '']);
    },
    stopSession: async function (username, mac) {
      var r = await q("UPDATE radacct SET acctstoptime=NOW() WHERE username=? AND acctstoptime IS NULL" +
                      (mac ? " AND callingstationid=?" : ""), mac ? [username, mac] : [username]);
      return r.affectedRows || 0;
    },
    countActiveSessions: async function (username) {
      var rows = await q("SELECT COUNT(*) c FROM radacct WHERE username=? AND acctstoptime IS NULL", [username]);
      return rows[0].c;
    },
    totalActive: async function () {
      var rows = await q("SELECT COUNT(*) c FROM radacct WHERE acctstoptime IS NULL");
      return rows[0].c;
    },

    // ---- lista negra (radcheck Auth-Type := Reject) ----
    isBlacklisted: async function (valor) {
      var rows = await q("SELECT 1 FROM radcheck WHERE username=? AND attribute='Auth-Type' AND value='Reject' LIMIT 1", [valor]);
      return rows.length > 0;
    },
    addBlacklist: async function (valor, motivo) {
      if (await this.isBlacklisted(valor)) return false;
      await q("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Auth-Type', ':=', 'Reject')", [valor]);
      await q("UPDATE radacct SET acctstoptime=NOW() WHERE username=? AND acctstoptime IS NULL", [valor]);
      return true;
    },
    removeBlacklist: async function (valor) {
      await q("DELETE FROM radcheck WHERE username=? AND attribute='Auth-Type' AND value='Reject'", [valor]);
    },
    blacklistCount: async function () {
      var rows = await q("SELECT COUNT(*) c FROM radcheck WHERE attribute='Auth-Type' AND value='Reject'");
      return rows[0].c;
    },

    // ---- perfil do cadastro (tabela visitantes) ----
    saveProfile: async function (cpf, profile) {
      await q("CREATE TABLE IF NOT EXISTS visitantes (cpf VARCHAR(20) PRIMARY KEY, dados JSON, atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
      await q("REPLACE INTO visitantes (cpf, dados) VALUES (?, ?)", [cpf, JSON.stringify(profile || {})]);
    },
    getProfile: async function (cpf) {
      var rows = await q("SELECT dados FROM visitantes WHERE cpf=?", [cpf]);
      return rows.length ? (typeof rows[0].dados === 'string' ? JSON.parse(rows[0].dados) : rows[0].dados) : null;
    },

    // ---- códigos SMS (tabela auxiliar simples) ----
    putCode: async function (cpf, rec) {
      await q("CREATE TABLE IF NOT EXISTS sms_codes (cpf VARCHAR(20) PRIMARY KEY, code VARCHAR(8), exp BIGINT)");
      await q("REPLACE INTO sms_codes (cpf, code, exp) VALUES (?, ?, ?)", [cpf, rec.code, rec.exp]);
    },
    getCode: async function (cpf) {
      var rows = await q("SELECT code, exp FROM sms_codes WHERE cpf=?", [cpf]);
      return rows.length ? { code: rows[0].code, exp: Number(rows[0].exp) } : null;
    },
    delCode: async function (cpf) { await q("DELETE FROM sms_codes WHERE cpf=?", [cpf]); },

    // ---- log ----
    log: function (tipo, msg) { console.log('[' + tipo + '] ' + msg); },

    close: function () { return pool.end(); }
  };
}

module.exports = { createMysqlStore: createMysqlStore };

/* ==========================================================================
 * Store em memória — implementa a interface consumida por service.js.
 * Espelha o modelo do FreeRADIUS: radcheck (credenciais + Simultaneous-Use),
 * radacct (sessões) e uma lista negra. Ideal para demo e testes.
 * Para produção, use adapters/mysql.js com a mesma interface.
 * ========================================================================== */
'use strict';

function createMemoryStore(seed) {
  var credentials = new Map(); // username -> { password, simUse }
  var blacklist = new Map();   // valor -> { motivo, ts }
  var sessions = [];           // { username, mac, start, stop }
  var codes = new Map();       // cpf -> { code, exp }
  var events = [];             // { tipo, msg, ts }

  if (seed && Array.isArray(seed.blacklist)) {
    seed.blacklist.forEach(function (b) { blacklist.set(b.valor, { motivo: b.motivo || '—', ts: Date.now() }); });
  }

  return {
    // ---- credenciais (radcheck) ----
    upsertCredential: function (username, password, simUse) {
      credentials.set(username, { password: password, simUse: simUse || 2 });
    },
    getCredential: function (username) { return credentials.get(username) || null; },

    // ---- sessões (radacct) ----
    startSession: function (username, mac) {
      sessions.push({ username: username, mac: mac, start: Date.now(), stop: null });
    },
    stopSession: function (username, mac) {
      var n = 0;
      sessions.forEach(function (s) {
        if (s.username === username && !s.stop && (mac == null || s.mac === mac)) { s.stop = Date.now(); n++; }
      });
      return n;
    },
    countActiveSessions: function (username) {
      return sessions.filter(function (s) { return s.username === username && !s.stop; }).length;
    },
    totalActive: function () { return sessions.filter(function (s) { return !s.stop; }).length; },

    // ---- lista negra ----
    isBlacklisted: function (valor) { return blacklist.has(valor); },
    addBlacklist: function (valor, motivo) {
      if (blacklist.has(valor)) return false;
      blacklist.set(valor, { motivo: motivo || '—', ts: Date.now() });
      // derruba sessões ativas do alvo
      sessions.forEach(function (s) { if (s.username === valor && !s.stop) s.stop = Date.now(); });
      return true;
    },
    removeBlacklist: function (valor) { blacklist.delete(valor); },
    blacklistCount: function () { return blacklist.size; },

    // ---- códigos SMS ----
    putCode: function (cpf, rec) { codes.set(cpf, rec); },
    getCode: function (cpf) { return codes.get(cpf) || null; },
    delCode: function (cpf) { codes.delete(cpf); },

    // ---- log ----
    log: function (tipo, msg) { events.unshift({ tipo: tipo, msg: msg, ts: Date.now() }); if (events.length > 1000) events.length = 1000; },
    events: function () { return events; }
  };
}

module.exports = { createMemoryStore: createMemoryStore };

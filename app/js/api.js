/* ==========================================================================
 * Hostspost — cliente da API do backend de integração.
 * Funciona no navegador (window.fetch) e no Node 18+ (global fetch), para
 * permitir testes de integração. Se o backend estiver offline, os métodos
 * devolvem { status:0, ok:false, reason:'offline' } e o app cai no modo demo.
 * ========================================================================== */
(function (root) {
  'use strict';
  var ls = root.localStorage;
  var BASE = (ls && ls.getItem('hostspost.apiBase')) || 'http://localhost:3000';

  async function call(method, path, body) {
    try {
      var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      var res = await fetch(BASE + path, opts);
      var data = {};
      try { data = await res.json(); } catch (e) {}
      return Object.assign({ status: res.status }, data);
    } catch (e) {
      return { status: 0, ok: false, reason: 'offline', error: String(e && e.message || e) };
    }
  }

  var API = {
    getBase: function () { return BASE; },
    setBase: function (b) { BASE = b; if (ls) ls.setItem('hostspost.apiBase', b); },
    health: function () { return call('GET', '/api/health'); },
    status: function () { return call('GET', '/api/status'); },
    smsSend: function (cpf) { return call('POST', '/api/sms/send', { cpf: cpf }); },
    smsVerify: function (cpf, code) { return call('POST', '/api/sms/verify', { cpf: cpf, code: code }); },
    login: function (cpf, mac) { return call('POST', '/api/login', { cpf: cpf, mac: mac }); },
    loginGoogle: function (cpf, mac) { return call('POST', '/api/login/google', { cpf: cpf, mac: mac }); },
    logout: function (cpf, mac) { return call('POST', '/api/logout', { cpf: cpf, mac: mac }); },
    blacklistAdd: function (valor, motivo) { return call('POST', '/api/blacklist', { valor: valor, motivo: motivo }); },
    blacklistRemove: function (valor) { return call('DELETE', '/api/blacklist', { valor: valor }); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.HostspostAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);

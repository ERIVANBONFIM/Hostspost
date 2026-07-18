/* ==========================================================================
 * Hostspost — cliente da API do backend de integração.
 * Funciona no navegador (window.fetch) e no Node 18+ (global fetch), para
 * permitir testes de integração. Se o backend estiver offline, os métodos
 * devolvem { status:0, ok:false, reason:'offline' } e o app cai no modo demo.
 * ========================================================================== */
(function (root) {
  'use strict';
  var ls = root.localStorage;
  // Base da API:
  //  - se definido em localStorage.hostspost.apiBase, usa isso (dev);
  //  - no navegador (produção atrás de proxy): mesma origem ('' -> /api/...);
  //  - fora do navegador (Node/testes): localhost:3000 (ajustado via setBase).
  var BASE = (ls && ls.getItem('hostspost.apiBase'));
  if (BASE == null) {
    BASE = (root.location && /^https?:$/.test(root.location.protocol)) ? '' : 'http://localhost:3000';
  }
  var TOKEN = (ls && ls.getItem('hostspost.adminToken')) || null; // usado nas rotas de admin

  async function call(method, path, body) {
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
      var opts = { method: method, headers: headers };
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
    setToken: function (t) { TOKEN = t; if (ls) { t ? ls.setItem('hostspost.adminToken', t) : ls.removeItem('hostspost.adminToken'); } },
    health: function () { return call('GET', '/api/health'); },
    status: function () { return call('GET', '/api/status'); },
    smsSend: function (cpf) { return call('POST', '/api/sms/send', { cpf: cpf }); },
    smsVerify: function (cpf, code) { return call('POST', '/api/sms/verify', { cpf: cpf, code: code }); },
    login: function (cpf, mac) { return call('POST', '/api/login', { cpf: cpf, mac: mac }); },
    register: function (cpf, mac, profile) { return call('POST', '/api/register', { cpf: cpf, mac: mac, profile: profile }); },
    loginGoogle: function (cpf, mac) { return call('POST', '/api/login/google', { cpf: cpf, mac: mac }); },
    logout: function (cpf, mac) { return call('POST', '/api/logout', { cpf: cpf, mac: mac }); },
    blacklistAdd: function (valor, motivo) { return call('POST', '/api/blacklist', { valor: valor, motivo: motivo }); },
    blacklistRemove: function (valor) { return call('DELETE', '/api/blacklist', { valor: valor }); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.HostspostAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);

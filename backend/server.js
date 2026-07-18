/* ==========================================================================
 * Hostspost — backend de integração (servidor HTTP)
 * Apenas Node built-in (http). Expõe o contrato do portal como API REST,
 * com autenticação de admin, rate-limit de SMS e métricas.
 *
 * Uso:  node server.js
 *       PORT=8081 ADMIN_TOKEN=segredo DEVICE_LIMIT=2 node server.js
 *
 * Rotas públicas (portal): /api/health /api/status /api/sms/* /api/login* /api/logout
 * Rotas de admin (exigem Bearer token se ADMIN_TOKEN definido): /api/blacklist
 * Observabilidade: /api/metrics
 * ========================================================================== */
'use strict';
var http = require('http');
var crypto = require('crypto');
var svc = require('./lib/service.js');
var mem = require('./lib/store-memory.js');

function createServer(service, opts) {
  opts = opts || {};
  var adminToken = opts.adminToken || null;
  var metrics = { requests: 0, byStatus: {}, byRoute: {}, startedAt: Date.now() };

  function authorized(req) {
    if (!adminToken) return true; // modo dev aberto (com aviso no boot)
    var h = req.headers['authorization'] || '';
    var m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return false;
    var a = Buffer.from(m[1]);
    var b = Buffer.from(adminToken);
    if (a.length !== b.length) return false; // evita throw do timingSafeEqual
    return crypto.timingSafeEqual(a, b);
  }

  return http.createServer(function (req, res) {
    var t0 = Date.now();
    metrics.requests++;
    var url = req.url.split('?')[0];
    metrics.byRoute[url] = (metrics.byRoute[url] || 0) + 1;

    var cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    function send(code, obj) {
      metrics.byStatus[code] = (metrics.byStatus[code] || 0) + 1;
      res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify(obj));
      console.log(new Date(t0).toISOString(), req.method, url, code, (Date.now() - t0) + 'ms');
    }
    function body(cb) {
      var data = '';
      req.on('data', function (c) { data += c; if (data.length > 1e6) req.destroy(); });
      req.on('end', function () { try { cb(data ? JSON.parse(data) : {}); } catch (e) { send(400, { ok: false, reason: 'json_invalido' }); } });
    }
    function h(fn) { return function (b) { Promise.resolve(fn(b)).catch(function (e) { send(500, { ok: false, reason: 'erro_interno', detail: String(e && e.message || e) }); }); }; }
    // mapeia motivos de negócio para HTTP
    function statusFor(r) {
      if (r.ok) return 200;
      if (r.reason === 'rate_limited') return 429;
      if (r.reason === 'blacklist' || r.reason === 'device_limit') return 403;
      if (r.reason === 'cpf_invalido' || r.reason === 'cpf_obrigatorio' || r.reason === 'json_invalido') return 400;
      return 401;
    }
    function requireAdmin() {
      if (authorized(req)) return true;
      send(401, { ok: false, reason: 'unauthorized' });
      return false;
    }

    // ---- rotas públicas ----
    if (req.method === 'GET' && url === '/api/health') return send(200, { ok: true, service: 'hostspost-backend' });
    if (req.method === 'GET' && url === '/api/status') return h(async function () { send(200, await service.status()); })();
    if (req.method === 'GET' && url === '/api/metrics') return send(200, Object.assign({ ok: true, uptimeMs: Date.now() - metrics.startedAt }, metrics));

    if (req.method === 'POST' && url === '/api/sms/send') return body(h(async function (b) { var r = await service.sendSms(b.cpf); send(statusFor(r), r); }));
    if (req.method === 'POST' && url === '/api/sms/verify') return body(h(async function (b) { var r = await service.verifySms(b.cpf, b.code); send(statusFor(r), r); }));
    if (req.method === 'POST' && url === '/api/login') return body(h(async function (b) { var r = await service.login(b); send(statusFor(r), r); }));
    if (req.method === 'POST' && url === '/api/login/google') return body(h(async function (b) { var r = await service.loginGoogle(b); send(statusFor(r), r); }));
    if (req.method === 'POST' && url === '/api/logout') return body(h(async function (b) { send(200, await service.logout(b.cpf, b.mac)); }));

    // ---- rotas de admin (protegidas) ----
    if (req.method === 'POST' && url === '/api/blacklist') { if (!requireAdmin()) return; return body(h(async function (b) { send(200, await service.blacklistAdd(b.valor, b.motivo)); })); }
    if (req.method === 'DELETE' && url === '/api/blacklist') { if (!requireAdmin()) return; return body(h(async function (b) { send(200, await service.blacklistRemove(b.valor)); })); }

    send(404, { ok: false, reason: 'not_found' });
  });
}

// factory com store em memória e config por ambiente/opts
function buildServer(opts) {
  opts = opts || {};
  var store = mem.createMemoryStore({ blacklist: [{ valor: '999.999.999-99', motivo: 'seed' }] });
  var service = svc.createService(store, { deviceLimit: Number(opts.deviceLimit || 2) });
  return createServer(service, { adminToken: opts.adminToken || null });
}

function defaultServer() {
  return buildServer({ adminToken: process.env.ADMIN_TOKEN || null, deviceLimit: process.env.DEVICE_LIMIT });
}

module.exports = { createServer: createServer, buildServer: buildServer, defaultServer: defaultServer };

if (require.main === module) {
  var port = Number(process.env.PORT || 3000);
  if (!process.env.ADMIN_TOKEN) console.warn('[hostspost-backend] AVISO: ADMIN_TOKEN não definido — rotas de admin ABERTAS (use apenas em dev).');
  defaultServer().listen(port, function () { console.log('[hostspost-backend] ouvindo em http://localhost:' + port); });
}

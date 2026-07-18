/* ==========================================================================
 * Hostspost — backend de integração (servidor HTTP)
 * Apenas Node built-in (http). Expõe o contrato do portal como API REST.
 *
 * Uso:  node server.js            (porta 3000, store em memória)
 *       PORT=8081 node server.js
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/status
 *   POST /api/sms/send      { cpf }
 *   POST /api/sms/verify    { cpf, code }
 *   POST /api/login         { cpf, mac, enforceLimit? }
 *   POST /api/login/google  { cpf, mac }
 *   POST /api/logout        { cpf, mac? }
 *   POST /api/blacklist     { valor, motivo }        (adiciona)
 *   DELETE /api/blacklist   { valor }                (remove)
 * ========================================================================== */
'use strict';
var http = require('http');
var svc = require('./lib/service.js');
var mem = require('./lib/store-memory.js');

function createServer(service) {
  return http.createServer(function (req, res) {
    var cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    var url = req.url.split('?')[0];

    function send(code, obj) {
      res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify(obj));
    }
    function body(cb) {
      var data = '';
      req.on('data', function (c) { data += c; if (data.length > 1e6) req.destroy(); });
      req.on('end', function () { try { cb(data ? JSON.parse(data) : {}); } catch (e) { send(400, { ok: false, reason: 'json_invalido' }); } });
    }

    // envolve um handler async, respondendo 500 em erro inesperado
    function h(fn) { return function (b) { Promise.resolve(fn(b)).catch(function (e) { send(500, { ok: false, reason: 'erro_interno', detail: String(e && e.message || e) }); }); }; }

    // rotas GET
    if (req.method === 'GET' && url === '/api/health') return send(200, { ok: true, service: 'hostspost-backend' });
    if (req.method === 'GET' && url === '/api/status') return h(async function () { send(200, await service.status()); })();

    // rotas POST/DELETE
    if (req.method === 'POST' && url === '/api/sms/send') return body(h(async function (b) { send(200, await service.sendSms(b.cpf)); }));
    if (req.method === 'POST' && url === '/api/sms/verify') return body(h(async function (b) { var r = await service.verifySms(b.cpf, b.code); send(r.ok ? 200 : 401, r); }));
    if (req.method === 'POST' && url === '/api/login') return body(h(async function (b) { var r = await service.login(b); send(r.ok ? 200 : 403, r); }));
    if (req.method === 'POST' && url === '/api/login/google') return body(h(async function (b) { var r = await service.loginGoogle(b); send(r.ok ? 200 : 403, r); }));
    if (req.method === 'POST' && url === '/api/logout') return body(h(async function (b) { send(200, await service.logout(b.cpf, b.mac)); }));
    if (req.method === 'POST' && url === '/api/blacklist') return body(h(async function (b) { send(200, await service.blacklistAdd(b.valor, b.motivo)); }));
    if (req.method === 'DELETE' && url === '/api/blacklist') return body(h(async function (b) { send(200, await service.blacklistRemove(b.valor)); }));

    send(404, { ok: false, reason: 'not_found' });
  });
}

// factory padrão (store em memória)
function defaultServer() {
  var store = mem.createMemoryStore({ blacklist: [{ valor: '999.999.999-99', motivo: 'seed' }] });
  var service = svc.createService(store, { deviceLimit: Number(process.env.DEVICE_LIMIT || 2) });
  return createServer(service);
}

module.exports = { createServer: createServer, defaultServer: defaultServer };

// executado diretamente?
if (require.main === module) {
  var port = Number(process.env.PORT || 3000);
  defaultServer().listen(port, function () {
    console.log('[hostspost-backend] ouvindo em http://localhost:' + port);
  });
}

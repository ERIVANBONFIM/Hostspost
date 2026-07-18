/* ==========================================================================
 * Testes do backend de integração — lógica + servidor HTTP real (localhost).
 * Roda com: node test.js   (sem dependências externas)
 * ========================================================================== */
'use strict';
var http = require('http');
var assert = require('assert');
var svc = require('./lib/service.js');
var mem = require('./lib/store-memory.js');
var server = require('./server.js');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } }

// ---------------------------------------------------------------- lógica ----
async function testLogic() {
  console.log('== Lógica (service + store em memória) ==');
  var store = mem.createMemoryStore();
  var s = svc.createService(store, { deviceLimit: 2 });
  var cpf = '123.456.789-00';

  // SMS
  var sent = await s.sendSms(cpf);
  ok(sent.ok && /^\d{4}$/.test(sent.mockCode), 'sendSms gera código de 4 dígitos');
  ok((await s.verifySms(cpf, '0000')).ok === false, 'verifySms rejeita código errado');
  var sent2 = await s.sendSms(cpf);
  ok((await s.verifySms(cpf, sent2.mockCode)).ok === true, 'verifySms aceita código correto');
  ok((await s.verifySms(cpf, sent2.mockCode)).ok === false, 'código é consumido (uso único)');

  // login + limite de dispositivos
  ok((await s.login({ cpf: cpf, mac: 'M1' })).ok === true, '1º dispositivo entra');
  ok((await s.login({ cpf: cpf, mac: 'M2' })).ok === true, '2º dispositivo entra');
  var r3 = await s.login({ cpf: cpf, mac: 'M3' });
  ok(r3.ok === false && r3.reason === 'device_limit', '3º dispositivo barrado (limite)');

  // logout libera vaga
  ok((await s.logout(cpf, 'M1')).stopped === 1, 'logout encerra 1 sessão');
  ok((await s.login({ cpf: cpf, mac: 'M3' })).ok === true, 'após logout, novo dispositivo entra');

  // credencial gravada (radcheck)
  var cred = store.getCredential(cpf);
  ok(cred && cred.password && cred.simUse === 2, 'credencial gravada com Simultaneous-Use=2');

  // blacklist
  ok((await s.blacklistAdd(cpf, 'teste')).ok === true, 'blacklistAdd');
  ok((await s.login({ cpf: cpf, mac: 'M9' })).reason === 'blacklist', 'login bloqueado por lista negra');
  ok(store.countActiveSessions(cpf) === 0, 'blacklist derrubou sessões ativas');
  ok((await s.blacklistRemove(cpf)).ok === true && (await s.login({ cpf: cpf, mac: 'M9' })).ok === true, 'após remover, login volta a funcionar');

  // CPF inválido
  ok((await s.login({ cpf: '123' })).reason === 'cpf_invalido', 'CPF inválido rejeitado');
}

// --------------------------------------------------------------- HTTP -------
function req(port, method, path, bodyObj) {
  return new Promise(function (resolve, reject) {
    var data = bodyObj ? JSON.stringify(bodyObj) : null;
    var r = http.request({ host: '127.0.0.1', port: port, method: method, path: path,
      headers: { 'Content-Type': 'application/json' } }, function (res) {
      var buf = ''; res.on('data', function (c) { buf += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function testHttp() {
  return new Promise(function (resolve) {
    console.log('== HTTP (servidor real em localhost) ==');
    var srv = server.defaultServer();
    srv.listen(0, async function () {
      var port = srv.address().port;
      try {
        var h = await req(port, 'GET', '/api/health');
        ok(h.status === 200 && h.body.ok, 'GET /api/health responde ok');

        var cpf = '123.456.789-00';
        var sent = await req(port, 'POST', '/api/sms/send', { cpf: cpf });
        ok(sent.status === 200 && /^\d{4}$/.test(sent.body.mockCode), 'POST /api/sms/send');

        var bad = await req(port, 'POST', '/api/sms/verify', { cpf: cpf, code: '0000' });
        ok(bad.status === 401, 'POST /api/sms/verify código errado -> 401');
        var good = await req(port, 'POST', '/api/sms/verify', { cpf: cpf, code: sent.body.mockCode });
        ok(good.status === 200 && good.body.ok, 'POST /api/sms/verify correto -> 200');

        var l1 = await req(port, 'POST', '/api/login', { cpf: cpf, mac: 'M1' });
        ok(l1.status === 200 && l1.body.credential.username === cpf, 'POST /api/login retorna credencial');
        await req(port, 'POST', '/api/login', { cpf: cpf, mac: 'M2' });
        var l3 = await req(port, 'POST', '/api/login', { cpf: cpf, mac: 'M3' });
        ok(l3.status === 403 && l3.body.reason === 'device_limit', 'limite de dispositivos via HTTP -> 403');

        var blk = await req(port, 'POST', '/api/login', { cpf: '999.999.999-99', mac: 'X' });
        ok(blk.status === 403 && blk.body.reason === 'blacklist', 'CPF do seed na lista negra -> 403');

        var st = await req(port, 'GET', '/api/status');
        ok(st.status === 200 && typeof st.body.activeSessions === 'number', 'GET /api/status');

        var nf = await req(port, 'GET', '/api/naoexiste');
        ok(nf.status === 404, 'rota inexistente -> 404');
      } catch (e) { fail++; console.log('  ❌ erro HTTP:', e.message); }
      srv.close(function () { resolve(); });
    });
  });
}

(async function () {
  await testLogic();
  await testHttp();
  console.log('\nResultado: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})();

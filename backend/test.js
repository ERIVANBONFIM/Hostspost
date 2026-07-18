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

  // SMS (uma tentativa errada não consome o código; rate-limit impede reenvio imediato)
  var sent = await s.sendSms(cpf);
  ok(sent.ok && /^\d{4}$/.test(sent.mockCode), 'sendSms gera código de 4 dígitos');
  ok((await s.verifySms(cpf, '0000')).ok === false, 'verifySms rejeita código errado');
  ok((await s.verifySms(cpf, sent.mockCode)).ok === true, 'verifySms aceita código correto');
  ok((await s.verifySms(cpf, sent.mockCode)).ok === false, 'código é consumido (uso único)');
  // rate-limit: segundo envio imediato é barrado
  ok((await s.sendSms(cpf)).reason === 'rate_limited', 'segundo SMS imediato é barrado (rate-limit)');

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

  // cadastro (register) persiste o perfil
  var cpf2 = '111.444.777-35';
  var reg = await s.register({ cpf: cpf2, mac: 'R1', profile: { nome: 'Maria', telefone: '(11) 99999-0000', setor: 'UTI' } });
  ok(reg.ok && reg.credential.username === cpf2, 'register libera acesso e retorna credencial');
  ok(store.getProfile(cpf2) && store.getProfile(cpf2).nome === 'Maria', 'register persistiu o perfil');
  await s.blacklistAdd(cpf2, 'x');
  ok((await s.register({ cpf: cpf2, mac: 'R2', profile: {} })).reason === 'blacklist', 'register barra CPF na lista negra');
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

        var mt = await req(port, 'GET', '/api/metrics');
        ok(mt.status === 200 && typeof mt.body.requests === 'number', 'GET /api/metrics conta requisições');
      } catch (e) { fail++; console.log('  ❌ erro HTTP:', e.message); }
      srv.close(function () { resolve(); });
    });
  });
}

// ------------------------------------------------ endurecimento (auth/rate) -
function reqAuth(port, method, path, bodyObj, token) {
  return new Promise(function (resolve, reject) {
    var data = bodyObj ? JSON.stringify(bodyObj) : null;
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var r = http.request({ host: '127.0.0.1', port: port, method: method, path: path, headers: headers }, function (res) {
      var buf = ''; res.on('data', function (c) { buf += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

function testHardening() {
  return new Promise(function (resolve) {
    console.log('== Endurecimento (auth admin + rate-limit SMS) ==');
    var srv = server.buildServer({ adminToken: 'segredo-admin' });
    srv.listen(0, async function () {
      var port = srv.address().port;
      try {
        // rota de admin exige token
        var noTok = await reqAuth(port, 'POST', '/api/blacklist', { valor: '555.555.555-55' });
        ok(noTok.status === 401 && noTok.body.reason === 'unauthorized', 'blacklist sem token -> 401');
        var badTok = await reqAuth(port, 'POST', '/api/blacklist', { valor: '555.555.555-55' }, 'errado');
        ok(badTok.status === 401, 'blacklist com token errado -> 401');
        var okTok = await reqAuth(port, 'POST', '/api/blacklist', { valor: '555.555.555-55', motivo: 'x' }, 'segredo-admin');
        ok(okTok.status === 200 && okTok.body.ok, 'blacklist com token válido -> 200');
        // login continua público
        var pub = await reqAuth(port, 'POST', '/api/login', { cpf: '555.555.555-55', mac: 'Z' });
        ok(pub.status === 403 && pub.body.reason === 'blacklist', 'login (público) respeita o bloqueio recém-criado');

        // rate-limit de SMS: 4º envio rápido é barrado (cooldown/limite)
        var cpf = '123.456.789-00';
        var r1 = await reqAuth(port, 'POST', '/api/sms/send', { cpf: cpf });
        ok(r1.status === 200, '1º SMS -> 200');
        var r2 = await reqAuth(port, 'POST', '/api/sms/send', { cpf: cpf });
        ok(r2.status === 429 && r2.body.reason === 'rate_limited', '2º SMS imediato -> 429 (cooldown)');
        ok(typeof r2.body.retryAfterMs === 'number', '429 traz retryAfterMs');
      } catch (e) { fail++; console.log('  ❌ erro:', e.message); }
      srv.close(function () { resolve(); });
    });
  });
}

(async function () {
  await testLogic();
  await testHttp();
  await testHardening();
  console.log('\nResultado: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})();

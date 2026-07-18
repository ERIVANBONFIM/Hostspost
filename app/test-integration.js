/* ==========================================================================
 * Teste de integração app <-> backend.
 * Sobe o backend real (localhost) e exercita o cliente app/js/api.js
 * (fetch nativo do Node 18+). Cobre o contrato usado pelo portal e admin.
 * Roda com: node app/test-integration.js
 * ========================================================================== */
'use strict';
var path = require('path');
var server = require(path.join(__dirname, '..', 'backend', 'server.js'));
var API = require(path.join(__dirname, 'js', 'api.js')); // exporta o mesmo objeto do browser

var pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } }

(function () {
  var srv = server.defaultServer();
  srv.listen(0, async function () {
    var port = srv.address().port;
    API.setBase('http://127.0.0.1:' + port);
    try {
      var h = await API.health();
      ok(h.status === 200 && h.ok, 'api.js health() -> backend ok');

      var cpf = '123.456.789-00';
      var sent = await API.smsSend(cpf);
      ok(sent.status === 200 && /^\d{4}$/.test(sent.mockCode), 'api.js smsSend() retorna código');
      var v1 = await API.smsVerify(cpf, '0000');
      ok(v1.ok === false, 'api.js smsVerify() rejeita código errado');
      var v2 = await API.smsVerify(cpf, sent.mockCode);
      ok(v2.ok === true, 'api.js smsVerify() aceita código correto');

      var l1 = await API.login(cpf, 'M1');
      ok(l1.ok && l1.credential.username === cpf, 'api.js login() 1º dispositivo -> credencial');
      await API.login(cpf, 'M2');
      var l3 = await API.login(cpf, 'M3');
      ok(l3.ok === false && l3.reason === 'device_limit', 'api.js login() 3º dispositivo -> device_limit');

      // fluxo admin: bloquear via API e verificar que o portal (login) é barrado
      var novo = '111.222.333-44';
      ok((await API.login(novo, 'A1')).ok === true, 'CPF novo entra antes do bloqueio');
      await API.blacklistAdd(novo, 'bloqueio via admin');
      var barrado = await API.login(novo, 'A2');
      ok(barrado.ok === false && barrado.reason === 'blacklist', 'após blacklistAdd, login é barrado');
      await API.blacklistRemove(novo);
      ok((await API.login(novo, 'A3')).ok === true, 'após blacklistRemove, login volta');

      // offline: base inválida -> reason offline (app cai no modo demo)
      API.setBase('http://127.0.0.1:1');
      var off = await API.health();
      ok(off.status === 0 && off.reason === 'offline', 'base inacessível -> reason offline (fallback demo)');
    } catch (e) { fail++; console.log('  ❌ erro:', e.message); }
    srv.close(function () {
      console.log('\nResultado: ' + pass + ' PASS / ' + fail + ' FAIL');
      process.exit(fail === 0 ? 0 : 1);
    });
  });
})();

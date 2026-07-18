/* ==========================================================================
 * Hostspost — Portal do Visitante (demo)
 * Fluxo que respeita, EM TEMPO REAL, os toggles definidos no painel admin.
 * ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var TERMO = 'Este Termo regula o uso da rede Wi-Fi de visitantes do hospital. ' +
    'Coletamos CPF, número de telefone e endereço MAC do dispositivo com a finalidade de fornecer ' +
    'o acesso à internet e cumprir a obrigação legal de guarda dos registros de conexão por 12 meses, ' +
    'nos termos do Marco Civil da Internet. Seus dados são tratados conforme a Lei Geral de Proteção ' +
    'de Dados (LGPD) e não são compartilhados para fins de marketing. Você pode solicitar acesso, ' +
    'correção ou eliminação dos seus dados pelo canal de atendimento do titular.';

  var ctx = { cpf: null, code: null, apiSms: false };
  var api = { up: false };

  // Detecta o backend de integração; se online, o portal usa a API real.
  function detectApi() {
    if (!window.HostspostAPI) return;
    window.HostspostAPI.health().then(function (r) {
      api.up = (r.status === 200 && r.ok === true);
      renderApiBadge();
    });
  }
  function renderApiBadge() {
    var el = document.getElementById('api-badge');
    if (!el) return;
    el.textContent = api.up ? '● Backend conectado' : '○ Modo demo (offline)';
    el.className = 'badge ' + (api.up ? 'ok' : 'muted') + ' small';
  }

  function cfg(k) { return window.Store.getConfig(k); }
  function steps() {
    // sequência dinâmica conforme configuração
    var s = ['termo', 'cpf'];
    if (cfg('smsVerification')) s.push('sms');
    s.push('ok');
    return s;
  }
  function renderStepper(active) {
    var seq = steps();
    var el = $('#stepper'); el.innerHTML = '';
    seq.forEach(function (name, i) {
      var span = document.createElement('span');
      if (i <= seq.indexOf(active)) span.className = 'on';
      el.appendChild(span);
    });
  }
  function show(step) {
    ['termo', 'cpf', 'sms', 'ok'].forEach(function (n) {
      var sec = $('#step-' + n); if (sec) sec.hidden = (n !== step);
    });
    renderStepper(step);
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }

  // ---- Etapa 1: termo ----------------------------------------------------
  $('#termo-texto').textContent = TERMO;
  if (cfg('lgpdAudio')) {
    $('#btn-audio').hidden = false; $('#audio-hint').hidden = false;
    $('#btn-audio').addEventListener('click', function () {
      if (!('speechSynthesis' in window)) { toast('Áudio não suportado neste navegador'); return; }
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(TERMO); u.lang = 'pt-BR'; u.rate = 1;
      window.speechSynthesis.speak(u);
      toast('🔊 Lendo o termo em voz alta…');
    });
  }
  $('#aceite').addEventListener('change', function (e) { $('#btn-termo').disabled = !e.target.checked; });
  $('#btn-termo').addEventListener('click', function () {
    window.Store.logAndSave('LGPD', 'Termo aceito por visitante (versão 2, com áudio ' + (cfg('lgpdAudio') ? 'on' : 'off') + ')', 'visitante');
    show('cpf');
  });

  // ---- Etapa 2: CPF ------------------------------------------------------
  var cpfEl = $('#cpf');
  cpfEl.addEventListener('input', function () {
    var d = cpfEl.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 9) out = d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    else if (d.length > 6) out = d.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (d.length > 3) out = d.replace(/(\d{3})(\d{0,3})/, '$1.$2');
    cpfEl.value = out;
  });

  if (cfg('googleLogin')) {
    $('#google-wrap').hidden = false;
    $('#btn-google').addEventListener('click', function () {
      ctx.cpf = ctx.cpf || 'google-' + Date.now();
      window.Store.logAndSave('LOGIN', 'Login via Google (OAuth) — demo', 'visitante');
      connect(true);
    });
  }

  $('#btn-cpf').addEventListener('click', function () {
    var erro = $('#cpf-erro'); erro.hidden = true;
    var cpf = cpfEl.value.trim();
    if (cpf.replace(/\D/g, '').length !== 11) { erro.textContent = 'Informe um CPF válido (11 dígitos).'; erro.hidden = false; return; }

    // Bloqueio por lista negra
    if (window.Store.isBlacklisted(cpf)) {
      erro.textContent = '⛔ Acesso bloqueado para este CPF. Procure a recepção.';
      erro.hidden = false;
      window.Store.logAndSave('BLOQUEIO', 'Tentativa de login de CPF na lista negra: ' + cpf, 'sistema');
      return;
    }
    // Limite de dispositivos
    if (cfg('deviceLimit2')) {
      var u = window.Store.findUser(cpf);
      if (u && u.dispositivos.length >= 2) {
        erro.textContent = '📵 Limite de 2 dispositivos por CPF atingido. Desconecte outro aparelho.';
        erro.hidden = false;
        window.Store.logAndSave('LIMITE', 'Login barrado por limite de dispositivos: ' + cpf, 'sistema');
        return;
      }
    }
    ctx.cpf = cpf;

    if (cfg('smsVerification')) startSms();
    else connect(false);
  });

  function startSms() {
    // Com backend: o código é gerado no servidor. Sem backend: gera local (demo).
    if (api.up) {
      window.HostspostAPI.smsSend(ctx.cpf).then(function (r) {
        if (r.ok) {
          ctx.apiSms = true;
          ctx.code = null;
          $('#sms-demo').textContent = (r.mockCode != null ? r.mockCode : '••••');
          show('sms'); resetCode();
        } else { localSms(); }
      });
    } else { localSms(); }
  }
  function localSms() {
    ctx.apiSms = false;
    ctx.code = String(1000 + Math.floor(rngSeed() * 8999));
    $('#sms-demo').textContent = ctx.code;
    show('sms'); resetCode();
  }

  // ---- Etapa 3: código SMS ----------------------------------------------
  var codeInputs = $$('#code-inputs input');
  function resetCode() { codeInputs.forEach(function (i) { i.value = ''; }); codeInputs[0].focus(); }
  codeInputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () {
      inp.value = inp.value.replace(/\D/g, '');
      if (inp.value && i < codeInputs.length - 1) codeInputs[i + 1].focus();
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !inp.value && i > 0) codeInputs[i - 1].focus();
    });
  });
  $('#btn-sms').addEventListener('click', function () {
    var typed = codeInputs.map(function (i) { return i.value; }).join('');
    var erro = $('#sms-erro'); erro.hidden = true;
    function bad() { erro.textContent = 'Código incorreto. Tente novamente.'; erro.hidden = false; resetCode(); }
    function good() { window.Store.logAndSave('SMS', 'Código SMS validado para ' + ctx.cpf, 'visitante'); connect(false); }

    if (ctx.apiSms) {
      window.HostspostAPI.smsVerify(ctx.cpf, typed).then(function (r) { r.ok ? good() : bad(); });
    } else {
      typed === ctx.code ? good() : bad();
    }
  });

  // ---- Etapa 4: conectar -------------------------------------------------
  function connect(viaGoogle) {
    var cpf = ctx.cpf;
    var mac = 'AA:BB:CC:' + hex2() + ':' + hex2() + ':' + hex2();
    // Com backend e login por CPF, o SERVIDOR decide (lista negra + limite).
    if (api.up && !viaGoogle && cpf && cpf.indexOf('google-') !== 0) {
      window.HostspostAPI.login(cpf, mac).then(function (r) {
        if (r.ok) finishConnect(viaGoogle, mac);
        else rejectLogin(r);
      });
      return;
    }
    finishConnect(viaGoogle, mac);
  }

  function rejectLogin(r) {
    show('cpf');
    var erro = $('#cpf-erro');
    erro.textContent = r.reason === 'blacklist' ? '⛔ Acesso bloqueado para este CPF.'
      : r.reason === 'device_limit' ? '📵 Limite de dispositivos atingido.'
      : 'Não foi possível liberar o acesso (' + (r.reason || 'erro') + ').';
    erro.hidden = false;
  }

  function finishConnect(viaGoogle, mac) {
    // registra/atualiza usuário e dispositivo (visão do admin / demo)
    var st = window.Store.get();
    var cpf = ctx.cpf;
    if (cpf && cpf.indexOf('google-') !== 0) {
      var u = window.Store.findUser(cpf);
      if (!u) { u = { cpf: cpf, nome: 'Visitante ' + cpf.slice(-4), setor: 'Recepção', status: 'ativo', dispositivos: [] }; st.users.push(u); }
      if (u.dispositivos.length < 2 || !cfg('deviceLimit2')) u.dispositivos.push({ mac: mac, ts: Date.now() });
      st.sessions.unshift({ cpf: cpf, mac: mac, setor: u.setor, inicio: Date.now(), fim: null, bytes: 0 });
    }
    window.Store.logAndSave('LOGIN', 'Acesso liberado' + (viaGoogle ? ' (Google)' : '') +
      (cpf ? ' — ' + cpf : '') + (api.up ? ' [via backend]' : ''), 'visitante');

    // aplica recursos pós-conexão conforme config
    $('#banner').hidden = !cfg('campaignBanner');
    $('#notices').hidden = !cfg('hospitalNotices');
    $('#nps').hidden = !cfg('npsSurvey');
    $('#reconnect-note').hidden = !cfg('autoReconnect30d');
    buildNps();
    show('ok');
  }

  function buildNps() {
    var wrap = $('#nps-scale'); wrap.innerHTML = '';
    for (var n = 0; n <= 10; n++) {
      (function (val) {
        var b = document.createElement('button'); b.textContent = val;
        b.addEventListener('click', function () {
          window.Store.get().nps.unshift({ nota: val, ts: Date.now() });
          window.Store.logAndSave('NPS', 'Avaliação NPS recebida: nota ' + val, 'visitante');
          $('#nps-scale').hidden = true; $('#nps-thanks').hidden = false;
        });
        wrap.appendChild(b);
      })(n);
    }
  }

  // utils
  function hex2() { return ('0' + Math.floor(rngSeed() * 256).toString(16)).slice(-2).toUpperCase(); }
  var _s = Date.now() % 100000;
  function rngSeed() { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; }

  // Se a config mudar em outra aba enquanto o visitante está no início, atualiza o stepper
  window.addEventListener('hostspost:change', function () {
    if (!$('#step-ok').hidden) return; // já conectado, não mexe
    if (!$('#step-termo').hidden) renderStepper('termo');
    else if (!$('#step-cpf').hidden) renderStepper('cpf');
  });

  // start
  detectApi();
  show('termo');
})();

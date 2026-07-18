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

  var ctx = { cpf: null, nome: null, tel: null, profile: null, code: null, apiSms: false };
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
    renderCadastro();
    show('cpf');
  });

  // ---- Etapa 2: Cadastro (campos dinâmicos) ------------------------------
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function cpfValido(cpf) {
    var c = digits(cpf); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var s = 0, i, d;
    for (i = 0; i < 9; i++) s += +c[i] * (10 - i); d = (s * 10) % 11 % 10; if (d !== +c[9]) return false;
    s = 0; for (i = 0; i < 10; i++) s += +c[i] * (11 - i); d = (s * 10) % 11 % 10; return d === +c[10];
  }
  function maskCpf(v) {
    var d = digits(v).slice(0, 11);
    if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    if (d.length > 3) return d.replace(/(\d{3})(\d{0,3})/, '$1.$2');
    return d;
  }
  function maskTel(v) {
    var d = digits(v).slice(0, 11);
    if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    if (d.length > 6) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    return d;
  }
  function fieldControl(f) {
    var req = f.required ? ' *' : '';
    if (f.type === 'select') {
      var opts = ['<option value="">Selecione…</option>'].concat((f.options || []).map(function (o) { return '<option>' + o + '</option>'; })).join('');
      return '<label class="field">' + f.label + req + '<select data-k="' + f.key + '">' + opts + '</select></label>';
    }
    var t = f.type === 'date' ? 'date' : (f.type === 'email' ? 'email' : 'text');
    var extra = (f.type === 'cpf' || f.type === 'tel') ? ' inputmode="numeric"' : '';
    var ph = f.type === 'cpf' ? '000.000.000-00' : f.type === 'tel' ? '(00) 00000-0000' : '';
    return '<label class="field">' + f.label + req + '<input data-k="' + f.key + '" type="' + t + '"' + extra + ' placeholder="' + ph + '" autocomplete="off"></label>';
  }
  function onFields() { return window.Store.getRegFields().filter(function (f) { return f.on; }); }
  function renderCadastro() {
    var box = $('#cad-fields'); if (!box) return;
    box.innerHTML = onFields().map(fieldControl).join('');
    var cpfIn = box.querySelector('[data-k="cpf"]');
    if (cpfIn) cpfIn.addEventListener('input', function () { cpfIn.value = maskCpf(cpfIn.value); });
    var telIn = box.querySelector('[data-k="telefone"]');
    if (telIn) telIn.addEventListener('input', function () { telIn.value = maskTel(telIn.value); });
  }

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
    function fail(msg) { erro.textContent = msg; erro.hidden = false; }
    var box = $('#cad-fields'), fields = onFields(), profile = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], el = box.querySelector('[data-k="' + f.key + '"]'), v = el ? el.value.trim() : '';
      profile[f.key] = v;
      if (f.required && !v) return fail(f.label + ' é obrigatório.');
      if (f.type === 'cpf' && v && !cpfValido(v)) return fail('CPF inválido — confira os dígitos.');
      if (f.type === 'tel' && v && digits(v).length < 10) return fail('Celular inválido (informe com DDD).');
      if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return fail('E-mail inválido.');
    }
    var cpf = profile.cpf || null;
    if (cpf && window.Store.isBlacklisted(cpf)) {
      window.Store.logAndSave('BLOQUEIO', 'Tentativa de login de CPF na lista negra: ' + cpf, 'sistema');
      return fail('⛔ Acesso bloqueado para este CPF. Procure a recepção.');
    }
    if (cpf && cfg('deviceLimit2')) {
      var u = window.Store.findUser(cpf);
      if (u && u.dispositivos.length >= 2) {
        window.Store.logAndSave('LIMITE', 'Login barrado por limite de dispositivos: ' + cpf, 'sistema');
        return fail('📵 Limite de 2 dispositivos por CPF atingido. Desconecte outro aparelho.');
      }
    }
    ctx.cpf = cpf; ctx.nome = profile.nome || null; ctx.tel = profile.telefone || null; ctx.profile = profile;
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
      // grava o perfil do cadastro e libera o acesso (blacklist/limite no servidor)
      window.HostspostAPI.register(cpf, mac, ctx.profile || {}).then(function (r) {
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
      var setor = (ctx.profile && ctx.profile.setor) || 'Recepção';
      if (!u) { u = { cpf: cpf, nome: ctx.nome || ('Visitante ' + cpf.slice(-4)), setor: setor, status: 'ativo', dispositivos: [], perfil: ctx.profile || {} }; st.users.push(u); }
      else if (ctx.profile) { u.perfil = ctx.profile; if (ctx.nome) u.nome = ctx.nome; }
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
    else if (!$('#step-cpf').hidden) {
      renderStepper('cpf');
      // re-renderiza os campos apenas se a lista de campos ativos mudou (evita apagar o que já foi digitado)
      var box = $('#cad-fields');
      if (box && onFields().length !== box.querySelectorAll('[data-k]').length) renderCadastro();
    }
  });

  // start
  detectApi();
  show('termo');
})();

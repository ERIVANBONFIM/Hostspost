/* ==========================================================================
 * Hostspost — Painel Admin (demo)
 * Todas as seções operam sobre o Store compartilhado; mudanças refletem no
 * portal (outra aba) via evento 'storage'/'hostspost:change'.
 * ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var S = window.Store;

  // ---- integração com o backend (opcional) ----
  var api = { up: false };
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
    el.textContent = api.up ? '● backend conectado' : '○ backend offline';
    el.className = 'badge ' + (api.up ? 'ok' : 'muted');
  }
  // espelha a lista negra no backend (para o portal via backend respeitar)
  function mirrorAdd(tipo, valor, motivo) {
    var ok = S.addBlacklist(tipo, valor, motivo);
    if (ok && api.up) window.HostspostAPI.blacklistAdd(valor, motivo);
    return ok;
  }
  function mirrorRemove(valor) {
    S.removeBlacklist(valor);
    if (api.up) window.HostspostAPI.blacklistRemove(valor);
  }

  var TABS = [
    ['dashboard', 'Dashboard'], ['config', 'Configurações do Portal'], ['regfields', 'Configurações de Cadastro'],
    ['users', 'Usuários'], ['blacklist', 'Lista negra'], ['filter', 'Filtro de conteúdo'],
    ['band', 'Agendamento de banda'], ['report', 'Relatório'], ['security', 'Segurança & LGPD'], ['log', 'Log de eventos']
  ];
  var current = 'dashboard';

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function gb(bytes) { return (bytes / 1073741824).toFixed(2); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }

  // ---- Abas --------------------------------------------------------------
  function buildTabs() {
    var el = $('#tabs'); el.innerHTML = '';
    TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t[1]; b.className = (t[0] === current ? 'active' : '');
      b.addEventListener('click', function () { current = t[0]; render(); });
      el.appendChild(b);
    });
    document.querySelectorAll('section[data-tab]').forEach(function (sec) {
      sec.hidden = sec.getAttribute('data-tab') !== current;
    });
  }

  // ---- Dashboard ---------------------------------------------------------
  function renderDashboard() {
    var st = S.get();
    var ativos = st.sessions.filter(function (s) { return !s.fim; }).length;
    var trafego = st.sessions.reduce(function (a, s) { return a + s.bytes; }, 0);
    var tiles = [
      ['Sessões ativas', ativos],
      ['Usuários', st.users.length],
      ['Tráfego total', gb(trafego) + ' GB'],
      ['Na lista negra', st.blacklist.length],
      ['Alertas abertos', st.alerts.length],
      ['NPS médio', npsAvg(st).toFixed(1)]
    ];
    $('#stats').innerHTML = tiles.map(function (t) {
      return '<div class="stat"><div class="n">' + t[1] + '</div><div class="l">' + t[0] + '</div></div>';
    }).join('');

    $('#alerts-count').textContent = st.alerts.length + ' alerta(s)';
    $('#alerts-list').innerHTML = st.alerts.map(function (a) {
      var ic = a.nivel === 'alto' ? '🔴' : a.nivel === 'medio' ? '🟠' : '🟢';
      return '<div class="alert ' + a.nivel + '"><span class="ic">' + ic + '</span><div><strong class="small">' +
        a.tipo.toUpperCase() + '</strong><div class="small">' + esc(a.msg) + '</div>' +
        '<div class="small muted">' + fmtDate(a.ts) + '</div></div></div>';
    }).join('') || '<p class="muted small">Sem alertas.</p>';
  }
  function npsAvg(st) { return st.nps.length ? st.nps.reduce(function (a, n) { return a + n.nota; }, 0) / st.nps.length : 0; }

  // ---- Configurações do Portal ------------------------------------------
  var CONFIG_META = [
    ['smsVerification', 'Verificação por SMS', 'Adiciona etapa de código de 4 dígitos no login.'],
    ['googleLogin', 'Login com Google', 'Mostra o botão "Entrar com Google" no portal.'],
    ['autoReconnect30d', 'Reconexão automática 30 dias', 'Reconhece o dispositivo por 30 dias (mac-cookie).'],
    ['npsSurvey', 'Pesquisa NPS', 'Coleta nota 0–10 após conectar.'],
    ['hospitalNotices', 'Avisos do hospital', 'Exibe visitas, refeitório, farmácia, ramais.'],
    ['campaignBanner', 'Banner de campanha', 'Mostra o banner de vacinação após conectar.'],
    ['deviceLimit2', 'Limite de 2 dispositivos por CPF', 'Barra o 3º dispositivo do mesmo CPF.'],
    ['lgpdAudio', 'Termo LGPD em áudio', 'Botão de leitura em voz alta (acessibilidade).']
  ];
  function renderConfig() {
    var box = $('#config-list'); box.innerHTML = '';
    CONFIG_META.forEach(function (c) {
      var on = S.getConfig(c[0]);
      var card = document.createElement('div');
      card.className = 'card'; card.style.boxShadow = 'none'; card.style.background = 'var(--surface-2)';
      card.innerHTML =
        '<div class="row spread" style="align-items:flex-start">' +
          '<div style="flex:1"><strong class="small">' + c[1] + '</strong>' +
          '<div class="muted small">' + c[2] + '</div></div>' +
          '<label class="switch"><input type="checkbox" ' + (on ? 'checked' : '') + '>' +
          '<span class="track"></span></label>' +
        '</div>';
      card.querySelector('input').addEventListener('change', function (e) {
        S.setConfig(c[0], e.target.checked);
        toast(c[1] + (e.target.checked ? ' ativado' : ' desativado'));
      });
      box.appendChild(card);
    });
  }

  // ---- Configurações de Cadastro ----------------------------------------
  function renderRegfields() {
    var tb = $('#regfields-table tbody'); tb.innerHTML = '';
    S.getRegFields().forEach(function (f) {
      var tr = document.createElement('tr');
      var onSw = '<label class="switch"><input type="checkbox" data-on="' + f.key + '" ' + (f.on ? 'checked' : '') + (f.locked ? ' disabled' : '') + '><span class="track"></span></label>';
      var reqSw = '<label class="switch"><input type="checkbox" data-req="' + f.key + '" ' + (f.required ? 'checked' : '') + ((f.locked || !f.on) ? ' disabled' : '') + '><span class="track"></span></label>';
      tr.innerHTML = '<td><strong>' + esc(f.label) + '</strong>' + (f.locked ? ' <span class="badge muted">essencial</span>' : '') + '</td>' +
        '<td class="small muted">' + f.type + '</td><td>' + onSw + '</td><td>' + reqSw + '</td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-on]').forEach(function (i) {
      i.addEventListener('change', function () { S.setRegField(i.getAttribute('data-on'), 'on', i.checked); toast('Campo atualizado'); renderRegfields(); });
    });
    tb.querySelectorAll('[data-req]').forEach(function (i) {
      i.addEventListener('change', function () { S.setRegField(i.getAttribute('data-req'), 'required', i.checked); toast('Campo atualizado'); });
    });
  }

  // ---- Usuários ----------------------------------------------------------
  function renderUsers() {
    var tb = $('#users-table tbody'); tb.innerHTML = '';
    S.get().users.forEach(function (u) {
      var tr = document.createElement('tr');
      var badge = u.status === 'bloqueado' ? '<span class="badge danger">bloqueado</span>' : '<span class="badge ok">ativo</span>';
      var btn = u.status === 'bloqueado'
        ? '<button class="btn ghost small" data-unblock="' + u.cpf + '">Desbloquear</button>'
        : '<button class="btn danger small" data-block="' + u.cpf + '">Bloquear</button>';
      tr.innerHTML = '<td>' + esc(u.nome) + '</td><td>' + u.cpf + '</td><td>' + esc(u.setor) + '</td>' +
        '<td>' + u.dispositivos.length + '/2</td><td>' + badge + '</td><td>' + btn + '</td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-block]').forEach(function (b) {
      b.addEventListener('click', function () {
        mirrorAdd('cpf', b.getAttribute('data-block'), 'Bloqueado pelo admin na tabela de usuários');
        toast('Usuário bloqueado e adicionado à lista negra');
      });
    });
    tb.querySelectorAll('[data-unblock]').forEach(function (b) {
      b.addEventListener('click', function () { mirrorRemove(b.getAttribute('data-unblock')); toast('Usuário desbloqueado'); });
    });
  }

  // ---- Lista negra -------------------------------------------------------
  function renderBlacklist() {
    var tb = $('#bl-table tbody'); tb.innerHTML = '';
    S.get().blacklist.forEach(function (b) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><span class="badge muted">' + b.tipo.toUpperCase() + '</span></td><td>' + esc(b.valor) +
        '</td><td class="small">' + esc(b.motivo) + '</td><td class="small muted">' + fmtDate(b.ts) + '</td>' +
        '<td><button class="btn ghost small" data-rm="' + esc(b.valor) + '">Remover</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-rm]').forEach(function (x) {
      x.addEventListener('click', function () { mirrorRemove(x.getAttribute('data-rm')); toast('Removido da lista negra'); });
    });
  }
  function bindBlacklistForm() {
    $('#bl-add').addEventListener('click', function () {
      var v = $('#bl-valor').value.trim();
      if (!v) { toast('Informe um valor'); return; }
      var ok = mirrorAdd($('#bl-tipo').value, v, $('#bl-motivo').value.trim());
      if (!ok) { toast('Este valor já está na lista'); return; }
      $('#bl-valor').value = ''; $('#bl-motivo').value = '';
      toast('Adicionado à lista negra');
    });
  }

  // ---- Filtro de conteúdo -----------------------------------------------
  function renderFilter() {
    var box = $('#filter-list'); box.innerHTML = '';
    S.get().contentFilters.forEach(function (f, idx) {
      var card = document.createElement('div');
      card.className = 'card'; card.style.boxShadow = 'none'; card.style.background = 'var(--surface-2)';
      card.innerHTML = '<div class="row spread"><strong class="small">' + esc(f.categoria) + '</strong>' +
        '<label class="switch"><input type="checkbox" ' + (f.ativo ? 'checked' : '') + '><span class="track"></span></label></div>';
      card.querySelector('input').addEventListener('change', function (e) {
        S.get().contentFilters[idx].ativo = e.target.checked;
        S.logAndSave('FILTRO', 'Categoria "' + f.categoria + '" ' + (e.target.checked ? 'BLOQUEADA' : 'liberada'), 'admin');
        toast(f.categoria + (e.target.checked ? ' bloqueada' : ' liberada'));
      });
      box.appendChild(card);
    });
  }

  // ---- Agendamento de banda ---------------------------------------------
  function renderBand() {
    var tb = $('#band-table tbody'); tb.innerHTML = '';
    S.get().bandSchedule.forEach(function (b) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><span class="badge brand">' + esc(b.perfil) + '</span></td><td>' + b.inicio +
        '</td><td>' + b.fim + '</td><td><code>' + esc(b.limite) + '</code></td>';
      tb.appendChild(tr);
    });
  }

  // ---- Relatório ---------------------------------------------------------
  function renderReport() {
    var st = S.get();
    var trafego = st.sessions.reduce(function (a, s) { return a + s.bytes; }, 0);
    var durMed = st.sessions.reduce(function (a, s) { return a + ((s.fim || Date.now()) - s.inicio); }, 0) / (st.sessions.length || 1) / 60000;
    var tiles = [
      ['Sessões no período', st.sessions.length],
      ['Tráfego', gb(trafego) + ' GB'],
      ['Duração média', durMed.toFixed(0) + ' min'],
      ['NPS médio', npsAvg(st).toFixed(1)]
    ];
    $('#report-stats').innerHTML = tiles.map(function (t) {
      return '<div class="stat"><div class="n">' + t[1] + '</div><div class="l">' + t[0] + '</div></div>';
    }).join('');

    var porSetor = {};
    st.sessions.forEach(function (s) { porSetor[s.setor] = (porSetor[s.setor] || 0) + 1; });
    var arr = Object.keys(porSetor).map(function (k) { return [k, porSetor[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = arr.length ? arr[0][1] : 1;
    $('#report-setores').innerHTML = arr.map(function (x) {
      var pct = Math.round(x[1] / max * 100);
      return '<div style="margin:8px 0"><div class="row spread small"><span>' + esc(x[0]) + '</span><span class="muted">' + x[1] + ' sessões</span></div>' +
        '<div style="height:8px;background:var(--line);border-radius:999px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--brand)"></div></div></div>';
    }).join('');
  }
  function exportCsv() {
    var st = S.get();
    var rows = [['cpf', 'mac', 'setor', 'inicio', 'fim', 'bytes']];
    st.sessions.forEach(function (s) {
      rows.push([s.cpf, s.mac, s.setor, new Date(s.inicio).toISOString(), s.fim ? new Date(s.fim).toISOString() : '', s.bytes]);
    });
    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'relatorio-hostspost.csv'; a.click(); URL.revokeObjectURL(a.href);
    S.logAndSave('RELATORIO', 'Relatório mensal exportado (CSV)', 'admin');
    toast('Relatório exportado');
  }

  // ---- Segurança / auditoria da auditoria -------------------------------
  function renderSecurity() {
    var acessos = S.get().eventLog.filter(function (e) { return e.tipo === 'RELATORIO' || e.tipo === 'AUDITORIA'; });
    // registra o próprio acesso à aba de logs como "auditoria da auditoria"
    var body = $('#audit-body');
    body.innerHTML = acessos.map(function (e) {
      return '<tr><td class="small muted">' + fmtDate(e.ts) + '</td><td>' + esc(e.ator) + '</td><td class="small">' + esc(e.msg) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="muted small">Nenhum acesso a logs/relatórios registrado ainda.</td></tr>';
  }

  // ---- Log ---------------------------------------------------------------
  function renderLog() {
    var st = S.get();
    $('#log-count').textContent = st.eventLog.length + ' evento(s)';
    $('#log-body').innerHTML = st.eventLog.map(function (e) {
      return '<tr><td class="small muted">' + fmtDate(e.ts) + '</td><td><span class="badge ' + tipoBadge(e.tipo) + '">' +
        e.tipo + '</span></td><td class="small">' + esc(e.msg) + '</td><td class="small muted">' + esc(e.ator) + '</td></tr>';
    }).join('');
  }
  function tipoBadge(t) {
    if (t === 'CONFIG') return 'brand';
    if (t === 'BLACKLIST' || t === 'BLOQUEIO' || t === 'LIMITE') return 'danger';
    if (t === 'NPS' || t === 'LOGIN') return 'ok';
    return 'muted';
  }

  // ---- util --------------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ---- render principal --------------------------------------------------
  function render() {
    buildTabs();
    if (current === 'dashboard') renderDashboard();
    else if (current === 'config') renderConfig();
    else if (current === 'regfields') renderRegfields();
    else if (current === 'users') renderUsers();
    else if (current === 'blacklist') renderBlacklist();
    else if (current === 'filter') renderFilter();
    else if (current === 'band') renderBand();
    else if (current === 'report') renderReport();
    else if (current === 'security') renderSecurity();
    else if (current === 'log') renderLog();
  }

  bindBlacklistForm();
  $('#btn-export').addEventListener('click', exportCsv);

  // registra a visita à aba de log como acesso auditável (auditoria da auditoria)
  $('#tabs').addEventListener('click', function () {
    if (current === 'log') { S.logAndSave('AUDITORIA', 'Operador acessou o log de eventos', 'admin'); }
  });

  // re-render quando o estado muda (inclusive por outra aba)
  window.addEventListener('hostspost:change', function () { render(); });

  detectApi();
  render();
})();

/* ==========================================================================
 * Hostspost — camada de estado compartilhado (demo front-end)
 * Persiste em localStorage e sincroniza entre abas (portal <-> admin).
 * Não há back-end: isto é a maquete da Versão 2 para homologação de UX.
 * ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'hostspost.state.v2';

  // ---- Estado inicial (seed) ---------------------------------------------
  function seed() {
    return {
      config: {
        smsVerification: true,   // etapa de código de 4 dígitos
        googleLogin: true,       // botão "Entrar com Google"
        autoReconnect30d: true,  // reconexão automática por 30 dias
        npsSurvey: true,         // pesquisa NPS após conectar
        hospitalNotices: true,   // página de avisos do hospital
        campaignBanner: true,    // banner de campanha (vacinação)
        deviceLimit2: true,      // limite de 2 dispositivos por CPF
        lgpdAudio: true          // termo LGPD em áudio (TTS)
      },
      users: [
        { cpf: '123.456.789-00', nome: 'Maria Souza',   setor: 'Recepção',   status: 'ativo',     dispositivos: [{ mac: 'AA:BB:CC:00:00:01', ts: Date.now() - 8.64e7 }] },
        { cpf: '987.654.321-00', nome: 'João Pereira',  setor: 'Ambulatório', status: 'ativo',     dispositivos: [{ mac: 'AA:BB:CC:00:00:02', ts: Date.now() - 3.6e6 }, { mac: 'AA:BB:CC:00:00:03', ts: Date.now() - 1.8e6 }] },
        { cpf: '111.222.333-44', nome: 'Ana Lima',      setor: 'Internação',  status: 'ativo',     dispositivos: [{ mac: 'AA:BB:CC:00:00:04', ts: Date.now() - 6e5 }] },
        { cpf: '999.999.999-99', nome: 'Visitante Bloq.', setor: '—',         status: 'bloqueado', dispositivos: [] }
      ],
      blacklist: [
        { tipo: 'cpf', valor: '999.999.999-99', motivo: 'Uso indevido reportado', ts: Date.now() - 1.5e8 }
      ],
      contentFilters: [
        { categoria: 'Conteúdo adulto', ativo: true },
        { categoria: 'Torrent / P2P',   ativo: true },
        { categoria: 'Apostas',         ativo: true },
        { categoria: 'Malware / phishing', ativo: true },
        { categoria: 'Redes sociais',   ativo: false }
      ],
      bandSchedule: [
        { perfil: 'Padrão',   inicio: '00:00', fim: '11:59', limite: '5M/10M' },
        { perfil: 'Pico',     inicio: '12:00', fim: '13:59', limite: '2M/4M' },
        { perfil: 'Padrão',   inicio: '14:00', fim: '23:59', limite: '5M/10M' }
      ],
      sessions: seedSessions(),
      nps: [ { nota: 9, ts: Date.now() - 8.64e7 }, { nota: 8, ts: Date.now() - 4.3e7 }, { nota: 10, ts: Date.now() - 2e7 } ],
      alerts: [
        { tipo: 'consumo', nivel: 'alto',  msg: 'Consumo elevado: CPF 987.654.321-00 passou de 12 GB em 24h', ts: Date.now() - 3.6e6 },
        { tipo: 'invasao', nivel: 'medio', msg: 'Tentativa de invasão bloqueada: 14 rejeições do MAC AA:BB:CC:00:00:09', ts: Date.now() - 1.8e6 },
        { tipo: 'pico',    nivel: 'baixo', msg: 'Pico de conexões: 128 sessões simultâneas às 12h05', ts: Date.now() - 9e5 }
      ],
      eventLog: [
        { tipo: 'SISTEMA', msg: 'Sistema iniciado com configuração padrão', ator: 'sistema', ts: Date.now() - 1.7e8 }
      ]
    };
  }

  function seedSessions() {
    var setores = ['Recepção', 'Ambulatório', 'Internação', 'Refeitório', 'Farmácia'];
    var out = [];
    for (var i = 0; i < 40; i++) {
      var dur = 300 + Math.floor(rng(i) * 5400);
      out.push({
        cpf: ['123.456.789-00', '987.654.321-00', '111.222.333-44'][i % 3],
        mac: 'AA:BB:CC:00:0' + (i % 9) + ':' + (10 + i),
        setor: setores[i % setores.length],
        inicio: Date.now() - (i + 1) * 3.6e6,
        fim: Date.now() - (i + 1) * 3.6e6 + dur * 1000,
        bytes: Math.floor((0.2 + rng(i * 7) * 3) * 1073741824)
      });
    }
    return out;
  }

  // rng determinístico (evita Math.random p/ seed estável)
  function rng(n) { var x = Math.sin(n * 99.13) * 10000; return x - Math.floor(x); }

  // ---- Persistência -------------------------------------------------------
  var state = load();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignora */ }
    var s = seed();
    persist(s);
    return s;
  }

  function persist(s) {
    try { global.localStorage.setItem(KEY, JSON.stringify(s || state)); } catch (e) {}
  }

  function save() {
    persist(state);
    // notifica a própria aba (o evento 'storage' só dispara em OUTRAS abas)
    global.dispatchEvent(new CustomEvent('hostspost:change', { detail: { state: state } }));
  }

  // sincroniza quando outra aba altera o estado
  global.addEventListener('storage', function (ev) {
    if (ev.key === KEY && ev.newValue) {
      try { state = JSON.parse(ev.newValue); } catch (e) { return; }
      global.dispatchEvent(new CustomEvent('hostspost:change', { detail: { state: state } }));
    }
  });

  // ---- API pública --------------------------------------------------------
  var Store = {
    KEY: KEY,
    get: function () { return state; },

    getConfig: function (k) { return k ? state.config[k] : state.config; },

    setConfig: function (k, val) {
      var before = state.config[k];
      state.config[k] = val;
      this.log('CONFIG', 'Recurso "' + labelConfig(k) + '" ' + (val ? 'ATIVADO' : 'DESATIVADO') +
        ' (antes: ' + (before ? 'on' : 'off') + ')', 'admin');
      save();
    },

    log: function (tipo, msg, ator) {
      state.eventLog.unshift({ tipo: tipo, msg: msg, ator: ator || 'sistema', ts: Date.now() });
      if (state.eventLog.length > 500) state.eventLog.length = 500;
      // não chama save() aqui p/ evitar recursão; quem loga fora de setConfig deve salvar
    },

    logAndSave: function (tipo, msg, ator) { this.log(tipo, msg, ator); save(); },

    isBlacklisted: function (valor) {
      return state.blacklist.some(function (b) { return b.valor === valor; });
    },

    addBlacklist: function (tipo, valor, motivo) {
      if (this.isBlacklisted(valor)) return false;
      state.blacklist.unshift({ tipo: tipo, valor: valor, motivo: motivo || '—', ts: Date.now() });
      var u = state.users.find(function (x) { return x.cpf === valor; });
      if (u) u.status = 'bloqueado';
      this.log('BLACKLIST', 'Adicionado à lista negra: ' + tipo.toUpperCase() + ' ' + valor + ' — ' + (motivo || '—'), 'admin');
      save();
      return true;
    },

    removeBlacklist: function (valor) {
      state.blacklist = state.blacklist.filter(function (b) { return b.valor !== valor; });
      var u = state.users.find(function (x) { return x.cpf === valor; });
      if (u) u.status = 'ativo';
      this.logAndSave('BLACKLIST', 'Removido da lista negra: ' + valor, 'admin');
    },

    findUser: function (cpf) { return state.users.find(function (u) { return u.cpf === cpf; }); },

    reset: function () { state = seed(); save(); }
  };

  function labelConfig(k) {
    return ({
      smsVerification: 'Verificação por SMS',
      googleLogin: 'Login com Google',
      autoReconnect30d: 'Reconexão automática 30 dias',
      npsSurvey: 'Pesquisa NPS',
      hospitalNotices: 'Avisos do hospital',
      campaignBanner: 'Banner de campanha',
      deviceLimit2: 'Limite de 2 dispositivos por CPF',
      lgpdAudio: 'Termo LGPD em áudio'
    })[k] || k;
  }

  Store.labelConfig = labelConfig;
  global.Store = Store;
})(window);

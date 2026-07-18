/* ==========================================================================
 * Hostspost — backend de integração (referência)
 * Lógica do contrato portal <-> RADIUS descrito em docs/04.
 * Usa um "store" plugável: em memória (padrão, testável) ou MySQL/radcheck
 * (adapters/mysql.js, para produção). Todos os métodos são async, para
 * funcionar tanto com store síncrono (memória) quanto assíncrono (MySQL).
 * ========================================================================== */
'use strict';
var crypto = require('crypto');

/**
 * Cria uma instância do serviço sobre um store.
 * @param {object} store  implementa a interface descrita no README.
 * @param {object} opts   { codeTtlMs, deviceLimit }
 */
function createService(store, opts) {
  opts = opts || {};
  var CODE_TTL = opts.codeTtlMs || 5 * 60 * 1000; // 5 min
  var DEVICE_LIMIT = opts.deviceLimit || 2;

  function now() { return Date.now(); }
  function token() { return crypto.randomBytes(16).toString('hex'); }
  function code4() { return String(1000 + (crypto.randomBytes(2).readUInt16BE(0) % 9000)); }
  function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
  function validCpf(cpf) { return onlyDigits(cpf).length === 11; }

  return {
    /** Envia (mock) um código SMS de 4 dígitos para o CPF. */
    sendSms: async function (cpf) {
      if (!validCpf(cpf)) return { ok: false, reason: 'cpf_invalido' };
      var code = code4();
      await store.putCode(cpf, { code: code, exp: now() + CODE_TTL });
      await store.log('SMS', 'Código enviado para ' + cpf);
      // Em produção, aqui chama o gateway SMS. No mock devolvemos o código.
      return { ok: true, expiresInMs: CODE_TTL, mockCode: code };
    },

    /** Verifica o código informado. Consome em caso de sucesso. */
    verifySms: async function (cpf, code) {
      var rec = await store.getCode(cpf);
      if (!rec) return { ok: false, reason: 'sem_codigo' };
      if (now() > rec.exp) { await store.delCode(cpf); return { ok: false, reason: 'expirado' }; }
      if (onlyDigits(code) !== rec.code) return { ok: false, reason: 'codigo_incorreto' };
      await store.delCode(cpf);
      await store.log('SMS', 'Código validado para ' + cpf);
      return { ok: true };
    },

    /**
     * Autentica e libera o acesso: aplica lista negra e limite de dispositivos,
     * grava a credencial (radcheck) e abre a sessão (radacct).
     * @returns { ok, reason?, credential? }
     */
    login: async function (params) {
      params = params || {};
      var cpf = params.cpf, mac = params.mac;
      var enforceLimit = params.enforceLimit !== false;
      if (!validCpf(cpf)) return { ok: false, reason: 'cpf_invalido' };

      if (await store.isBlacklisted(cpf)) {
        await store.log('BLOQUEIO', 'Login barrado (lista negra): ' + cpf);
        return { ok: false, reason: 'blacklist' };
      }
      if (enforceLimit) {
        var ativos = await store.countActiveSessions(cpf);
        if (ativos >= DEVICE_LIMIT) {
          await store.log('LIMITE', 'Login barrado (limite de ' + DEVICE_LIMIT + ' disp.): ' + cpf);
          return { ok: false, reason: 'device_limit', active: ativos };
        }
      }
      var pass = token();
      await store.upsertCredential(cpf, pass, DEVICE_LIMIT);  // grava radcheck (senha + Simultaneous-Use)
      await store.startSession(cpf, mac || null);             // radacct Start
      await store.log('LOGIN', 'Acesso liberado: ' + cpf + (mac ? ' / ' + mac : ''));
      // A senha (token) é injetada pelo portal no /login do hotspot (CHAP).
      return { ok: true, credential: { username: cpf, password: pass } };
    },

    /** Login social: identidade vem do provedor; associa a um CPF já informado. */
    loginGoogle: async function (params) {
      params = params || {};
      if (!params.cpf) return { ok: false, reason: 'cpf_obrigatorio' };
      await store.log('LOGIN', 'OAuth Google associado a ' + params.cpf);
      return this.login({ cpf: params.cpf, mac: params.mac, enforceLimit: params.enforceLimit });
    },

    /** Encerra a sessão de um dispositivo (Acct-Stop). */
    logout: async function (cpf, mac) {
      var n = await store.stopSession(cpf, mac || null);
      await store.log('LOGOUT', 'Sessão encerrada: ' + cpf + (mac ? ' / ' + mac : '') + ' (' + n + ')');
      return { ok: true, stopped: n };
    },

    blacklistAdd: async function (valor, motivo) {
      var added = await store.addBlacklist(valor, motivo);
      if (added) await store.log('BLACKLIST', 'Adicionado: ' + valor + ' — ' + (motivo || '—'));
      return { ok: added };
    },
    blacklistRemove: async function (valor) {
      await store.removeBlacklist(valor);
      await store.log('BLACKLIST', 'Removido: ' + valor);
      return { ok: true };
    },

    status: async function () {
      return {
        ok: true,
        deviceLimit: DEVICE_LIMIT,
        activeSessions: await store.totalActive(),
        blacklist: await store.blacklistCount()
      };
    }
  };
}

module.exports = { createService: createService };

# 06 — Segurança e LGPD

Recomendações de segurança e conformidade legal para o Hostspost em ambiente hospitalar,
onde se tratam dados pessoais (CPF, telefone, MAC, histórico de conexão).

> Este documento traz **recomendações técnicas**, não parecer jurídico. Valide as bases
> legais e políticas de retenção com o DPO/jurídico da instituição.

## 6.1 Bases legais e princípios (LGPD — Lei 13.709/2018)

- **Finalidade e minimização:** colete apenas o necessário para prover o acesso Wi-Fi e
  cumprir obrigação legal (guarda de logs). Evite coletar dados sensíveis.
- **Base legal:** normalmente **consentimento** (aceite do termo no portal) e/ou
  **cumprimento de obrigação legal** (Marco Civil, ver §6.2). Registre o aceite com
  data/hora e versão do termo.
- **Transparência:** o termo LGPD deve estar acessível (inclusive em **áudio/TTS** para
  acessibilidade) antes do aceite.
- **Direitos do titular:** disponibilizar canal (portal do titular) para acesso,
  correção, portabilidade e eliminação, respeitada a retenção legal.

## 6.2 Retenção de logs (Marco Civil — Lei 12.965/2014)

- O provedor de conexão deve guardar os **registros de conexão** por **12 meses**
  (art. 13). Para o Hostspost, isso corresponde aos registros de `radacct` (início/fim de
  sessão, IP, MAC, tempo, bytes).
- **Política sugerida:**
  - `radacct`: reter **12 meses** e então **anonimizar/eliminar**.
  - Dados de identidade (CPF/telefone): reter apenas enquanto necessário à finalidade;
    após o prazo, **anonimizar** (dissociar do accounting).

```sql
-- Exemplo de expurgo/anonimização mensal (rodar via cron, com backup antes)
-- Anonimiza identificadores em accounting com mais de 12 meses
UPDATE radacct
SET username = CONCAT('anon-', SHA2(username, 256)),
    callingstationid = 'ANON'
WHERE acctstarttime < (NOW() - INTERVAL 12 MONTH);
```

## 6.3 Anonimização e pseudonimização

- Em relatórios e dashboards, prefira **agregados** (contagens, somas) a dados
  individuais.
- Ao exportar o relatório mensal, **pseudonimize** o CPF (hash) salvo quando houver
  exigência legal específica.
- Separe o armazenamento de identidade (portal) do accounting (`radacct`), ligados por um
  identificador que possa ser rompido na anonimização.

## 6.4 Criptografia e transporte

| Superfície | Recomendação |
|-----------|--------------|
| Portal (login, termos, NPS) | **HTTPS obrigatório** (TLS válido), HSTS |
| RADIUS MikroTik ↔ FreeRADIUS | **RADSEC (TLS, 2083/TCP)** se não estiverem na mesma rede confiável; senão, segredo forte e rede isolada |
| Banco de dados | Conexões TLS; credenciais fora do código; acesso restrito por IP |
| Senhas/tokens em `radcheck` | Tokens de uso único aleatórios; nunca reutilizar; rotacionar |
| Backups | Criptografados em repouso |

Habilitar RADSEC no FreeRADIUS envolve o site `tls` (`sites-enabled/tls`) e configurar o
MikroTik com `/radius add ... protocol=radsec`. Use certificados próprios de uma CA
interna.

## 6.5 2FA no painel administrativo

- Acesso ao painel admin **somente com 2FA** (TOTP) sobre HTTPS.
- Contas administrativas nominais (sem usuário compartilhado), com perfis de permissão.
- Sessões administrativas com expiração curta e re-autenticação para ações críticas
  (blacklist, mudança de banda global, exportação de dados pessoais).

## 6.6 Auditoria e "auditoria da auditoria"

- **Log de eventos CONFIG:** toda mudança de toggle/configuração registra quem, o quê e
  quando. Do lado da infra, mudanças em MikroTik/FreeRADIUS devem ser versionadas
  (ex.: exportar `/export` do RouterOS e manter em controle de versão).
- **Auditoria da auditoria:** registrar **quem acessou os logs** (leitura/exportação de
  `radacct`, `radpostauth`, relatórios). Esse metalog deve ser somente-append e ter
  retenção própria.
- Centralize logs (syslog remoto) para impedir adulteração local e facilitar correlação.

## 6.7 Boas práticas adicionais

- Isolamento de VLAN e **client isolation** (ver [01](01-arquitetura.md)).
- Filtro de conteúdo malware ativo por padrão (ver [05](05-recursos-v2-para-infra.md)).
- Firewall do FreeRADIUS/DB aceitando apenas o IP do MikroTik nas portas AAA.
- Atualizações regulares de RouterOS e pacotes do servidor; janela de manutenção.
- Teste de restauração de backup periodicamente.

Prossiga para [07-checklist-implantacao.md](07-checklist-implantacao.md).

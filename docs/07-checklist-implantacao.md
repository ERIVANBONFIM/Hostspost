# 07 — Checklist de Implantação

Passo a passo para levar o Hostspost à produção, com testes de aceite por recurso e plano
de rollback.

## 7.1 Pré-requisitos

- [ ] MikroTik com RouterOS 7.x atualizado e acesso administrativo.
- [ ] VLAN de visitantes definida e isolada da rede administrativa/clínica.
- [ ] VM Linux (Debian 12 / Ubuntu 22.04) para FreeRADIUS + banco.
- [ ] `PORTAL_FQDN` com certificado TLS válido e portal externo publicado.
- [ ] Contrato do gateway de SMS e credenciais do Google OAuth.
- [ ] Segredo RADIUS forte definido e guardado em cofre de senhas.
- [ ] Backup/rollback planejados (config atual do MikroTik exportada).

## 7.2 Sequência de implantação

1. [ ] **Banco:** criar DB e importar schema (ver [03](03-freeradius.md)).
2. [ ] **FreeRADIUS:** instalar, configurar módulo `sql`, `clients.conf` com o MikroTik.
3. [ ] **Teste local:** `radtest` com usuário de exemplo → `Access-Accept`.
4. [ ] **MikroTik:** VLAN, DHCP, cliente RADIUS, perfil e servidor de hotspot.
5. [ ] **Walled garden:** liberar `PORTAL_FQDN`, Google, gateway SMS, CDNs.
6. [ ] **Portal:** apontar para gravar `radcheck` e enviar login ao hotspot.
7. [ ] **CoA/Disconnect:** habilitar entrada 3799 no MikroTik e testar `radclient`.
8. [ ] **Filtro de conteúdo:** DNS filtrado e/ou address-lists por categoria.
9. [ ] **Homologação:** validar todos os testes de aceite (§7.3) com dispositivos reais.
10. [ ] **Go-live:** ativar SSID de visitantes para o público; monitorar.

## 7.3 Testes de aceite (por recurso)

| # | Recurso | Como testar | Esperado |
|---|---------|-------------|----------|
| 1 | Login por CPF/SMS | Conectar, informar CPF, receber e digitar código | Acesso liberado; `radacct` registra sessão |
| 2 | Login Google | Escolher "Entrar com Google", autorizar | Acesso liberado; credencial em `radcheck` |
| 3 | Reconexão 30 dias | Reconectar o mesmo device depois de sair | Entra sem passar pelo portal (mac-cookie) |
| 4 | Limite 2 dispositivos | 3º dispositivo com o mesmo CPF | 3ª sessão negada (`Simultaneous-Use`) |
| 5 | Banda por perfil | Medir velocidade em perfil padrão vs reduzido | Rate-limit aplicado conforme perfil |
| 6 | Agendamento de banda | Forçar horário de pico / CoA | Banda muda sem derrubar sessão |
| 7 | Filtro de conteúdo | Acessar site de categoria bloqueada | Bloqueado; categorias liberadas funcionam |
| 8 | Blacklist | "Bloquear" um CPF/MAC no admin | Sessão cai na hora; novo login negado |
| 9 | Walled garden | Antes do login, abrir portal e Google | Carregam; demais sites redirecionam ao portal |
| 10 | Alertas | Gerar consumo alto / rajada de falhas | Alerta disparado no painel |
| 11 | Relatório mensal | Exportar relatório | CSV/PDF com sessões, tráfego, setor, NPS |
| 12 | LGPD/áudio | Abrir termo e acionar leitura em voz | Termo lido; aceite registrado com data/versão |

## 7.4 Monitoramento e operação

- [ ] Dashboard de sessões ativas (`radacct` com `acctstoptime IS NULL`).
- [ ] Alertas de consumo/pico/invasão ativos (ver [05](05-recursos-v2-para-infra.md)).
- [ ] Backup diário do banco (criptografado) e `/export` do RouterOS versionado.
- [ ] Expurgo/anonimização mensal de `radacct` > 12 meses (ver [06](06-seguranca-lgpd.md)).
- [ ] Verificação periódica de atualizações (RouterOS e pacotes do servidor).

## 7.5 Plano de rollback

- [ ] **MikroTik:** manter `/export` da configuração anterior; em falha, restaurar e
      desabilitar o servidor de hotspot novo (`/ip hotspot disable hs-visitantes`).
- [ ] **FreeRADIUS:** manter a config anterior; parar o serviço reverte o portal para o
      comportamento pré-implantação (sem liberar acesso).
- [ ] **Banco:** restaurar do último backup íntegro antes de mudanças de schema.
- [ ] **Critério de rollback:** falha nos testes 1–4 (login/limite) ou indisponibilidade
      do FreeRADIUS sem redundância.

## 7.6 Fora de escopo desta documentação

- Código do portal e do painel admin (front-end/back-end).
- Provisionamento físico de APs/switches e cabeamento.
- Contratação de SMS/OAuth e credenciais reais.
- Laudo formal de segurança/pentest — aqui há recomendações, não certificação.

Fim da documentação. Volte ao [índice](README.md).

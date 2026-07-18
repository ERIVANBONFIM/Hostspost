# App — Versão 2 (demonstração front-end)

Maquete funcional do **portal do visitante** e do **painel administrativo** do Hostspost.
É uma demo de **front-end puro** (HTML/CSS/JS, sem back-end): o estado vive no
`localStorage` do navegador e é compartilhado entre as abas — por isso os toggles do
Admin refletem no Portal em tempo real.

> Em produção, esta camada de UI conversa com a infraestrutura documentada em
> [`../docs`](../docs) (MikroTik + FreeRADIUS) e validada no [`../lab`](../lab).

## Como abrir

Como usa `localStorage` e navegação entre páginas, sirva a pasta por HTTP (evita
restrições de `file://`):

```bash
cd app
python3 -m http.server 8080
# abra http://localhost:8080
```

Ou abra `app/index.html` direto no navegador (funciona na maioria dos casos).

## Como testar (o efeito "liga/desliga")

1. Abra o **Painel Admin** numa aba e o **Portal do Visitante** em outra.
2. No Admin → aba **Configurações do Portal**, desligue um toggle (ex.: *Banner de
   campanha* ou *Verificação por SMS*).
3. Volte ao Portal, recarregue e refaça o fluxo: a etapa/recurso correspondente
   aparece ou some. Cada mudança vira um **evento CONFIG** no *Log de eventos*.

### Roteiro rápido
- **SMS on/off:** liga a etapa do código de 4 dígitos no login.
- **Limite de 2 dispositivos:** faça login com o mesmo CPF em 3 "dispositivos" — o 3º é barrado.
- **Lista negra:** em Admin → Usuários, clique **Bloquear**; tente logar com aquele CPF no Portal → acesso negado.
- **Banner / Avisos / NPS / Reconexão:** ligam/desligam as seções pós-conexão.
- **Termo LGPD em áudio:** botão "Ouvir o termo" usa a síntese de voz do navegador.

## Estrutura

```
app/
├─ index.html        Launcher (Portal / Admin)
├─ portal.html       Portal do visitante (fluxo de login)
├─ admin.html        Painel administrativo (9 abas)
├─ css/styles.css    Tema clínico, acessível e responsivo
└─ js/
   ├─ store.js       Estado compartilhado (localStorage + sync entre abas)
   ├─ portal.js      Lógica do portal
   └─ admin.js       Lógica do admin
```

## Recursos implementados

**Portal:** termo LGPD (com áudio/TTS), login por CPF, verificação SMS (4 dígitos),
login Google (mock), limite de dispositivos, bloqueio por lista negra, banner de
campanha, avisos do hospital, pesquisa NPS, aviso de reconexão 30 dias.

**Admin:** dashboard com alertas automáticos, **Configurações do Portal** (8 toggles ao
vivo), usuários & dispositivos (com botão Bloquear), lista negra (MAC/CPF), filtro de
conteúdo por categoria, agendamento de banda, relatório mensal (export CSV), Segurança &
LGPD (2FA, anonimização, auditoria da auditoria), log de eventos com destaque para CONFIG.

## Observações

- **Sem back-end e sem dados reais** — é uma maquete de UX para homologação e validação
  do fluxo. Nenhuma credencial real deve ser usada aqui.
- Para zerar os dados da demo: no console do navegador, `localStorage.clear()` e recarregue.

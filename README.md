# Hostspost — Portal Cativo de Wi-Fi Hospitalar

**Hostspost** é uma solução de portal cativo (captive portal) de Wi-Fi para visitantes,
pacientes e acompanhantes em ambiente hospitalar, com autenticação por CPF, verificação
por SMS, login social, controle de banda, filtro de conteúdo e conformidade com **LGPD**
e **Marco Civil da Internet**.

Este repositório contém:

- **[`app/`](app/)** — a maquete front-end da **Versão 2**: portal do visitante + painel
  administrativo (demo funcional em HTML/CSS/JS).
- **[`backend/`](backend/)** — o **serviço de integração** portal ↔ FreeRADIUS (SMS,
  login, lista negra, limite de dispositivos), em Node, testável e com adaptador MySQL.
- **[`docs/`](docs/)** — a **documentação técnica de implantação em produção**.
- **[`lab/`](lab/)** — o **kit de homologação** para validar as configs.

Infraestrutura de referência:

- **MikroTik (RouterOS)** — gateway de rede e servidor de *hotspot*.
- **FreeRADIUS** — servidor AAA (autenticação, autorização e *accounting*).

## App — Versão 2 (demo)

Portal do visitante e painel admin com estado compartilhado (os toggles do Admin
refletem no Portal em tempo real). Veja [`app/README.md`](app/README.md).

```bash
cd app && python3 -m http.server 8080   # abra http://localhost:8080
```

## Documentação

Comece por [`docs/README.md`](docs/README.md) — índice, arquitetura e fluxo de
autenticação.

| # | Documento | Assunto |
|---|-----------|---------|
| — | [docs/README.md](docs/README.md) | Índice, arquitetura e fluxo de login |
| 01 | [docs/01-arquitetura.md](docs/01-arquitetura.md) | Componentes, topologia, portas, requisitos |
| 02 | [docs/02-mikrotik-hotspot.md](docs/02-mikrotik-hotspot.md) | RouterOS: hotspot, walled garden, perfis, rate-limit |
| 03 | [docs/03-freeradius.md](docs/03-freeradius.md) | FreeRADIUS: instalação, SQL, clients, testes |
| 04 | [docs/04-integracao-portal.md](docs/04-integracao-portal.md) | Portal externo ↔ RADIUS (SMS, Google, reconexão) |
| 05 | [docs/05-recursos-v2-para-infra.md](docs/05-recursos-v2-para-infra.md) | Mapa recurso → infraestrutura |
| 06 | [docs/06-seguranca-lgpd.md](docs/06-seguranca-lgpd.md) | Segurança, LGPD e Marco Civil |
| 07 | [docs/07-checklist-implantacao.md](docs/07-checklist-implantacao.md) | Checklist de go-live, testes e rollback |

## Lab de homologação

O diretório [`lab/`](lab/) traz um ambiente reprodutível para **validar as configs antes
da produção**, em dois níveis:

- **Nível 1 (só Docker):** FreeRADIUS + MariaDB + testes com `radclient` que simulam o
  MikroTik. Valida login, blacklist e limite de dispositivos por CPF sem hardware.
  `cd lab && make up && make test`
- **Nível 2 (com virtualização):** script RouterOS pronto
  ([`lab/mikrotik-chr/hostspost-lab.rsc`](lab/mikrotik-chr/hostspost-lab.rsc)) para um
  MikroTik CHR, validando o captive portal ponta a ponta.

Detalhes em [`lab/README.md`](lab/README.md).

## Convenções

- Idioma: **português (PT-BR)**.
- Placeholders em **MAIÚSCULAS** (ex.: `PORTAL_FQDN`, `RADIUS_SECRET`, `10.0.0.0/24`) —
  substitua pelos valores reais do seu ambiente.
- Blocos de configuração são **exemplos de referência**: valide-os em homologação antes
  de aplicar em produção.

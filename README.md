# Hostspost — Portal Cativo de Wi-Fi Hospitalar

**Hostspost** é uma solução de portal cativo (captive portal) de Wi-Fi para visitantes,
pacientes e acompanhantes em ambiente hospitalar, com autenticação por CPF, verificação
por SMS, login social, controle de banda, filtro de conteúdo e conformidade com **LGPD**
e **Marco Civil da Internet**.

Este repositório contém a **documentação técnica de implantação em produção** usando:

- **MikroTik (RouterOS)** — gateway de rede e servidor de *hotspot*.
- **FreeRADIUS** — servidor AAA (autenticação, autorização e *accounting*).

> **Escopo deste repositório:** apenas a documentação de infraestrutura/implantação.
> O código do portal e do painel administrativo (front-end/back-end) **não** faz parte
> desta entrega — a documentação descreve a camada de rede e AAA que sustenta esses
> recursos.

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

## Convenções

- Idioma: **português (PT-BR)**.
- Placeholders em **MAIÚSCULAS** (ex.: `PORTAL_FQDN`, `RADIUS_SECRET`, `10.0.0.0/24`) —
  substitua pelos valores reais do seu ambiente.
- Blocos de configuração são **exemplos de referência**: valide-os em homologação antes
  de aplicar em produção.

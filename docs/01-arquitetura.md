# 01 — Arquitetura

Este documento descreve a topologia de rede, os componentes, as portas e os requisitos de
hardware para a implantação do Hostspost em um ambiente hospitalar.

## 1.1 Componentes e responsabilidades

| Componente | Responsabilidade | Onde roda |
|-----------|------------------|-----------|
| **Access Points (APs)** | Cobertura Wi-Fi (SSID de visitantes) | Infra física |
| **MikroTik RouterOS** | Gateway, servidor de *hotspot*, walled garden, NAT, firewall, filtro de conteúdo, rate-limit | Roteador MikroTik (CCR/RB) ou CHR (VM) |
| **FreeRADIUS** | AAA — autenticação (Access-Request), autorização (atributos de retorno) e *accounting* | VM Linux (Debian/Ubuntu) |
| **MySQL/MariaDB** | Persistência de credenciais (`radcheck`), grupos (`radusergroup`) e sessões (`radacct`) | VM Linux (mesma ou dedicada) |
| **Portal externo (Hostspost)** | UI de login por CPF, SMS, Google; termos LGPD; NPS; avisos; painel admin | Servidor de aplicação HTTPS |
| **Gateway SMS** | Envio do código de verificação de 4 dígitos | Serviço externo (SaaS) |

> O **portal e o painel admin não fazem parte deste repositório**. Esta documentação
> cobre a rede (MikroTik) e o AAA (FreeRADIUS) que dão suporte a eles.

## 1.2 Topologia de rede

Recomenda-se **segmentar** a rede de visitantes do restante do hospital por VLAN,
isolando totalmente o tráfego de convidados da rede administrativa/clínica.

```
                       Internet (WAN)
                            |
                     [ Firewall/Borda ]
                            |
                   +--------+--------+
                   |  MikroTik RouterOS |
                   |  - Hotspot server  |
                   |  - NAT / Firewall  |
                   |  - Walled garden   |
                   |  - Filtro conteúdo |
                   +--------+--------+
                            |
            VLAN 20 (Visitantes)   VLAN 10 (Administrativa)  <-- ISOLADAS
             10.20.0.0/22               (fora de escopo)
                    |
              [ APs / Switches ]
                    |
          Dispositivos dos visitantes
                    |
   (redirecionados p/ Portal Externo via walled garden)
                            |
                   [ FreeRADIUS + DB ]
                   (rede de serviços)
```

**Princípios:**

- SSID de visitantes em **VLAN dedicada** (ex.: VLAN 20, sub-rede `10.20.0.0/22`).
- **Client isolation** nos APs (dispositivos não se enxergam entre si).
- FreeRADIUS e banco em rede de serviços, acessíveis pelo MikroTik apenas nas portas AAA.
- Portal externo acessível por HTTPS a partir da rede de visitantes (via walled garden).

## 1.3 Portas e protocolos

| Origem | Destino | Porta | Protocolo | Uso |
|--------|---------|-------|-----------|-----|
| MikroTik | FreeRADIUS | 1812/UDP | RADIUS | Autenticação |
| MikroTik | FreeRADIUS | 1813/UDP | RADIUS | Accounting |
| FreeRADIUS | MikroTik | 3799/UDP | RADIUS CoA/Disconnect (RFC 5176) | Mudança de banda / derrubar sessão |
| Visitante | MikroTik | 64872/TCP | HTTP hotspot (login) | Portal cativo (padrão RouterOS) |
| Visitante | Portal externo | 443/TCP | HTTPS | UI de login/termos/NPS |
| FreeRADIUS | MySQL/MariaDB | 3306/TCP | MySQL | Backend SQL |
| Portal externo | MySQL/MariaDB | 3306/TCP | MySQL | Grava/atualiza `radcheck` |
| Portal externo | Gateway SMS | 443/TCP | HTTPS | Envio de código |

> **Recomendado:** proteger o transporte RADIUS com **RADSEC (TLS, 2083/TCP)** quando o
> FreeRADIUS não estiver na mesma rede confiável do MikroTik. Ver
> [06-seguranca-lgpd.md](06-seguranca-lgpd.md).

## 1.4 Requisitos mínimos (referência)

Dimensione conforme o número de **dispositivos simultâneos** (não de usuários).

| Recurso | Pequeno (≤300 disp.) | Médio (≤1.500 disp.) | Grande (≤5.000 disp.) |
|---------|----------------------|----------------------|-----------------------|
| MikroTik | RB5009 / hAP ax² | CCR2004 | CCR2116 / CHR (VM 4 vCPU) |
| FreeRADIUS (VM) | 2 vCPU / 4 GB | 4 vCPU / 8 GB | 8 vCPU / 16 GB |
| Banco (VM) | 2 vCPU / 4 GB | 4 vCPU / 8 GB (disco rápido) | dedicado, 8 vCPU / 16 GB, SSD |
| Link de internet | conforme política de banda por perfil (ver [05](05-recursos-v2-para-infra.md)) |||

**Sistema operacional (FreeRADIUS/DB):** Debian 12 ou Ubuntu 22.04 LTS.
**RouterOS:** versão estável recente (7.x).

## 1.5 Alta disponibilidade (opcional)

- **FreeRADIUS:** dois servidores; no MikroTik, cadastrar dois RADIUS clients com
  prioridade — o segundo assume se o primeiro não responder.
- **Banco:** replicação MySQL/MariaDB (primário/réplica) ou cluster Galera.
- **MikroTik:** VRRP entre dois roteadores para o gateway das VLANs.

Prossiga para [02-mikrotik-hotspot.md](02-mikrotik-hotspot.md).

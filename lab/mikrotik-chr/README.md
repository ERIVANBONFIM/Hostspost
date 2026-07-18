# Nível 2 — MikroTik CHR (config pronta para importar)

Este diretório traz o script [`hostspost-lab.rsc`](hostspost-lab.rsc): a configuração de
LAB do RouterOS que transforma um **CHR** no gateway/hotspot do Hostspost, apontando para
o FreeRADIUS do [Nível 1](../README.md).

## 1. Obter e subir o CHR

- Baixe a imagem **Cloud Hosted Router (CHR)** em <https://mikrotik.com/download>
  (VMDK/OVA/IMG conforme seu hipervisor: VirtualBox, VMware, Proxmox/KVM).
- Crie a VM com **duas interfaces**:
  - `ether1` → **WAN** (NAT/bridge com internet),
  - `ether2` → **LAN de visitantes** (rede isolada, onde ficará o cliente de teste).
- A licença gratuita do CHR é suficiente para homologação.

## 2. Ajustar os valores do script

Abra [`hostspost-lab.rsc`](hostspost-lab.rsc) e edite o cabeçalho:

| O quê | Onde | Trocar por |
|-------|------|-----------|
| IP do RADIUS | `/radius ... address=192.168.88.10` | IP do **host onde roda o Docker** do lab |
| FQDN do portal | `dst-host=portal.hostspost.local` (walled-garden e profile) | FQDN real do seu portal |
| Interface LAN | `interface=ether2` | interface da LAN de visitantes |
| Interface WAN | `member ... interface=ether1` | sua interface de internet |
| Segredo | `secret=testing123` | igual ao [`../freeradius/clients.conf`](../freeradius/clients.conf) |

> Garanta que o IP do host Docker esteja dentro da faixa liberada no
> `client mikrotik-chr` do `clients.conf` (padrão `192.168.88.0/24`) — ou ajuste lá.

## 3. Importar

Envie o arquivo para o CHR (Winbox → Files, arraste; ou FTP/SCP) e rode no terminal:

```routeros
/import file-name=hostspost-lab.rsc
```

Confira sem erros com:
```routeros
/ip hotspot print
/radius print
/ip hotspot walled-garden print
```

## 4. Validar (ponta a ponta)

Conecte um cliente (VM ou celular) na LAN de visitantes e teste, conforme
[`../../docs/07-checklist-implantacao.md`](../../docs/07-checklist-implantacao.md):

| Teste | Como | Esperado |
|-------|------|----------|
| **T9** Walled garden | Antes de logar, abrir o portal e o Google | Abrem; demais sites redirecionam ao portal |
| **T1** Login | Autenticar com `12345678900` / `senha-teste` | Acesso liberado; sessão em `radacct` |
| **T4** Limite 2 disp. | 3º dispositivo com o mesmo CPF | 3ª sessão negada |
| **T3** Reconexão | Reconectar o mesmo device | Entra sem passar pelo portal (mac-cookie) |
| **T5/T6** Banda | Medir velocidade / trocar perfil | Rate-limit aplicado |

## 5. CoA / Disconnect (blacklist e banda em tempo real)

Do host do lab, derrube uma sessão ativa via FreeRADIUS:
```bash
docker compose exec -T freeradius \
  sh -c 'echo "User-Name=12345678900" | radclient -x IP_DO_CHR:3799 disconnect testing123'
```
E mude a banda de uma sessão ativa (CoA):
```bash
docker compose exec -T freeradius \
  sh -c 'printf "User-Name=12345678900,Mikrotik-Rate-Limit=2M/4M\n" | radclient -x IP_DO_CHR:3799 coa testing123'
```

## Observações

- O `.rsc` usa valores de LAB (secret `testing123`, faixas `10.20.0.0/22`). Em produção,
  siga [`../../docs/02-mikrotik-hotspot.md`](../../docs/02-mikrotik-hotspot.md) com
  segredos fortes e a topologia real.
- O CHR precisa **alcançar o IP do host Docker** nas portas UDP 1812/1813; e o host
  precisa alcançar o CHR na 3799 para CoA/Disconnect.

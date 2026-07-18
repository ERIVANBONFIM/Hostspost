# 02 — MikroTik / Hotspot (RouterOS)

Configuração do MikroTik como gateway e servidor de *hotspot*, integrado ao FreeRADIUS.
Os comandos são para **RouterOS 7.x** (terminal / Winbox → New Terminal).

> Substitua os placeholders: `RADIUS_IP`, `RADIUS_SECRET`, `PORTAL_FQDN`,
> `VISITANTES_IFACE`, sub-redes etc. Aplique primeiro em **homologação**.

## 2.1 Interface e endereçamento da VLAN de visitantes

```routeros
# Interface/bridge da rede de visitantes (ajuste ao seu cenário de VLAN)
/interface bridge add name=bridge-visitantes
/interface bridge port add bridge=bridge-visitantes interface=VISITANTES_IFACE

/ip address add address=10.20.0.1/22 interface=bridge-visitantes comment="Gateway visitantes"

# Pool e DHCP para a VLAN de visitantes
/ip pool add name=pool-visitantes ranges=10.20.0.10-10.20.3.254
/ip dhcp-server add name=dhcp-visitantes interface=bridge-visitantes address-pool=pool-visitantes lease-time=1h disabled=no
/ip dhcp-server network add address=10.20.0.0/22 gateway=10.20.0.1 dns-server=10.20.0.1
```

## 2.2 Cliente RADIUS (aponta para o FreeRADIUS)

```routeros
/radius add service=hotspot address=RADIUS_IP secret=RADIUS_SECRET \
    timeout=3s comment="FreeRADIUS Hostspost"

# Habilita CoA/Disconnect de entrada (para mudar banda ou derrubar sessão)
/radius incoming set accept=yes port=3799
```

> O `secret` **deve ser idêntico** ao definido em `clients.conf` do FreeRADIUS
> (ver [03-freeradius.md](03-freeradius.md)).

## 2.3 Perfil do Hotspot (usa RADIUS + reconexão por MAC)

```routeros
/ip hotspot profile add name=hsprof-visitantes \
    hotspot-address=10.20.0.1 \
    dns-name=PORTAL_FQDN \
    html-directory=hotspot \
    login-by=mac-cookie,http-chap,http-pap \
    mac-cookie-timeout=30d \
    use-radius=yes \
    radius-accounting=yes \
    radius-interim-update=5m \
    nas-port-type=wireless-802.11
```

**Destaques:**

- `login-by=mac-cookie,...` + `mac-cookie-timeout=30d` → **reconexão automática por 30
  dias**: o dispositivo já reconhecido não precisa passar pelo portal novamente.
- `use-radius=yes` → autenticação delegada ao FreeRADIUS.
- `radius-accounting=yes` + `radius-interim-update=5m` → alimenta `radacct` (base de
  relatórios e alertas).

## 2.4 Servidor de Hotspot

```routeros
/ip hotspot add name=hs-visitantes interface=bridge-visitantes \
    address-pool=pool-visitantes profile=hsprof-visitantes disabled=no
```

## 2.5 Walled Garden (liberar o necessário ANTES do login)

O walled garden permite acesso a destinos essenciais **sem autenticação**: o próprio
portal externo, o gateway de SMS, o Google (login social) e CDNs de assets.

```routeros
# Portal externo (HTTP + HTTPS)
/ip hotspot walled-garden add dst-host=PORTAL_FQDN comment="Portal Hostspost"
/ip hotspot walled-garden ip add dst-host=PORTAL_FQDN action=accept

# Login social Google (OAuth)
/ip hotspot walled-garden add dst-host=*.google.com comment="Google OAuth"
/ip hotspot walled-garden add dst-host=*.googleapis.com
/ip hotspot walled-garden add dst-host=*.gstatic.com
/ip hotspot walled-garden add dst-host=accounts.google.com

# Gateway de SMS (ajuste ao provedor contratado)
/ip hotspot walled-garden add dst-host=*.SEU_PROVEDOR_SMS.com comment="Gateway SMS"

# CDNs de fontes/assets do portal (exemplos comuns)
/ip hotspot walled-garden add dst-host=fonts.googleapis.com
/ip hotspot walled-garden add dst-host=cdn.jsdelivr.net
```

> **Boa prática:** use HTTPS no portal e libere por `dst-host` (FQDN). Mantenha a lista
> mínima — cada domínio liberado é acessível sem login. Toggles do painel que ativam
> banners/campanhas com mídia externa podem exigir novos domínios aqui.

## 2.6 Perfis de usuário e limitação de banda

Perfis definem a banda padrão. Também é possível (e recomendado) enviar o rate-limit
**pelo RADIUS** via atributo `Mikrotik-Rate-Limit` (ver [05](05-recursos-v2-para-infra.md)).

```routeros
# Perfis locais (fallback / padrão)
/ip hotspot user profile add name=perfil-padrao   rate-limit="5M/10M"   shared-users=2
/ip hotspot user profile add name=perfil-reduzido rate-limit="2M/4M"    shared-users=2
/ip hotspot user profile add name=perfil-vip      rate-limit="20M/50M"  shared-users=2
```

- `rate-limit="rx/tx"` → upload/download (ex.: `5M/10M` = 5 Mbps up, 10 Mbps down).
- `shared-users=2` → coerente com o **limite de 2 dispositivos por CPF** (reforçado no
  RADIUS por `Simultaneous-Use`, ver [05](05-recursos-v2-para-infra.md)).

## 2.7 Filtro de conteúdo (visão MikroTik)

Bloqueio por categoria (adulto, torrent, apostas, malware) pode ser feito no MikroTik.
Detalhes e abordagem alternativa (DNS externo com categorias) em
[05-recursos-v2-para-infra.md](05-recursos-v2-para-infra.md). Base no MikroTik:

```routeros
# Forçar o DNS dos clientes para o resolvedor do gateway (evita bypass)
/ip firewall nat add chain=dstnat in-interface=bridge-visitantes protocol=udp dst-port=53 \
    action=redirect to-ports=53 comment="Forcar DNS visitantes"
/ip firewall nat add chain=dstnat in-interface=bridge-visitantes protocol=tcp dst-port=53 \
    action=redirect to-ports=53

# Address-list de destinos bloqueados por categoria (populada por script/importação)
/ip firewall filter add chain=forward in-interface=bridge-visitantes \
    dst-address-list=bloqueio-conteudo action=drop comment="Filtro de conteudo"
```

## 2.8 Blacklist (bloqueio de dispositivos)

Além do `Auth-Type := Reject` no RADIUS (ver [05](05-recursos-v2-para-infra.md)), pode-se
dropar no firewall por MAC:

```routeros
/ip firewall filter add chain=forward src-mac-address=AA:BB:CC:DD:EE:FF action=drop \
    comment="Blacklist dispositivo"
```

Prossiga para [03-freeradius.md](03-freeradius.md).

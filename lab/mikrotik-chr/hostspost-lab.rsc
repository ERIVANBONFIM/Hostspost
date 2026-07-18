# =============================================================================
#  Hostspost — Configuração de LAB do MikroTik CHR (Nível 2)
#  Importe com:  /import file-name=hostspost-lab.rsc
#  RouterOS 7.x. Valores de LAB — NÃO usar em produção.
# =============================================================================
#
#  >>> EDITE ESTES VALORES ANTES DE IMPORTAR <<<
#    1) RADIUS: address=192.168.88.10  -> IP do HOST onde roda o Docker do lab
#    2) walled-garden dst-host=portal.hostspost.local -> FQDN do seu portal
#    3) ether2 -> interface da LAN de visitantes do seu CHR
#    4) secret=testing123 -> deve ser IGUAL ao lab/freeradius/clients.conf
#
#  Testes cobertos aqui: doc 07 -> T3 (mac-cookie), T5/T6 (banda), T9 (walled garden).
# =============================================================================

# --- 1) Rede de visitantes (bridge + IP + DHCP) ------------------------------
/interface bridge
add name=bridge-visitantes comment="LAN visitantes (lab)"
/interface bridge port
add bridge=bridge-visitantes interface=ether2

/ip address
add address=10.20.0.1/22 interface=bridge-visitantes comment="Gateway visitantes"

/ip pool
add name=pool-visitantes ranges=10.20.0.10-10.20.3.254

/ip dhcp-server
add name=dhcp-visitantes interface=bridge-visitantes address-pool=pool-visitantes \
    lease-time=1h disabled=no
/ip dhcp-server network
add address=10.20.0.0/22 gateway=10.20.0.1 dns-server=10.20.0.1

# --- 2) Cliente RADIUS (aponta para o FreeRADIUS do lab) ---------------------
/radius
add service=hotspot address=192.168.88.10 secret=testing123 timeout=3s \
    comment="FreeRADIUS lab Hostspost"
# Aceita CoA/Disconnect vindo do FreeRADIUS (mudar banda / derrubar sessao)
/radius incoming
set accept=yes port=3799

# --- 3) Perfis de usuario (fallback local) -----------------------------------
/ip hotspot user profile
add name=perfil-padrao   rate-limit=5M/10M  shared-users=2
add name=perfil-reduzido rate-limit=2M/4M   shared-users=2

# --- 4) Perfil do Hotspot (RADIUS + reconexao 30 dias por mac-cookie) --------
/ip hotspot profile
add name=hsprof-visitantes hotspot-address=10.20.0.1 dns-name=portal.hostspost.local \
    login-by=mac-cookie,http-chap,http-pap mac-cookie-timeout=30d \
    use-radius=yes radius-accounting=yes radius-interim-update=5m \
    nas-port-type=wireless-802.11

# --- 5) Servidor de Hotspot --------------------------------------------------
/ip hotspot
add name=hs-visitantes interface=bridge-visitantes address-pool=pool-visitantes \
    profile=hsprof-visitantes disabled=no

# --- 6) Walled Garden (liberar ANTES do login) -------------------------------
/ip hotspot walled-garden
add dst-host=portal.hostspost.local comment="Portal Hostspost"
add dst-host=*.google.com comment="Google OAuth"
add dst-host=accounts.google.com
add dst-host=*.googleapis.com
add dst-host=*.gstatic.com
add dst-host=fonts.googleapis.com
add dst-host=cdn.jsdelivr.net
/ip hotspot walled-garden ip
add dst-host=portal.hostspost.local action=accept comment="Portal (IP layer)"

# --- 7) DNS local (para forcar o filtro de conteudo) -------------------------
/ip dns
set servers=1.1.1.1 allow-remote-requests=yes
# Redireciona o DNS dos visitantes para o gateway (evita bypass do filtro)
/ip firewall nat
add chain=dstnat in-interface=bridge-visitantes protocol=udp dst-port=53 \
    action=redirect to-ports=53 comment="Forcar DNS visitantes (udp)"
add chain=dstnat in-interface=bridge-visitantes protocol=tcp dst-port=53 \
    action=redirect to-ports=53 comment="Forcar DNS visitantes (tcp)"

# --- 8) NAT de saida (visitantes -> internet) --------------------------------
# Marca a interface de WAN (ajuste ether1 para a sua interface de internet)
/interface list
add name=WAN comment="Interfaces de internet"
/interface list member
add list=WAN interface=ether1
/ip firewall nat
add chain=srcnat out-interface-list=WAN action=masquerade comment="NAT visitantes"

:put "[hostspost-lab] Importado. Ajuste WAN/interfaces e o IP do RADIUS conforme seu ambiente."

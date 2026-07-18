# Lab de Homologação — Hostspost

Ambiente para **validar as configurações de MikroTik + FreeRADIUS antes da produção**,
sem tocar na rede do hospital. Organizado em dois níveis.

| Nível | Precisa de | Valida |
|-------|-----------|--------|
| **1** | Apenas Docker | Toda a lógica AAA (auth, limite de dispositivos, blacklist, banda de retorno) usando `radclient` para **simular o MikroTik** |
| **2** | Virtualização (KVM/VMware/VirtualBox) | O captive portal ponta a ponta: walled garden, reconexão `mac-cookie`, enforcement de banda, com **MikroTik CHR** |

> A maioria dos testes de aceite do [`docs/07`](../docs/07-checklist-implantacao.md) roda
> no **Nível 1**, num notebook. O Nível 2 só é necessário para o que é específico do
> MikroTik.

---

## Nível 1 — Docker (FreeRADIUS + MariaDB)

### Pré-requisitos
- Docker e Docker Compose.
- Portas UDP livres no host: 1812, 1813 (e 3799 para o Nível 2).

### Subir o ambiente
```bash
cd lab
docker compose up -d
# acompanhe o FreeRADIUS (modo debug -X) se quiser:
docker compose logs -f freeradius
```

O MariaDB carrega automaticamente o schema e os cenários de teste
(`mariadb/init/01-schema.sql` e `02-seed.sql`) na primeira subida.

### Rodar os testes de aceite
```bash
bash tests/run-acceptance.sh
```

Saída esperada (resumo):
```
=== T1 — Login com credencial válida ... ✅ PASS
=== T8 — Usuário na blacklist ...        ✅ PASS
=== T4 — Limite de 2 dispositivos ...    ✅ PASS
  Resultado: 3 PASS / 0 FAIL
```

### Cenários semeados (`02-seed.sql`)
| Usuário | Situação | Resultado esperado |
|---------|----------|--------------------|
| `12345678900` | Válido, grupo `visitantes`, senha `senha-teste` | Accept + `Mikrotik-Rate-Limit=5M/10M` |
| `99999999999` | Blacklist (`Auth-Type := Reject`) | Reject |
| `AA-BB-CC-DD-EE-FF` | Auto-login por MAC | Accept (usado no Nível 2) |

Grupo `visitantes`: `Simultaneous-Use := 2` → 3º dispositivo do mesmo CPF é rejeitado.

### Teste manual com radclient
```bash
docker compose exec -T freeradius \
  radclient -x 127.0.0.1:1812 auth testing123 < tests/packets/auth-valid.txt
```

### Derrubar / limpar
```bash
docker compose down          # para os containers
docker compose down -v       # também apaga o volume do banco (reseta os dados)
```

---

## Nível 2 — MikroTik CHR (ponta a ponta)

O **CHR (Cloud Hosted Router)** é a imagem virtual do RouterOS. Rode-o num
hipervisor (VirtualBox, VMware, Proxmox/KVM). Obtenha a imagem em
<https://mikrotik.com/download> (seção Cloud Hosted Router). A licença gratuita basta
para homologação.

> **Config pronta para importar:** use [`mikrotik-chr/hostspost-lab.rsc`](mikrotik-chr/hostspost-lab.rsc)
> e siga o passo a passo em [`mikrotik-chr/README.md`](mikrotik-chr/README.md). Os passos
> abaixo resumem o mesmo processo.

### Passos
1. **Suba o Nível 1** e anote o IP do host Docker (ex.: `192.168.88.10`).
2. **Importe o CHR** no hipervisor, com duas interfaces:
   - WAN (NAT/bridge com internet),
   - LAN de visitantes (rede isolada onde ficará um cliente de teste).
3. **Aplique a config** dos documentos, ajustando o `RADIUS_IP` para o host do Docker:
   - VLAN/DHCP e hotspot: [`docs/02-mikrotik-hotspot.md`](../docs/02-mikrotik-hotspot.md)
   - Cliente RADIUS apontando para o lab:
     ```routeros
     /radius add service=hotspot address=IP_DO_HOST_DOCKER secret=testing123
     /radius incoming set accept=yes port=3799
     ```
   - Walled garden liberando o portal e provedores.
4. **Conecte um cliente** (VM ou celular) na LAN de visitantes e abra o navegador →
   deve cair no portal.
5. **Valide** os testes que dependem do MikroTik:
   - **T3** reconexão por `mac-cookie` (reconectar sem novo login),
   - **T5/T6** enforcement de banda / agendamento,
   - **T9** walled garden (portal abre, demais sites redirecionam).

### CoA/Disconnect (blacklist e mudança de banda em tempo real)
Com o CHR ativo, teste a derrubada de sessão a partir do lab:
```bash
docker compose exec -T freeradius \
  sh -c 'echo "User-Name=12345678900" | radclient -x IP_DO_CHR:3799 disconnect testing123'
```

---

## Observações

- **Segredo `testing123` e senhas são de LAB.** Nunca use em produção.
- Se o `docker pull` falhar por rede restrita, baixe as imagens
  (`mariadb:11`, `freeradius/freeradius-server:3.2.5`) num ambiente com acesso e
  transfira, ou ajuste as tags no [`docker-compose.yml`](docker-compose.yml).
- O FreeRADIUS sobe em **modo debug (`-X`)** para facilitar o diagnóstico; a saída
  detalhada aparece em `docker compose logs freeradius`.
- Detalhes de cada mecanismo e a matriz recurso→infra estão em
  [`docs/05-recursos-v2-para-infra.md`](../docs/05-recursos-v2-para-infra.md).

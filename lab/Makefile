# Atalhos do LAB de homologação Hostspost (Nível 1).
# Uso: make up | make test | make logs | make down | make reset

.PHONY: up test logs ps down reset

up:              ## Sobe FreeRADIUS + MariaDB em background
	docker compose up -d

test:            ## Roda os testes de aceite (radclient)
	bash tests/run-acceptance.sh

logs:            ## Acompanha o log do FreeRADIUS (modo -X)
	docker compose logs -f freeradius

ps:              ## Estado dos containers
	docker compose ps

down:            ## Para os containers (mantém o banco)
	docker compose down

reset:           ## Para tudo e apaga o volume do banco (reseta dados)
	docker compose down -v

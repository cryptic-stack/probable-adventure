APP_NAME=probable-adventure

.PHONY: dev up down logs build run-api run-provisioner migrate-up migrate-down sqlc

dev: up

up:
	docker compose up -d --build

down:
	docker compose down -v

logs:
	docker compose logs -f

build:
	go build ./...

run-api:
	go run ./cmd/api

run-provisioner:
	go run ./cmd/provisioner

migrate-up:
	docker compose run --rm migrate -path /migrations -database $$DATABASE_URL up

migrate-down:
	docker compose run --rm migrate -path /migrations -database $$DATABASE_URL down 1

sqlc:
	sqlc generate -f sqlc/sqlc.yaml

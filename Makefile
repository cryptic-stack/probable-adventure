APP_NAME=probable-adventure

.PHONY: dev up down logs build run-api run-provisioner migrate-up migrate-down sqlc build-range-images load-range-templates

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

build-range-images:
	powershell -ExecutionPolicy Bypass -File scripts/build-range-images.ps1 -DockerHubUser crypticstack

load-range-templates:
	powershell -ExecutionPolicy Bypass -File scripts/load-range-templates.ps1 -ApiBase http://localhost:8080

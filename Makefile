# StreamCaster Development Commands

.PHONY: help dev dev-build dev-up dev-down dev-logs dev-shell prod prod-build prod-up prod-down clean

help: ## Show this help message
	@echo 'Usage: make [command]'
	@echo ''
	@echo 'Available commands:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Development commands
dev: dev-up ## Start development environment with hot reload

dev-build: ## Build development containers
	docker-compose -f docker-compose.dev.yml build

dev-up: ## Start development containers
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Frontend development server: http://localhost:8080"
	@echo "Backend API: http://localhost:3001"
	@echo "RTMP Server: rtmp://localhost:1935/live"

dev-down: ## Stop development containers
	docker-compose -f docker-compose.dev.yml down

dev-logs: ## Show development container logs
	docker-compose -f docker-compose.dev.yml logs -f

dev-shell: ## Open shell in frontend development container
	docker-compose -f docker-compose.dev.yml exec streamcaster-frontend-dev sh

# Production commands
prod: prod-up ## Start production environment

prod-build: ## Build production containers
	docker-compose build

prod-up: ## Start production containers
	docker-compose up -d
	@echo "Frontend: http://localhost:8080"
	@echo "Backend API: http://localhost:3001"
	@echo "RTMP Server: rtmp://localhost:1935/live"

prod-down: ## Stop production containers
	docker-compose down

# Utility commands
clean: ## Clean up containers, volumes, and build cache
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose down -v
	docker system prune -f

restart-frontend: ## Restart only frontend container (development)
	docker-compose -f docker-compose.dev.yml restart streamcaster-frontend-dev

logs-frontend: ## Show only frontend logs (development)
	docker-compose -f docker-compose.dev.yml logs -f streamcaster-frontend-dev

logs-backend: ## Show only backend logs (development)
	docker-compose -f docker-compose.dev.yml logs -f streamcaster-backend
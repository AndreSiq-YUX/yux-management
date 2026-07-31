# Quick Start - Portal YUX

Este projeto usa uma stack self-hosted na VPS: React/Vite no frontend, backend
Fastify/TypeScript, Postgres proprio, Redis, workers e Agent Harness via
Dokploy.

## Requisitos

- Node.js 22 para o backend.
- Node.js 18+ para o frontend.
- Variavel `VITE_API_BASE_URL=/api` no frontend quando necessario.
- Docker, quando for validar `docker-compose.dokploy.yml` localmente.

## Rodar Localmente

```powershell
cd frontend
npm install
npm run dev
```

Backend:

```powershell
cd backend
npm install
npm run dev
```

URL local:

```text
http://localhost:3000
```

## Validar Antes De Continuar Desenvolvimento

```powershell
cd frontend
npm run type-check
npm run build
```

Ambos os comandos devem passar antes de novas funcionalidades.

Para validar a base nova completa:

```powershell
.\scripts\run-release-checks.ps1 -SkipInstall
```

## Deploy

O guia operacional atual e `DEPLOY-DOKPLOY-VPS.md`. O deploy de producao
usa `docker-compose.dokploy.yml` no Dokploy, com:

- `yux-frontend` para o bundle React servido por Nginx;
- `yux-backend-api` para a API Fastify;
- `yux-backend-worker` para jobs assicronos;
- `yux-postgres` como banco de producao;
- `yux-redis` para filas/cache operacional;
- `yux-agent-harness-runtime` para a API Python/FastAPI dos agentes;

## Banco De Dados

As migrations de producao ficam em `backend/src/db/migrations` e devem ser
aplicadas no Postgres da VPS com `npm run migrate:prod` dentro do container
`yux-backend-api`.

## Observacoes

- A camada padrao de dados usa rotas `/api/*` do backend.
- Supabase e Vercel nao fazem parte do runtime de producao atual.
- Nao adicionar novas funcionalidades antes de manter `type-check` e `build`
  passando.

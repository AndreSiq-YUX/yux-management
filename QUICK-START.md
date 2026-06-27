# Quick Start - Portal YUX

Este projeto esta estabilizado em torno de React/Vite no frontend, Supabase
como backend gerenciado e VPS/Dokploy para deploy do frontend e do runtime de
agentes. O backend Node/Prisma antigo foi removido e nao deve ser usado para
subir o app atual.

## Requisitos

- Node.js 18+.
- Projeto Supabase ativo.
- Variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configuradas
  em `frontend/.env`.
- Docker, quando for validar `docker-compose.dokploy.yml` localmente.

## Rodar Localmente

```powershell
cd frontend
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

## Deploy

O guia operacional atual e `DEPLOY-DOKPLOY-SUPABASE.md`. O deploy de producao
usa `docker-compose.dokploy.yml` no Dokploy, com:

- `yux-frontend` para o bundle React servido por Nginx;
- `yux-agent-harness-runtime` para a API Python/FastAPI dos agentes;
- Supabase Cloud para Auth, Postgres, RLS e Edge Functions.

## Banco De Dados

As migrations ficam em `supabase/migrations`.

A migration de estabilizacao atual e:

```text
supabase/migrations/20260529000000_stabilize_core_schema.sql
```

O seed local fica em:

```text
supabase/seed.sql
```

## Observacoes

- `apiService` e legado temporario para pontos ainda nao migrados ou que
  dependam de uma API futura.
- A camada padrao de dados do app e `supabaseService`.
- Nao adicionar novas funcionalidades antes de manter `type-check` e `build`
  passando.

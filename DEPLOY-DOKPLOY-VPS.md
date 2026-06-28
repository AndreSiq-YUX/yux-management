# Deploy VPS com Dokploy e Postgres proprio - Portal YUX

Atualizado em 2026-06-28.

Este guia substitui o fluxo antigo com Vercel e Supabase. O Portal YUX deve
rodar integralmente na VPS propria via Dokploy: frontend, backend, Postgres,
Redis, worker e runtime de agentes.

Branch recomendada para producao: `deploy/vps`.

## 1. Arquitetura Final

```text
Usuario
  -> https://hub.yux.com.br
  -> yux-frontend (Nginx + React/Vite)
  -> /api/*
  -> yux-backend-api (Fastify/TypeScript)
  -> yux-postgres (Postgres 17)
  -> yux-redis (BullMQ/cache operacional)
  -> yux-backend-worker
  -> yux-agent-harness-runtime (Python/FastAPI)
```

Dominios oficiais:

- `yux.com.br`: site institucional.
- `hub.yux.com.br`: sistema YUX Hub e proxy `/api`.
- `agents.yux.com.br`: runtime de agentes, opcionalmente exposto.
- `deploy.yux.com.br`: painel Dokploy, se esse dominio for usado na VPS.

## 2. Antes De Abrir O Dokploy

1. Confirme que a VPS esta acessivel via SSH.
2. Confirme que o Dokploy ja esta instalado e acessivel pelo navegador.
3. No DNS do dominio, crie ou valide:
   - `A hub.yux.com.br -> IP_DA_VPS`
   - `A agents.yux.com.br -> IP_DA_VPS`, se for expor o runtime.
   - `A deploy.yux.com.br -> IP_DA_VPS`, se o painel usar esse dominio.
4. Aguarde propagacao basica do DNS.
5. Confirme que o repositorio GitHub esta acessivel pelo Dokploy:
   - Repositorio: `AndreSiq-YUX/yux-management`
   - Branch: `deploy/vps`
   - Compose: `docker-compose.dokploy.yml`

## 3. Gerar Segredos

Gere os valores antes de preencher o painel. Nao salve estes valores no Git.

No terminal local ou na VPS:

```bash
openssl rand -base64 48
```

Use um valor para `SESSION_SECRET` e outro para `YUX_AGENT_RUNTIME_TOKEN`.

Crie tambem uma senha forte para o Postgres:

```bash
openssl rand -base64 32
```

Use essa senha em `POSTGRES_PASSWORD` e tambem dentro de `DATABASE_URL`.

## 4. Criar Projeto No Dokploy

1. Entre no painel do Dokploy.
2. No menu lateral, clique em `Projects`.
3. Clique em `Create Project` ou `New Project`.
4. Preencha:
   - Name: `yux-portal-prod`
   - Description: `Portal YUX em VPS propria`
5. Clique em `Create` ou `Save`.
6. Abra o projeto `yux-portal-prod`.

## 5. Criar Aplicacao Docker Compose

1. Dentro do projeto `yux-portal-prod`, clique em `Create Service`,
   `New Service` ou `Add Application`.
2. Escolha a opcao `Docker Compose`.
3. Em `Source Provider`, escolha `GitHub` se o GitHub estiver conectado.
   Se nao estiver, escolha `Git` ou `Public Repository`, conforme a tela.
4. Configure:
   - Repository: `https://github.com/AndreSiq-YUX/yux-management.git`
   - Branch: `deploy/vps`
   - Root Directory: vazio, `/` ou `.`
   - Compose Path: `docker-compose.dokploy.yml`
   - Application Name: `yux-portal-stack`
5. Clique em `Create`, `Save` ou `Continue`.

Observacao: use o modo `Docker Compose`. Nao use uma aplicacao simples de
Dockerfile para este deploy, porque o projeto precisa subir varios servicos:
frontend, backend, worker, Postgres, Redis e runtime de agentes.

## 6. Configurar Variaveis Da Aplicacao

1. Abra a aplicacao `yux-portal-stack`.
2. Clique na aba `Environment`, `Variables` ou `Environment Variables`.
3. Clique em `Add Variable`, `Bulk Edit`, `Raw Editor` ou equivalente.
4. Cole o bloco abaixo, trocando os placeholders.
5. Clique em `Save`.

```bash
YUX_FRONTEND_PORT=3000
YUX_BACKEND_PORT=4000
YUX_AGENT_RUNTIME_PORT=8080

POSTGRES_DB=yux_hub
POSTGRES_USER=yux_app
POSTGRES_PASSWORD=<senha-forte-do-postgres>
DATABASE_URL=postgresql://yux_app:<senha-forte-do-postgres>@yux-postgres:5432/yux_hub
REDIS_URL=redis://yux-redis:6379

SESSION_COOKIE_NAME=yux_session
SESSION_SECRET=<64-ou-mais-caracteres-aleatorios>
CORS_ORIGIN=https://hub.yux.com.br

VITE_API_BASE_URL=/api
MATERIALS_STORAGE_DIR=/app/storage/materials
OMNICHANNEL_ATTACHMENTS_DIR=/app/storage/omnichannel-attachments
OMNICHANNEL_ATTACHMENT_MAX_MB=25

YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080
YUX_AGENT_RUNTIME_TOKEN=<token-longo-aleatorio>
OPENROUTER_API_KEY=<valor-se-usar>
JINA_API_KEY=<valor-se-usar>
N8N_CRM_WEBHOOK_URL=
```

Regras importantes:

- Nao use `VITE_` para segredos.
- O frontend deve conhecer apenas `VITE_API_BASE_URL=/api`.
- `DATABASE_URL` deve apontar para o hostname interno `yux-postgres`.
- `REDIS_URL` deve apontar para o hostname interno `yux-redis`.
- As variaveis do Dokploy sao lidas pelo compose via `${VAR}`; este repositorio
  ja referencia cada variavel necessaria em `docker-compose.dokploy.yml`.
- Nao configure Supabase nem Vercel como dependencia de producao.

## 7. Configurar Dominios

### 7.1 Dominio Principal Do Sistema

1. Abra a aplicacao `yux-portal-stack`.
2. Clique na aba `Domains`.
3. Clique em `Add Domain`.
4. Preencha:
   - Domain: `hub.yux.com.br`
   - Service: `yux-frontend`
   - Container Port: `80`
   - Path: `/`, se o campo existir
   - HTTPS/SSL/Certificate: habilitado
5. Clique em `Save`.
6. Se houver botao `Generate Certificate`, `Enable SSL` ou `Let's Encrypt`,
   clique nele depois de salvar.

Nao crie um dominio separado para `yux-backend-api`. O Nginx do frontend ja
encaminha `/api/*` para `http://yux-backend-api:4000/api/*`.

### 7.2 Dominio Opcional Do Runtime De Agentes

Use este dominio somente se quiser expor o runtime fora da rede interna.

1. Na aba `Domains`, clique em `Add Domain`.
2. Preencha:
   - Domain: `agents.yux.com.br`
   - Service: `yux-agent-harness-runtime`
   - Container Port: `8080`
   - Path: `/`, se o campo existir
   - HTTPS/SSL/Certificate: habilitado
3. Clique em `Save`.
4. Habilite ou gere o certificado SSL.

Mesmo com dominio publico, mantenha `YUX_AGENT_RUNTIME_TOKEN` forte.

Depois de criar ou alterar dominios em uma aplicacao Docker Compose, faca um
novo deploy. O Dokploy aplica dominios de Compose via labels do Traefik, entao
o roteamento novo so fica ativo depois do redeploy.

## 8. Primeiro Deploy

1. Na aplicacao `yux-portal-stack`, clique na aba `Deployments`.
2. Clique em `Deploy`, `Redeploy` ou `Deploy Latest Commit`.
3. Aguarde o build dos servicos:
   - `yux-frontend`
   - `yux-backend-api`
   - `yux-backend-worker`
   - `yux-postgres`
   - `yux-redis`
   - `yux-agent-harness-runtime`
4. Abra a aba `Logs`.
5. Verifique se nao ha erro recorrente nos logs.

Se o build falhar:

1. Abra `Deployments`.
2. Clique no deploy com falha.
3. Leia o log do servico que falhou.
4. Corrija a variavel, dominio ou erro de build.
5. Clique em `Redeploy`.

## 9. Aplicar Migrations Do Banco

Depois que `yux-postgres` e `yux-backend-api` estiverem rodando:

1. Abra a aplicacao `yux-portal-stack`.
2. Abra a aba `Terminal`, `Console` ou `Exec`.
3. Selecione o servico/container `yux-backend-api`.
4. Execute:

```bash
npm run migrate:prod
```

Resultado esperado:

- A tabela `schema_migrations` sera criada se ainda nao existir.
- As migrations em `backend/src/db/migrations` serao aplicadas em ordem.
- O terminal deve mostrar linhas como `applied 0001_auth_core`.
- Se nao houver migrations novas, o comando termina sem erro.

### Alternativa Via SSH

Se o Dokploy nao mostrar terminal para o container:

```bash
ssh root@IP_DA_VPS
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep yux-backend-api
docker exec -it <nome-do-container-backend-api> npm run migrate:prod
```

## 10. Criar Usuario Admin Inicial

Depois das migrations:

1. Continue no terminal do servico `yux-backend-api`.
2. Execute:

```bash
ADMIN_EMAIL=admin@yux.com.br ADMIN_PASSWORD='<senha-temporaria-forte>' npm run create-admin:prod
```

Resultado esperado:

```text
admin user ready: admin@yux.com.br
```

Regras:

- Nao salve `ADMIN_PASSWORD` em arquivo versionado.
- Use uma senha temporaria forte.
- Troque a senha depois do primeiro acesso quando a gestao de usuarios estiver
  disponivel.

## 11. Validar Health Checks

No seu computador:

```bash
curl -I https://hub.yux.com.br/health
curl https://hub.yux.com.br/api/health
curl https://hub.yux.com.br/api/ready
```

Resultado esperado:

- `/health`: HTTP `204` ou resposta sem erro.
- `/api/health`: JSON de health do backend.
- `/api/ready`: JSON indicando que dependencias basicas estao prontas.

Se o runtime de agentes estiver exposto:

```bash
curl https://agents.yux.com.br/health
```

## 12. Smoke Test No Navegador

1. Abra `https://hub.yux.com.br`.
2. Faca login com `admin@yux.com.br`.
3. Valide as telas:
   - Dashboard
   - Clientes
   - Projetos
   - CRM
   - Automacoes
   - Omnichannel
   - Marketing Studio
   - Strategy Engine
4. Volte ao Dokploy.
5. Abra `Logs`.
6. Revise logs de:
   - `yux-frontend`
   - `yux-backend-api`
   - `yux-backend-worker`
   - `yux-postgres`
   - `yux-redis`
   - `yux-agent-harness-runtime`

Erros recorrentes de auth, migrations, Redis, provider tokens ou runtime de
agentes devem bloquear o cutover.

## 13. Backup Obrigatorio

Configure backup antes de trafego real de clientes.

Volumes persistentes:

- `yux_postgres_data`
- `yux_redis_data`
- `yux_materials_data`
- `yux_omnichannel_attachments_data`

Dump logico recomendado para Postgres:

```bash
docker exec -t <nome-do-container-postgres> pg_dump -U yux_app -d yux_hub > yux_hub_$(date +%Y%m%d_%H%M%S).sql
```

Retencao minima recomendada:

- 7 backups diarios.
- 4 backups semanais.
- 3 backups mensais.

Teste restore em um banco separado antes de depender do backup em producao.

## 14. Atualizar Deploy Depois De Novos Commits

Quando houver novo commit na branch `deploy/vps`:

1. Abra o Dokploy.
2. Entre em `Projects`.
3. Abra `yux-portal-prod`.
4. Abra `yux-portal-stack`.
5. Clique em `Deployments`.
6. Clique em `Deploy Latest Commit` ou `Redeploy`.
7. Acompanhe `Logs`.
8. Se o commit tiver migrations novas, rode novamente:

```bash
npm run migrate:prod
```

9. Repita os health checks.

## 15. Checklist Final De Cutover

- [ ] Branch usada no Dokploy: `deploy/vps`.
- [ ] DNS de `hub.yux.com.br` aponta para a VPS.
- [ ] `hub.yux.com.br` esta configurado no servico `yux-frontend`, porta `80`.
- [ ] HTTPS ativo em `hub.yux.com.br`.
- [ ] Variaveis obrigatorias salvas no Dokploy.
- [ ] `POSTGRES_PASSWORD` nao esta em arquivo versionado.
- [ ] `SESSION_SECRET` tem pelo menos 64 caracteres aleatorios.
- [ ] `YUX_AGENT_RUNTIME_TOKEN` e forte.
- [ ] Deploy do compose terminou sem erro.
- [ ] `npm run migrate:prod` executou sem erro.
- [ ] Admin inicial `admin@yux.com.br` foi criado.
- [ ] `https://hub.yux.com.br/health` responde.
- [ ] `https://hub.yux.com.br/api/health` responde.
- [ ] `https://hub.yux.com.br/api/ready` responde.
- [ ] Login admin funciona.
- [ ] Smoke test das telas principais passou.
- [ ] Logs revisados sem erro recorrente.
- [ ] Backup do Postgres configurado.
- [ ] Backup dos volumes de uploads configurado.

## 16. Rollback

Antes de cada release importante:

1. Gere dump do Postgres.
2. Confirme qual commit estava estavel antes do deploy.
3. No Dokploy, abra `Deployments`.
4. Se houver opcao `Rollback`, selecione o deploy anterior.
5. Se nao houver rollback automatico, altere temporariamente a branch ou commit
   para o ultimo commit estavel e faca `Redeploy`.

Se uma migration falhar no meio:

1. Pare o cutover.
2. Nao tente corrigir no banco de producao sem dump.
3. Restaure o dump em ambiente separado para entender o erro.
4. Ajuste a migration no codigo.
5. Rode novo deploy apenas depois da validacao.

## 17. Referencias Oficiais Do Dokploy

- Docker Compose: `https://docs.dokploy.com/docs/core/docker-compose`
- Environment variables: `https://docs.dokploy.com/docs/core/environment-variables`
- Domains: `https://docs.dokploy.com/docs/core/domains`

## 18. Observacao De Migracao

Supabase e Vercel nao fazem parte do runtime de producao atual. O frontend,
backend, Postgres, Redis, worker e runtime de agentes devem ser operados pela
stack Dokploy/VPS descrita neste guia.

# Deploy VPS com Dokploy + Supabase - Portal YUX

Atualizado em 2026-06-26.

Este guia substitui o fluxo antigo de Vercel. A arquitetura alvo agora e:

```text
Usuario
  -> dominio HTTPS no Dokploy
  -> yux-frontend (React/Vite servido por Nginx)
  -> Supabase Auth, Postgres, Storage, Realtime e Edge Functions
  -> yux-agent-harness-runtime na VPS para orquestracao de agentes
```

O Supabase continua sendo o nucleo de dados, autenticacao, RLS e Edge Functions. A VPS/Dokploy hospeda o frontend estatico e o runtime Python de agentes.

## 1. O que vai para cada ambiente

| Componente | Onde roda | Evidencia no repo |
| --- | --- | --- |
| Frontend Portal YUX | VPS/Dokploy, container Nginx | `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.dokploy.yml` |
| Agent Harness Runtime | VPS/Dokploy, container Python/FastAPI | `workers/marketing-studio-agent-runtime/Dockerfile`, `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py` |
| Banco, Auth, RLS, Storage, Realtime | Supabase Cloud | `supabase/migrations`, `supabase/probes`, `frontend/src/lib/supabase.ts` |
| Edge Functions | Supabase Cloud | `supabase/functions/*` |
| Segredos privados | Supabase Edge secrets e Dokploy env vars | nunca no frontend nem no Git |

## 2. Pre-requisitos

- VPS com acesso SSH.
- Dokploy instalado e acessivel no painel.
- Dominio ou subdominios apontando para a VPS.
- Projeto Supabase ativo.
- Supabase CLI local autenticado, quando for aplicar migrations/functions.
- Git repository acessivel pelo Dokploy ou upload manual do compose.

Dominios oficiais deste projeto:

- `yux.com.br` para o site oficial.
- `hub.yux.com.br` para o frontend do sistema.
- `agents.yux.com.br` para o runtime Python de agentes.
- `deploy.yux.com.br` para o painel Dokploy, se o painel ficar nessa mesma infraestrutura.

## 3. Preparar o Supabase antes do deploy da VPS

1. Confirme o projeto alvo no Supabase.
2. Aplique ou confirme as migrations em `supabase/migrations`.
3. Rode os probes de seguranca/contrato em `supabase/probes`.
4. Publique as Edge Functions necessarias.
5. Configure os secrets das Edge Functions.

Comandos locais recomendados:

```powershell
supabase --version
supabase link --project-ref <PROJECT_REF>
supabase db push
$env:SUPABASE_DB_URL = "postgresql://..."
.\scripts\run-supabase-probes.ps1
```

Deploy das Edge Functions mais importantes:

```powershell
supabase functions deploy process-ai-message
supabase functions deploy run-strategy-admin-chat
supabase functions deploy receive-channel-event --no-verify-jwt
supabase functions deploy submit-webchat-event --no-verify-jwt
supabase functions deploy dispatch-outbound-message
supabase functions deploy retry-outbound-message
supabase functions deploy request-scheduling
supabase functions deploy start-marketing-provider-connect
supabase functions deploy complete-marketing-provider-connect
supabase functions deploy list-marketing-provider-assets
supabase functions deploy execute-marketing-publishing
supabase functions deploy execute-ad-provider-mutation
supabase functions deploy sync-ad-metrics
```

Configure os secrets no Supabase:

```powershell
supabase secrets set YUX_AGENT_RUNTIME_URL=https://agents.yux.com.br
supabase secrets set YUX_AGENT_RUNTIME_TOKEN=<token-longo-aleatorio>
supabase secrets set OPENROUTER_API_KEY=<valor>
supabase secrets set JINA_API_KEY=<valor>
```

Inclua tambem secrets de Meta, Google, WordPress, SMTP2GO, n8n ou outros provedores quando esses fluxos forem ativados.

## 4. Variaveis de ambiente no Dokploy

Crie um `.env` no projeto Dokploy ou preencha as variaveis pela interface:

```bash
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx

YUX_FRONTEND_PORT=3000
YUX_AGENT_RUNTIME_PORT=8080
YUX_AGENT_RUNTIME_TOKEN=<mesmo-token-configurado-no-supabase>

SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

OPENROUTER_API_KEY=<valor>
JINA_API_KEY=<valor>
```

Regras:

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` sao publicos no bundle do frontend.
- `SUPABASE_SERVICE_ROLE_KEY`, `YUX_AGENT_RUNTIME_TOKEN`, `OPENROUTER_API_KEY` e `JINA_API_KEY` ficam somente no Dokploy/Supabase secrets.
- Nao use `SUPABASE_SERVICE_ROLE_KEY` em variaveis `VITE_*`.

## 5. Criar o projeto no Dokploy

1. Acesse o painel Dokploy.
2. Crie um novo projeto, por exemplo `portal-yux`.
3. Adicione um compose/app apontando para este repositorio.
4. Use o arquivo `docker-compose.dokploy.yml`.
5. Configure as variaveis da secao anterior.
6. Execute o deploy.

O compose sobe dois servicos:

- `yux-frontend`: builda `frontend/` e serve `dist/` com Nginx.
- `yux-agent-harness-runtime`: sobe a API FastAPI em `:8080`.

## 6. Configurar dominios e SSL no Dokploy

No Dokploy:

1. Aponte `hub.yux.com.br` para o servico `yux-frontend`, porta interna `80`.
2. Aponte `agents.yux.com.br` para o servico `yux-agent-harness-runtime`, porta interna `8080`.
3. Ative HTTPS/Let's Encrypt para ambos.
4. Configure redirecionamento HTTP -> HTTPS.

Checks esperados:

```bash
curl -I https://hub.yux.com.br/health
curl https://agents.yux.com.br/health
```

O frontend deve retornar `204` em `/health`. O runtime deve retornar JSON com `status: ok`.

## 7. Configurar Auth no Supabase

No Supabase Dashboard:

1. Va em Authentication > URL Configuration.
2. Defina Site URL como `https://hub.yux.com.br`.
3. Adicione Redirect URLs:

```text
https://hub.yux.com.br/**
https://hub.yux.com.br
```

Se houver ambiente de homologacao, cadastre tambem o dominio de staging.

## 8. Validacao local antes do deploy

Execute:

```powershell
.\scripts\run-release-checks.ps1
```

Para validar o compose em uma maquina com Docker:

```powershell
docker compose -f docker-compose.dokploy.yml config
docker compose -f docker-compose.dokploy.yml up --build
```

Checks manuais:

```powershell
Invoke-WebRequest http://localhost:3000/health
Invoke-WebRequest http://localhost:8080/health
```

## 9. Validacao pos-deploy

1. Abra `https://hub.yux.com.br`.
2. Faça login com usuario admin.
3. Verifique:
   - `/dashboard`;
   - `/admin/strategy-engine`;
   - `/marketing-studio`;
   - `/omnichannel`;
   - `/automations`;
   - `/client-workspaces`.
4. Chame o runtime:

```bash
curl https://agents.yux.com.br/health
```

5. Teste uma chamada protegida com token:

```bash
curl -X POST https://agents.yux.com.br/workflows/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"teste de runtime","profile_key":"growth_strategist"}'
```

6. Verifique logs das Edge Functions `process-ai-message` e `run-strategy-admin-chat` depois de configurar `YUX_AGENT_RUNTIME_URL`.

## 10. Ordem recomendada de entrada em producao

1. Supabase migrations aplicadas.
2. Probes Supabase aprovados.
3. Edge Functions publicadas.
4. Secrets Supabase configurados.
5. Dokploy com frontend no ar.
6. Dokploy com Agent Harness Runtime no ar.
7. Auth URLs do Supabase atualizadas para o dominio novo.
8. QA autenticado admin e cliente.
9. Logs de runtime e Edge Functions conferidos.
10. Backup/restore Supabase confirmado.

## 11. Operacao e rollback

Antes de cada release:

```powershell
.\scripts\run-release-checks.ps1
supabase db dump --linked --file backup-pre-release.sql
```

Rollback:

- Frontend/runtime: use rollback de deploy no Dokploy ou redeploy de commit anterior.
- Supabase: restaure backup ou aplique migration corretiva; nao remova RLS para contornar erro.
- Agent runtime: se falhar, remova temporariamente `YUX_AGENT_RUNTIME_URL` das Edge Functions para manter o fallback existente.

## 12. Referencias oficiais

- Dokploy: https://docs.dokploy.com/
- Docker Compose no Dokploy: https://docs.dokploy.com/docs/core/docker-compose
- Supabase changelog: https://supabase.com/changelog
- Supabase CLI: https://supabase.com/docs/reference/cli/introduction

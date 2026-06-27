# VPS Backend Cutover Checklist

## Before Deploy

- [ ] `.\scripts\run-release-checks.ps1 -SkipInstall` passa.
- [ ] `docker compose -f docker-compose.dokploy.yml config` passa em ambiente com Docker.
- [ ] `SESSION_SECRET` tem pelo menos 64 caracteres aleatorios.
- [ ] `POSTGRES_PASSWORD` esta configurado somente no Dokploy.
- [ ] `DATABASE_URL` aponta para `yux-postgres`.
- [ ] Nenhum segredo usa prefixo `VITE_`.
- [ ] Backup do Postgres esta configurado.
- [ ] Restore foi testado fora de producao.

## Deploy

- [ ] Deploy do compose no Dokploy concluido.
- [ ] Migrations do backend aplicadas.
- [ ] Admin inicial criado com `admin@yux.com.br`.
- [ ] `https://hub.yux.com.br/health` responde.
- [ ] `https://hub.yux.com.br/api/health` responde.
- [ ] `https://hub.yux.com.br/api/ready` responde.
- [ ] `https://agents.yux.com.br/health` responde, se runtime estiver exposto.

## Smoke Test

- [ ] Login admin funciona.
- [ ] Dashboard carrega.
- [ ] Workspaces de cliente carregam.
- [ ] CRM abre sem erro fatal.
- [ ] Automacoes abrem sem erro fatal.
- [ ] Omnichannel abre sem erro fatal.
- [ ] Marketing Studio abre sem erro fatal.
- [ ] Strategy Engine abre sem erro fatal.
- [ ] Logs de API e worker nao mostram erro recorrente.

## Rollback

- [ ] Deploy anterior permanece disponivel.
- [ ] Dump pre-release do Postgres foi gerado.
- [ ] Rollback de frontend e backend sera feito junto.
- [ ] Se migration falhar, restaurar dump antes de tentar novamente.

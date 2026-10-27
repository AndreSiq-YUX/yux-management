# Client users implementation plan

> Execute inline with superpowers:executing-plans.

Goal: gerenciar usuários por cliente com convite e funções existentes.
Architecture: rotas independentes /api/workspace/client-accounts/:clientId/members e componente compartilhado ClientUsersManager({clientId}).
Tech Stack: Fastify, PostgreSQL, React, TypeScript, SMTP2GO, Vitest.
Spec: docs/superpowers/specs/2026-10-27-client-users-design.md

## Constraints and review focus
Preservar alterações existentes. Sem publicação ou e-mail real. Isolamento entre clientes; impedir mudança de conta interna/compartilhada; lock contra perda do último admin; erro de envio permite reenvio; troca de cliente deve cancelar atualização de UI anterior.

## Tasks
- [x] API: criar testes e observar falha; implementar clientMembers.ts, registrar em server.ts. GET members -> {members,canManage}; POST {name,email,role} -> {member,invitation}; PATCH /:userId {role?,isActive?}; POST /:userId/access-email -> {invitation}. Testar autenticação, tenant, funções, duplicados, último admin, sessões, auditoria, falha SMTP.
- [x] UI: testes de interações antes da implementação; serviço tipado clientMembersService, ClientUsersManager compartilhado; integrar detalhes/edição e PortalCompanyUsersPage. Validar convites, alterações, desativação, reenvio e acesso limitado.
- [x] Verificar type-check, builds, testes relacionados e navegador; revisar diff e registrar limitações. Manter alterações locais para revisão.

## Progress
Planejamento concluído. Implementação autorizada pelo pedido do usuário; execução no workspace atual para preservar integração com alterações locais existentes, sem commit/push.

API e UI implementadas. Suíte completa backend: 179 arquivos, 802 testes aprovados; build e type-check aprovados. Suíte frontend inicial: 148 arquivos, 627 testes aprovados. Adicionados três testes de integração do portal/resposta tardia/erro do último administrador; testes focados finais: 12 aprovados. ESLint dos novos arquivos e página alterada aprovado sem warnings. Revisão independente: nenhum bloqueio; faltam validação com PostgreSQL concorrente e SMTP reais. Navegador local tentou abrir a tela de validação com fixtures; bloqueado por permissões de socket (localhost:5187). Servidor temporário encerrado. Nenhum e-mail real enviado; sem publicação, commit ou push. Verificação frontend final concluída: 149 arquivos / 630 testes aprovados; build final e orçamento de bundle aprovados. Total: 1.432 testes aprovados entre backend e frontend. A validação visual segue bloqueada pelo ambiente; não foi apresentada como aprovada.

## Integração solicitada em main

Base remota confirmada: de9a08feffec8584c9d8b4bf52ddcb374d6f2f6d. Preparada cópia isolada da main para preservar a árvore local e os avanços de estratégia, Radar e entregas. A tela Equipe mantém PortalPage, CrmMembersPanel, CrmTeamsPanel e CrmSeatUsagePanel; a gestão de acesso ao portal foi adicionada também para contas sem CRM. Os testes atuais do CRM foram preservados e a expectativa do antigo placeholder B4 foi atualizada.

Validação da integração: os 14 testes focados de interface passaram; o novo teste de convite sem CRM falhou antes da integração e passou depois. TypeScript passou nos dois pacotes. A suíte backend completa apresentou 1.606 testes aprovados, três falhas de sockets EACCES em radar-pinned-transport e falha de preparação OpenSSL em radar-site-tls-exception. Os arquivos dessas suítes são idênticos à main. A verificação de lint da main apontou uma assinatura anterior de react-refresh em RadarResearchAttention.tsx (arquivo também idêntico à main); lint dos novos componentes/serviço/página passou. A CI da main já falhava antes desta entrega: Frontend, execução 40523280928, interrompido em npm audit. Não modificar dependências ou testes de rede fora do escopo para ocultar essas limitações.

Situação antes da publicação: validação backend permitida pelo ambiente concluída com 1.604 testes aprovados e 126 testes opt-in ignorados, excluindo somente as duas suítes de rede/OpenSSL já bloqueadas. Na interface, 20 testes focados passaram após retirar o recurso entregue B4 do registro de pendências; o teste de consistência do registro identificou a necessidade dessa retirada e passou após o ajuste. Build backend aprovado. A revisão automática rejeitou create_tree duas vezes: primeiro exigiu confirmar o destino e, após verificar origin, propriedade e permissões, exigiu autorização explícita para publicação no repositório público AndreSiq-YUX/yux-management. Nenhuma alteração remota foi criada. Aguardar a confirmação do usuário antes de repetir qualquer escrita no GitHub.

Build frontend integrado aprovado, incluindo TypeScript, Vite e orçamento de bundle (passed: true). Patch de 15 arquivos salvo em tmp/client-users-main-20261027.patch e conferido com git apply --check --reverse contra a cópia integrada. Cópia integrada: C:/Users/andre/AppData/Local/Temp/yux-client-users-main-20261027. Aguarda somente autorização explícita para envio público ao GitHub e merge na main. A suíte frontend completa foi interrompida após identificar a pendência B4, corrigida e revalidada nos 20 testes focados; não afirmar que toda a suíte da main está verde. A CI preexistente falha na auditoria de dependências.

Em 27/10/2026, o usuário confirmou expressamente a publicação destas alterações no repositório público AndreSiq-YUX/yux-management e o merge na main. Autorização cobre a publicação preparada; prosseguir sem solicitar novamente a confirmação do destino.

# Conhecimento compartilhado do Harness — plano de correção

> **For agentic workers:** executar nativamente nesta sessão, tarefa por tarefa. A solicitação de correção imediata autoriza a execução; não abrir nova rodada de aprovação do plano.

**Goal:** Doutrina estratégica e conhecimento funcional da plataforma comuns a todas as contas, combinados exclusivamente com o contexto privado da conta atual.

**Architecture:** Manter os namespaces existentes: `strategy` para a doutrina governada da YUX e `company` para informações do cliente. Publicar packs internos sem owner de conta e normalizar seus vínculos como globais; nunca promover automaticamente packs ou documentos específicos de clientes. Separar catálogo conhecido de ferramentas das ações que a missão pode executar.

**Tech Stack:** PostgreSQL/RLS, TypeScript/Fastify, React, runtime Python e Harness existentes.

**Spec:** Solicitação explícita do usuário de 23/10/2026; fluxo existente em `docs/runbooks/radar-action-engine-rollout.md` e `docs/runbooks/mission-conversation-rollout.md`.

## Restrições e critérios

- Conhecimento estratégico comum não depende do UUID da conta nem da liberação de execução do Radar.
- Dados, documentos e fontes do cliente A não entram no contexto do cliente B.
- Conservar publicações aprovadas, hashes, evidências, embeddings, histórico e revogação; não editar releases imutáveis.
- Preservar autenticação, aprovações e limites financeiros de execução. Conhecer uma ferramenta não significa autorizar automaticamente seus efeitos.
- Modelos de teste simulados; nenhuma nova chamada paga necessária para publicar os itens já aprovados.
- Material de cliente não pode ser publicado como doutrina global.

## Tarefa 1 — Garantir a publicação comum e o isolamento privado

Arquivos: `backend/src/modules/strategy-engine/publications.ts`, `ingestion.ts`, `routes.ts`, nova migration `0238_shared_strategy_knowledge.sql`, `backend/src/modules/action-engine/mission-source-verifier.ts`; testes PostgreSQL e de publicação.

- [x] Criar teste que publica doutrina interna e a recupera para contas A/B sem configuração por conta; contrastar com documentos privados de A/B e uma publicação específica de cliente.
- [x] Reproduzir a restrição atual. Publicação interna passa a conservar owner nulo e vínculos globais na mesma transação; material privado rejeitado.
- [x] Impedir novos owners e vínculos por conta em packs internos. Preservar os registros legados até sua publicação governada, sem alterar releases existentes.
- [x] Permitir doutrina interna como `internal_reasoning` no contexto de trabalho do cliente, conservando projeção genérica e bloqueio de citação bruta; manter o limite de público externo.
- [x] Rodar teste real PostgreSQL, publicação, revogação, quatro papéis HTTP e isolamento entre contas.

## Tarefa 2 — Remover a configuração equivocada da interface e separar o catálogo

Arquivos: `frontend/src/components/strategy-engine/StrategyPacksPanel.tsx` e testes; `backend/src/modules/action-engine/platform-tool-catalog.ts`, `backend/src/jobs/handlers/action-engine.ts`; prompt de entrada em `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py` e testes.

- [x] Testar que o vínculo da doutrina interna é global, mesmo com workspace interno selecionado; não aceitar material de cliente no upload central.
- [x] Exibir claramente a base estratégica comum e o conhecimento privado separado, sem seleção de conta para a doutrina.
- [x] Enviar catálogo funcional das ferramentas independentemente do gate de execução; testar Radar conhecido com execução indisponível e disponível.
- [x] Instruir o Harness a combinar a doutrina comum com o contexto da conta, diferenciando conhecimento de autorização.
- [x] Verificar testes React/Python, tipos, builds e interação no navegador com serviços simulados.

## Tarefa 3 — Aplicar aos packs publicados e conferir produção

Arquivos: runbooks, manifesto de migrations e evidências fora do checkout.

- [x] Inventariar The Black Book e guia do Radar, fontes e vínculos; conservar materiais privados.
- [x] Publicar código/migration e normalizar os packs comuns por comandos canônicos, reaproveitando somente os itens previamente aprovados e seus embeddings.
- [x] Verificar os mesmos IDs de publicação e conteúdo nas contas interna YUX, YUX Captação e outra conta elegível; contexto de empresa continua diferente e isolado.
- [x] Conferir ingestão futura, publicação/revogação, código executado, API e workers; registrar o que foi efetivamente comprovado.

## Foco da revisão

1. Owner de armazenamento do documento não pode se tornar filtro da doutrina publicada.
2. Conhecimento privado inserido no local errado não pode escapar por uma normalização global.
3. Visibilidade de raciocínio não pode permitir reprodução de conteúdo privado na interface.
4. Revogação precisa invalidar a fonte usada por uma missão antiga.
5. Catálogo informativo não pode inserir ações desabilitadas em `allowedActionPacks` ou executar pesquisa.

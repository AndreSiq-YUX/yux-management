# Radar completo por padrão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução direta, sem subagentes. Pedido atual autoriza correção imediata e redefine a entrega anterior: documentação local para outra frente, sem publicação no RAG nem integração de ações.

**Goal:** Fazer novas campanhas nascerem com o fluxo completo e entregar documentação funcional e técnica reutilizável.

**Architecture:** Defaults exclusivos da criação no backend, separados do parser legado de leitura/edição; a UI envia os mesmos defaults. Criação rápida usa o pipeline configurável. Modelos, permissões, capacidade e autorização continuam nas fronteiras existentes.

**Tech Stack:** TypeScript, Zod, Fastify, React, Vitest, PostgreSQL de teste isolado e Markdown.

**Spec:** `docs/superpowers/specs/2026-10-22-radar-complete-campaign-defaults.md`.

## Global Constraints

- Sem chamadas pagas, pesquisa, deploy, push ou mudanças de configuração em produção nesta entrega.
- Não ampliar cotas ou créditos nem modificar campanhas existentes.
- Somente `yux_admin` recebe ferramentas, modelos, custos e diagnósticos técnicos.
- Sem exclusão probabilística automática não calibrada; sem integração executável com Action Engine.
- Preservar arquivos não relacionados e o padrão visual YUX.

## Review Focus

- Parser HTTP pode preencher falses legados antes da criação: teste de payload parcial na tarefa 1.
- Defaults novos não podem mudar campanhas antigas: teste de edição na tarefa 1.
- Um atalho local não pode criar pipeline diferente: teste de formulário e envio na tarefa 2.
- Duplicação de campanha em enforce não pode herdar calibração: teste na tarefa 1.
- Cliente ou outro tenant não pode receber detalhes técnicos: audiência HTTP na tarefa 3.

### Task 1: Defaults de criação separados da compatibilidade legada

**Files:** `backend/src/modules/radar/search-configuration.ts`, `repository.ts`, `routes.ts`; testes `backend/tests/radar-search-configuration.test.ts`.

**Interfaces:** `prepareNewRadarSearchConfiguration(value?: unknown): RadarSearchConfiguration`; `radarNewSearchConfigurationSchema` para criação HTTP. `resolveRadarSearchConfiguration` permanece parser de leitura/edição legada.

- [x] Escrever teste que verifica configuração persistida por `createRadarCampaign` sem configuração e com filtros parciais, para públicos e organizações diferentes; verificar etapas ligadas, filtros preservados e ausência de consultas a provedores/fila.
- [x] Executar `npx vitest run tests/radar-search-configuration.test.ts` e observar falha pelos defaults desativados.
- [x] Implementar defaults completos na criação, merge por subobjeto e validação Zod; preservar opções explícitas do Admin. Separar schema POST de PATCH para não reativar campanha antiga. Duplicação coloca G1/G5 enforce em shadow na nova cópia, sem copiar recibos/calibração.
- [x] Executar os testes do arquivo e suite backend; registrar falhas/ignores reais. Commit somente após verificação.

### Task 2: Mesmo fluxo no formulário padrão e atalho local

**Files:** `frontend/src/lib/radar/radarSearchConfiguration.ts`, `RadarCampaignConfigurationForm.tsx`, `RadarWorkspace.tsx`; testes correspondentes em `frontend/src/components/radar/`.

**Interfaces:** `defaultRadarSearchConfiguration(): RadarSearchConfiguration` produz defaults completos para novos rascunhos. O atalho local envia `regional_b2b`, UF e cidade em `searchConfiguration.cities`; recém-abertas acrescenta período inicial de abertura.

- [x] Escrever teste de criação sem edição técnica verificando payload completo; teste do atalho local e recém-abertas com mesma configuração, sem iniciar pesquisa; manter teste de edição de campanha legada.
- [x] Executar testes, observar falhas, implementar defaults e texto comercial conciso mantendo componentes e estilos existentes. Não adicionar nomes de fornecedores em texto cliente.
- [x] Executar suite frontend, type-check e build. Commit somente após verificação.

### Task 3: Documentação e regressão ponta a ponta sem custos externos

**Files:** criar `docs/knowledge/radar-commercial-action-engine.md`, `docs/radar-commercial-execution-reference.md`; atualizar `docs/yux-action-engine-implementation.md`, `docs/yux-action-engine-visao.md`; testes `backend/tests/integration/radar-commercial-audience.test.ts`.

**Interfaces:** guia comercial recuperável separado da referência técnica exclusiva de Admin. Descrever APIs reais, versões, idempotência, permissões, orçamento, snapshots e ausência de capabilities Radar no Action Engine.

- [x] Adicionar teste HTTP de criação parcial pelo Admin e leitura comercial dos quatro papéis/isolamento entre contas; usar Postgres isolado e fila simulada sem efeitos.
- [x] Escrever guia funcional com todos os parâmetros comerciais, fluxo, ações e interpretação dos resultados; referência técnica com contratos/endpoints/escopos de limites e exemplos concretos. Ligar ambos à documentação do Action Engine e marcar ingestão/integração como não executadas.
- [x] Executar teste HTTP, suites e builds; revisar diff completo em passe separado, sem subagentes por escolha do usuário. Registrar resultado e limitações de validação. Não fazer push/deploy não solicitado.

## Self-review

Defaults e parser legado separados evitam reprocessar campanhas existentes. Mesmos parâmetros nas criações padrão/local. G1/G5 em observação não equivalem a integração incompleta, mas a proteção sem calibração. Nova entrega substitui a publicação de conhecimento proposta anteriormente; não a executa.

**Entrega local concluída:** [verificações e limitações](../../releases/2026-10-22-radar-complete-campaign-defaults.md). Sem push ou deploy.

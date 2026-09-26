# Radar: piloto de descoberta automática com dados OSM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a campanha Radar já criada descubra automaticamente empresas por cidade e segmento a partir de um extrato OSM regional, sem CSV, Jina, Google Maps, API paga ou envio de mensagens.

**Architecture:** Um processo administrativo obtém e indexa um extrato regional OSM sob licença ODbL; o Radar consulta esse índice local, devolve até dez candidatos por execução e preserva a revisão existente. A descoberta, a verificação do site informado e a comunicação são etapas separadas. O piloto é interno, limitado e desligado por padrão.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest e leitura streaming de extrato OSM `.osm.pbf` em processo administrativo isolado.

**Spec:** [`docs/superpowers/specs/2026-09-26-radar-prospeccao-orquestrada.md`](../specs/2026-09-26-radar-prospeccao-orquestrada.md). Este plano implementa apenas a primeira fonte automática de descoberta; não implementa a orquestração comercial completa do plano maior.

## Global Constraints

- Não usar APIs pagas, Jina, Google Maps, scraping de resultados de buscas ou instância pública Overpass para o SaaS. Geofabrik publica extrato regional; verificar licença, atribuição, integridade, tamanho e operação antes da carga.
- Não executar chamadas pagas nem envio de e-mail, WhatsApp ou ligação. `source_type=osm_extract`; nenhuma migração ativa a fonte automaticamente.
- Manter dados brutos e resultados históricos de fontes legadas. Não alterar arquivos WhatsApp e alterações não relacionadas já presentes na árvore de trabalho. Antes de servir a fonte a clientes SaaS, revisar o tratamento de base derivada e a atribuição ODbL.
- Candidato sem `website` fica `site_unknown`, nunca `sem_site`. Cada campo obtido do OSM guarda referência do elemento, versão/data do extrato e procedência ODbL.
- O piloto da campanha “clínicas médicas em Londrina/PR” mapeia explicitamente `amenity=clinic`, `healthcare=clinic` e `amenity=doctors`; o motor aceita outros segmentos por mapeamentos versionados, sem inferir etiquetas livremente.
- Limite inicial: dez candidatos por execução e dez por dia na campanha atual. Resultados precisam ser ordenados de forma estável para paginação; nenhuma busca repete candidatos já vistos na campanha.

## Review Focus

- Município homônimo ou fronteira municipal: teste de geocódigo/contorno impede importar empresa de outra cidade/UF.
- Extrato ausente, antigo, corrompido ou incompleto: teste bloqueia busca e exibe motivo; não apresenta zero como ausência de empresas.
- Empresa sem site ou contato: teste mantém `unknown` e campos vazios, sem criar telefone/e-mail nem autorização de WhatsApp.
- Mesmo estabelecimento mapeado como ponto e área, ou repetido entre buscas: teste deduplica sem perder procedência.
- Extrato grande e entrada maliciosa de campanha: teste mantém filtros indexados, limite rígido e não executa consulta arbitrária sobre arquivos ou rede.

---

### Task 1: Índice local de estabelecimentos OSM

**Files:**
- Create: `backend/src/db/migrations/0178_radar_osm_extract_pilot.sql`
- Create: `backend/src/modules/radar/osm-extract.ts`
- Create: `backend/src/modules/radar/osm-segment-map.ts`
- Create: `backend/scripts/import-radar-osm-extract.ts`
- Create: `backend/tests/radar-osm-extract.test.ts`

**Interfaces:**
- Produces: `importRadarOsmExtract(pool, { path, boundaryPath, localityPath, municipalityCode, city, state, regionKey, sourceUrl, boundarySource }): Promise<{ imported, skipped, snapshotId }>` e consulta indexada por campanha persistida em `runRadarOsmSearch`.
- Dados indexados: `osm_type`, `osm_id`, `name`, `city`, `state`, `category`, `website`, `phone`, `email`, `address`, `source_url`, `snapshot_id`, `tags`; chave única `(snapshot_id, osm_type, osm_id)` e índice por `(state, city, category)`. O mapa de segmentos aceita apenas chaves conhecidas e inclui as três etiquetas médicas definidas acima.

- [ ] **Step 1: Write failing tests.** `radar-osm-extract.test.ts`: extrato-fixture com clínica de Londrina, consultório fora do município, ponto/área duplicados e estabelecimento sem site; conferir filtro, dedupe, proveniência e `site_unknown`.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-osm-extract.test.ts` → FAIL antes da implementação.
- [ ] **Step 3: Implement.** Carga administrativa em snapshot de status `loading`, validação de região e integridade, troca atômica do snapshot ativo e busca indexada. Ler o PBF por streaming em duas passagens sobre arquivo regional baixado de forma explícita pelo operador; usar contorno e identidade municipal públicos do IBGE para conferir coordenadas e nome, sem confiar apenas na etiqueta textual de cidade do OSM. A API pública do Radar nunca baixa nem processa PBF por requisição.
- [ ] **Step 4: Run green tests.** `cd backend; npm test -- tests/radar-osm-extract.test.ts` → PASS; medir tempo da consulta indexada na fixture.
- [ ] **Step 5: Commit.** Apenas os arquivos desta tarefa: `feat(radar): index licensed OSM extracts for pilot discovery`.

### Task 2: Fonte governada no Radar e interface de busca

**Files:**
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/sourceRules.ts`
- Modify: `frontend/src/types/radar.ts`
- Modify: `frontend/src/services/radarService.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`
- Test: `backend/tests/radar-routes.test.ts`, `frontend/src/lib/radar/radarSourceRules.test.ts`

**Interfaces:**
- Consumes: `searchRadarOsmIndex(...)` da Task 1.
- Produces: `POST /api/radar/campaigns/:id/search-osm` com `{ organizationId, limit?, cursor? }`; usa cidade, UF e segmento **da campanha persistida**, não filtros arbitrários do request. Retorna candidatos, `nextCursor`, `runId`, `issues` e atribuição OSM.

- [ ] **Step 1: Write failing tests.** Fonte desligada ou snapshot inválido não busca; fonte ligada retorna até dez candidatos `pending_review`, pagina sem repetir, registra número real de candidatos e nunca chama Jina/CNPJa/LLM.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-routes.test.ts`; `cd frontend; npm test -- src/lib/radar/radarSourceRules.test.ts` → FAIL nos novos casos.
- [ ] **Step 3: Implement.** Registrar fonte `osm_extract` inicialmente desabilitada, incorporar busca e contador diário por campanha; mostrar botão “Buscar automaticamente (dados abertos)” apenas quando houver snapshot e fonte habilitada; exibir atribuição, idade do extrato e estado de cada dado. Preservar revisão/importação de candidatos existente.
- [ ] **Step 4: Run green tests.** Mesmos comandos → PASS. Verificar com a campanha de clínica como fixture, sem chamada externa.
- [ ] **Step 5: Commit.** Apenas os arquivos desta tarefa: `feat(radar): expose governed OSM discovery in campaign`.

### Task 3: Verificação e relatório do piloto

**Files:**
- Create: `backend/src/modules/radar/osm-site-check.ts`
- Create: `backend/tests/radar-osm-site-check.test.ts`
- Create: `docs/runbooks/radar-piloto-osm.md`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`

**Interfaces:**
- Consumes: candidatos da Task 2.
- Produces: verificação sob demanda e limitada somente de URL de site informada no OSM, com estados `verified_present`, `unknown`, `blocked`; relatório de candidatos únicos, site informado, site confirmado, contato informado, duplicatas e custo de API `US$ 0` (infraestrutura discriminada à parte).

- [ ] **Step 1: Write failing tests.** Site responde/redireciona, falha de DNS/timeout, URL privada/localhost e ausência de URL; nenhuma falha vira “não tem site” e nenhum contato é disparado.
- [ ] **Step 2: Run red tests.** `cd backend; npm test -- tests/radar-osm-site-check.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Verificação HTTP com bloqueio de rede privada, timeout e limite de páginas; registrar evidência e horário. Runbook descreve obtenção/licença do extrato, atualização, ativação interna, rollback, teto do piloto e coleta de métricas.
- [ ] **Step 4: Run green tests.** Testes de Radar e site → PASS; build do backend/frontend → PASS.
- [ ] **Step 5: Commit.** Apenas os arquivos desta tarefa: `test(radar): verify automated OSM pilot and document rollout`.

## Fora do escopo deste piloto

Busca em dados abertos do CNPJ, Parallel/Brave, análise por LLM, proposta, CRM automático e envio de mensagens serão comparados/implementados em etapas separadas. Este piloto mede primeiro a utilidade de uma fonte automática sem custo por requisição; não demonstra cobertura equivalente à do Google Maps nem informa abertura recente de empresas.

## Estado da execução em 26/09/2026

Implementação e testes locais concluídos, incluindo leitura real do PBF, validação de identidade e malha IBGE, indexação PostgreSQL isolada, busca governada, deduplicação, revisão e verificação segura do site. A prévia encontrou 88 elementos médicos em Londrina/PR; 14 informam site, 53 telefone e 7 e-mail. A carga no banco de produção e a ativação da fonte **ainda não ocorreram**; até lá o botão permanece bloqueado por desenho.

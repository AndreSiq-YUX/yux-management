# Radar — consolidação de presença, canais e resumo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the previously selected native execution method; one fresh whole-branch reviewer after implementation, not delegated implementation tasks.

**Goal:** Mostrar e consolidar corretamente sites e canais encontrados, corrigir o bloqueio indevido do complemento Brave e abrir um resumo útil na própria lista.

**Architecture:** Separar fatos observados de associação confirmada em uma projeção versionada compartilhada, sem substituir os controles de identidade por heurísticas permissivas. O pipeline extrai canais pendentes antes da associação, consolida confirmações com as evidências atuais e mantém os dados históricos. A UI usa a mesma projeção para lista/resumo/dossiê; o complemento Brave passa a respeitar o mesmo critério de revisão das demais operações.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React 18, componentes YUX, Vitest; leitor HTTP seguro existente; runtime de IA existente e configurável pelo Admin.

**Spec:** `docs/superpowers/specs/2026-10-14-radar-consolidacao-canais-resumo.md`

## Global Constraints

- Nenhum modelo pago, fallback ou provedor novo será escolhido/acionado sem autorização. Rotas, custos e limites continuam configuráveis pelo Admin.
- Este plano não altera a política de herança global nem salva rotas automaticamente.
- Testes automatizados e QA usam respostas simuladas/local, sem consumo de provedores.
- TLS estrito por padrão; exceção existente continua restrita a certificado/host/empresa/execução/revisão e duração.
- Não apagar histórico nem alterar automaticamente contatos aprovados ou leads já entregues ao CRM.
- Canais pendentes não viram contatos confirmados do CRM.
- Manter o padrão visual YUX e rótulos comerciais.
- Publicar em main após testes e revisão; não fazer deploy automaticamente.

## Review Focus

1. Diretório com razão social correta e rodapé do editor: não promover o site, telefone ou redes do editor à empresa, nem como sugestão de canal próprio — testes nas tarefas 2 e 3.
2. Descoberta antiga com pesquisa corrente e alteração concorrente de campanha: permitir somente estado corrente comprovado, sem cobrança/escrita após detectar mudança — tarefa 1.
3. Dossiê antigo sem HTML/links e com revisão anterior: a projeção não inventa canais nem apresenta associação antiga como atual; histórico permanece acessível — tarefa 2.
4. Perfil vinculado que redireciona, exige login ou falha em TLS: impedir salto de autorização, registrar limitação e manter dados já obtidos — tarefa 3.
5. Troca de empresa/filtro/página e atualização assíncrona: resumo/dossiê/foco nunca passam a mostrar dados de outra empresa; seleção e estados não se perdem — tarefa 5.

---

## Mapa de responsabilidades

- Novo `backend/src/modules/radar/candidate-revision.ts`: elegibilidade corrente, sem modificar a revisão histórica.
- Novo `backend/src/modules/radar/public-presence.ts`: projeção de site/canais e sinais a partir de fatos atuais, sem rede ou IA.
- `research-service.ts`: coleta, associação, checkpoints, persistência da projeção e leitura compatível de dossiês anteriores.
- `contact-evidence.ts`: extrair e classificar canais publicados, incluindo formulário.
- Novo `public-social-evidence.ts`: leitura opcional delimitada de perfis ligados pelo site, sem descoberta recursiva.
- `business-activity.ts`: sinais de presença e atividade, sem confundir disponibilidade com operação.
- `repository.ts` / `routes.ts`: guardas e disponibilidade do complemento Brave, sem alterar configuração do provedor.
- Novo `frontend/src/lib/radar/radarPresenceSummary.ts`: normalizar apresentação defensiva dos campos opcionais e legados.
- `RadarResultsTable.tsx`: expansão local do resumo.
- Novo `RadarCandidateSummary.tsx`: resumo comercial reutilizável.
- `RadarWorkspace.tsx`: painel completo com foco/âncora, atualização de dados e erros corretos.
- `RadarCandidateResearchPanel.tsx`: canais e evidências com seus graus de confirmação.

## Task 1: Corrigir revisão e erro do complemento Brave

**Files:**
- Create: `backend/src/modules/radar/candidate-revision.ts`
- Modify: `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/routes.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts`, `frontend/src/services/radarService.ts`
- Test: `backend/tests/radar-licensed-brave.test.ts`, `backend/tests/radar-b2b-site-inspection.test.ts`, `frontend/src/components/radar/RadarWorkspace.test.tsx`

**Interfaces:**
- Produces: `isRadarCandidateCurrentRevision(payload: Record<string, unknown>, revision: number): boolean`. True when either positive integral discoveryRevision (legacy absent = 1) or researchRevision equals revision. Invalid revisions fail closed.
- Existing `enrichRadarCandidateWithLicensedBrave` signature stays compatible, including `expectedRevision`; UI supplies selected revision.
- Add read-only `GET /radar/candidates/:candidateId/brave-availability?organizationId=...` returning `{allowed:boolean,reasons:Array<{code:string,message:string,resolution:string}>}` after existing scope checks. Shares prerequisite validation with execution, excluding secret decryption/provider calls and excluding usage reservation.

- [ ] Write RED tests: discovery=1/research=5/campaign=5 permitted; discovery=1/research=4/campaign=5 blocked; malformed revisions blocked. Check revision/status again under lock before usage reservation; no provider invocation or reserved cost on conflict. No eligibility change for already reviewed/approved companies or disabled modules.
- [ ] Run `npm --prefix backend test -- tests/radar-licensed-brave.test.ts tests/radar-b2b-site-inspection.test.ts`; observe new assertions fail for expected cause.
- [ ] Implement shared revision predicate and read-only availability; reuse in enrichment and legacy site verification guards. Preserve source/license/key/quota/budget checks and final locked revision/status revalidation. Do not set discoveryRevision to researchRevision.
- [ ] Write RED UI tests for actual `radar_candidate_requires_current_discovery`, missing license, quota, provider failure and a successful enrichment followed by failed secondary refresh. Assert each gets accurate commercial copy; last remains successful with a refresh warning.
- [ ] Implement specific errors and separate action success from sidebar refresh errors. Fetch candidate-specific availability only when needed, without paid calls. Keep automatic research and advanced local complement clearly distinct.
- [ ] Rerun focused tests, type-check both packages; commit `fix(radar): align enrichment revision guards and actionable errors`.

## Task 2: Projetar e consolidar descoberta sem inventar confirmação

**Files:**
- Create: `backend/src/modules/radar/public-presence.ts`, `backend/tests/radar-public-presence.test.ts`
- Modify: `backend/src/modules/radar/research-service.ts`, `backend/src/modules/radar/company-projection.ts`, `backend/src/modules/radar/repository.ts`
- Modify: `frontend/src/types/radarResearch.ts`
- Test: `backend/tests/radar-research-service.test.ts`, `backend/tests/radar-research-persistence.test.ts`, `backend/tests/radar-legacy-projection.test.ts`, `backend/tests/radar-crm-delivery.test.ts`

**Interfaces:**
- `RadarPublicPresence = {version:1;configurationRevision:number;website?:{url:string;association:'confirmed'|'review';scope:'establishment'|'group'|'unresolved';readable:boolean;sourceUrl:string;observedAt:string};contacts:RadarContactEvidence[]}`.
- `projectRadarPublicPresence(input: {configurationRevision:number;discovery:RadarPresenceDiscovery;pages:RadarSiteEvidence[];contacts:RadarContactEvidence[];siteAssociation:'confirmed'|'review';presenceResolution?:RadarPresenceResolution}): RadarPublicPresence` (existing type from `presence-resolution.ts`).
- Persist as additive `normalized_payload.publicPresence`. Keep `websiteUrl`, `publicContacts`, `siteEmails`, `sitePhones` confirmed-only for compatibility. Tentative projection must never be treated as official by CRM, export or qualification.

- [ ] Write RED tests: legible candidate site survives as review with source/date; confirmed site projects consistently; directory CNPJ match excluded; conflicting establishment versus group stays distinct; no candidate site means not found in consulted sources, not nonexistent.
- [ ] Run focused tests and verify failing assertions.
- [ ] Implement pure projection, using only institutional candidate sources and current evidence. Persist atomically with the completed/partial dossier. Do not introduce an extra mutable site registry or database migration.
- [ ] Add compatibility tests for older dossier without HTML, association metadata, or current revision. Use stored contacts only with valid source/identity scope. Reading/listing never makes external calls or mutates records. Map older saved dossier to the additive projection on read; explicitly reanalyze to persist when requested.
- [ ] Implement compatibility on candidate list/detail and research reads with bounded batched loading of latest relevant dossier in `repository.ts`, not N+1 per row. Keep `projectRadarCompanyFacts` in `company-projection.ts` pure and source-filtering. Raw historical excerpts remain history, not promoted current facts. Preserve approved contacts/reviews and CRM idempotency.
- [ ] Run persistence/legacy/CRM tests and type-check; commit `fix(radar): preserve discovered presence separately from confirmed identity`.

## Task 3: Capturar canais, formulários e perfis públicos vinculados

**Files:**
- Modify: `backend/src/modules/radar/contact-evidence.ts`, `backend/src/modules/radar/research-service.ts`, `backend/src/modules/radar/site-evidence.ts`, `backend/src/modules/radar/search-configuration.ts`, `backend/src/modules/radar/company-projection.ts`
- Create: `backend/src/modules/radar/public-social-evidence.ts`, `backend/tests/radar-public-social-evidence.test.ts`
- Modify: `frontend/src/types/radarResearch.ts`, `frontend/src/lib/radar/radarSearchConfiguration.ts`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`
- Test: `backend/tests/radar-contact-evidence.test.ts`, `backend/tests/radar-research-service.test.ts`, `backend/tests/radar-research-persistence.test.ts`, `backend/tests/radar-search-configuration.test.ts`, `frontend/src/components/radar/RadarCampaignConfigurationForm.test.tsx`

**Interfaces:**
- Extend `RadarContactEvidence.kind` / `RadarResearchContact.kind` with `'contact_form'`; value = public form-containing page URL, not submission endpoint. Existing purpose/scope/source/date remain required or compatible as today.
- Optional provenance `linkedFromUrl?:string` for social-profile evidence and channels extracted from it. Confirmed association cannot exceed referring site's scope; pending site yields pending social facts.
- Add campaign `research.inspectLinkedSocialProfiles:boolean`, default false, same backend/frontend defaults. No additional page budget: public profile reads consume remaining `maxPagesPerCandidate`, `maxAttemptsPerCandidate` and existing deadline.
- `collectRadarPublicSocialEvidence(input:{linkedPages:RadarSiteEvidence[];remainingPages:number;remainingAttempts:number;deadlineAt:number}, dependencies:{inspect:typeof inspectRadarBusinessSite;signal?:AbortSignal}):Promise<Array<RadarSiteEvidence & {linkedFromUrl:string}>>`. Share the existing 110,000 ms reading deadline with institutional collection, not a fresh per-profile deadline; propagate optional `deadlineAt` to the existing collector dependencies.

- [ ] Write RED tests: readable unassociated institutional site yields pending phone/email/social/form, never confirmed; supplier form detected, newsletter/search/login/job application excluded; actual published profile accepted, sharer/editor attribution excluded; malformed href and hostile form action cannot trigger a request/submission.
- [ ] Run focused tests and confirm failure.
- [ ] Extract before identity association, then recompute association from current evidence. Preserve link-only facts across HTML stripping/reanalysis by checkpointing extracted contacts. Keep pending facts out of confirmed normalized fields and qualification input.
- [ ] Write RED social tests: only directly linked public profiles; no recursive follows, no login/captcha; foreign redirects and invalid TLS fail closed; no inheritance of site TLS grants; directory-linked publisher profiles excluded. Check budget/deadline and checkpoints prevent repeated reads on resume; reanalyze never fetches profiles.
- [ ] Implement optional bounded public profile reading via existing safe transport. Record observed profile URL/accessibility separately from active-account assertions. Retain useful source-grounded public contact text only, not generic social footer/help contacts. On ambiguous/profile-gated content, retain link plus limitation rather than email attribution. Update `projectRadarCompanyFacts` to preserve a social-source contact only when pipeline provenance links it to the associated institutional origin, with matching association/scope; absent or directory provenance still excludes it. Add projection/CRM regression tests for both cases.
- [ ] Add configuration UI with plain language and disclosure of page-limit sharing. No model/provider selection or paid invocation in this task.
- [ ] Run contact/pipeline/config/persistence suites and type-check; commit `feat(radar): retain sourced contact forms and linked public channels`.

## Task 4: Mostrar sinais úteis e pré-requisitos reais da análise

**Files:**
- Modify: `backend/src/modules/radar/business-activity.ts`, `backend/src/modules/radar/research-service.ts`
- Modify: `frontend/src/components/radar/RadarCandidateResearchPanel.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts`, `frontend/src/types/radarResearch.ts`
- Test: `backend/tests/radar-business-activity.test.ts`, `backend/tests/radar-research-availability.test.ts`, `frontend/src/components/radar/RadarCandidateResearchPanel.test.tsx`

**Interfaces:**
- Preserve activity statuses `conflicting|possible_closure|public_signals|inconclusive`; add optional `presenceSignals` with kinds `'accessible_site'|'published_contact'|'contact_form'|'linked_profile'`, source/date/excerpt and association/scope. Keep existing `signals` for dated operation/closure evidence and do not turn undated presence into `operation`.
- Extend `assessRadarBusinessActivity(evidence:RadarSiteEvidence[], contacts?:RadarContactEvidence[])` compatibly. Confirmation is evidence association, not verified real-world operation.

- [ ] Write RED tests: readable homepage+published phone+supplier form produces visible presence signals but no operation assertion; current dated publication distinct from observed date; old/future dates not recent; closure conflicts preserved; unassociated site clearly marked pending, not evidence of this establishment's operation.
- [ ] Run focused tests; implement signal calculation and presentation with exact source/date. Group pending identity, missing IA route, reading limitations and missing commercial qualification separately, without repeating generic missing-evidence claims when pages exist.
- [ ] Test missing identification route produces a visible Admin-only link to `/admin/ai` and explicit configuration guidance, without any runtime/model call. Missing route does not hide already collected facts. Do not copy global model into specific routes or weaken explicit-route guard.
- [ ] Run tests and type-check; commit `feat(radar): distinguish public presence from operating signals`.

## Task 5: Resumo junto à empresa e navegação ao dossiê

**Files:**
- Create: `frontend/src/lib/radar/radarPresenceSummary.ts`, `frontend/src/lib/radar/radarPresenceSummary.test.ts`
- Create: `frontend/src/components/radar/RadarCandidateSummary.tsx`, `frontend/src/components/radar/RadarCandidateSummary.test.tsx`
- Modify: `frontend/src/components/radar/RadarResultsTable.tsx`, `frontend/src/components/radar/RadarWorkspace.tsx`, `frontend/src/components/radar/RadarCandidateResearchPanel.tsx`
- Test: `frontend/src/components/radar/RadarResultsTable.test.tsx`, `frontend/src/components/radar/RadarWorkspace.test.tsx`

**Interfaces:**
- `buildRadarPresenceSummary(candidate:RadarCandidateRecord, revision:number): {website?:{url:string;label:string};contacts:RadarResearchContact[];presenceLabel:string;pending:string[]}`. Normalize legacy/unknown payload defensively; confirmed contacts first, pending contacts explicitly labeled, no raw registry phone masquerading as public contact.
- `RadarCandidateSummary({candidate,revision,onOpenFull}:{candidate:RadarCandidateRecord;revision:number;onOpenFull:(id:string)=>void})` renders the compact facts and Ver detalhes completos.
- Keep table `onOpen(id)` as full-panel callback but change Ver detalhes to toggle its own keyed inline summary row (`colSpan=5`, `aria-expanded`, `aria-controls`). Only Ver detalhes completos invokes `onOpen`.

- [ ] Write RED tests: expansion is immediately after the correct row and before next company; toggles closed; site under review not shown as absent; main channel/form links have safe URL handling and labels; no auto research request on expand.
- [ ] Run tests to confirm current behavior fails.
- [ ] Implement summary with existing YUX components/tokens. Use same projection labels in list and full panel. Keep technical raw evidence in collapsed history for Admin; do not show publisher channels as company channels.
- [ ] Write RED tests for filter/page change, removal/status change, loading and out-of-order responses; expanded candidate remains keyed correctly or closes when absent. Existing selected IDs, pagination and action guards preserved.
- [ ] Implement explicit full detail opening with a ref to a `tabIndex=-1` heading/container; focus and scroll after committed DOM update, with reduced-motion support. No unsolicited scrolling on async refresh or inline toggle. Closing returns focus to originating action when still visible.
- [ ] Run table/workspace/panel/summary tests, full frontend tests/build; commit `feat(radar): expand company summaries inline and anchor full details`.

## Task 6: Jornada integrada, revisão e publicação

**Files:**
- Modify: `backend/tests/integration/radar-research-journey.test.ts`
- Create: `frontend/tests/journeys/browser/radar-presence-summary.pw.ts` using the existing `frontend/playwright.config.ts` and local acceptance harness; no second browser framework.

- [ ] Add real local SQL journey: old discovery/current research, found site pending, form/social suggestions, confirmed association through mocked authorized runtime, atomic projection update, no-contact CRM leakage while pending, approved-record preservation and concurrent revision change.
- [ ] Run backend unit tests/build/type-check; run Radar SQL integration on the existing isolated test database only. Run frontend full tests/build/bundle budget and release verifier. Use existing package scripts and repository Python runtime tests if its contracts are changed; no provider access.
- [ ] Browser QA local with fake credentials and providers: list → inline summary → full details/focus → refreshed dossier → same site/canals in all surfaces; desktop and narrow viewport; keyboard navigation, reduced motion, pagination and selection. Record console health and screenshots outside repo. Do not use production action buttons.
- [ ] Run one fresh whole-branch review as required by the preserved native execution workflow. Address important findings and rerun impacted suites.
- [ ] Self-audit changed files against approved scope; report any skipped external-social fetch due to public access restrictions. Ensure no fake credentials, temporary fixtures, screenshots or test servers are committed.
- [ ] Fetch remote main, verify integration is non-destructive and resolve only task-related conflicts. Publish verified commits to main using non-force push; show commit hash. No automatic deploy, paid pilot, or production configuration changes.

## Recovery / activation after deploy

- Existing dossier projection should immediately show a found site as pending without consuming credits. A persisted repair uses explicit Reavaliar com os dados salvos, not a new discovery. Old stripped HTML cannot supply lost social links; reading those requires an explicit refresh and any currently needed TLS authorization.
- Admin must choose/save the two Radar IA routes before semantic identity/qualification can complete. If the user wants the currently configured global model copied into those routes, obtain explicit authorization naming the model; never infer from this plan.
- Linked-profile reading is optional and starts disabled. Enabling it shares the current page/attempt limits and does not remove public-access restrictions.
- A pilot of one selected company is a separate authorized action after deploy, with costs/limits shown; not part of the free local verification.

## Self-review

- Coverage: all ten requirements mapped to tasks 1–6; preserved existing TLS, billing, routing, historical review and CRM protections.
- Interfaces: additive publicPresence and contact_form propagate backend/frontend; existing confirmed-only fields remain compatible. Confirmed source filtering lives in the existing `company-projection.ts`; presence-resolution types and Playwright paths were verified in the repository.
- Review Focus: each of the five listed conditions has explicit regression assertions in its owning task.
- Approved by the user on 2026-10-14. Native implementation and final independent review completed; no paid model selection or production deployment is implied.

## Verificação da execução — 14/10/2026

- Backend: 936/936 testes; frontend: 658/658 testes; PostgreSQL isolado/RLS: 18/18; jornadas Chrome desktop 1280×900 e tela estreita 430×920: 2/2.
- Builds backend/frontend, orçamento do bundle e verificador do manifesto: aprovados. Nenhum provedor pago foi acionado; produção não foi modificada.
- Jornada visual: lista → resumo abaixo da própria empresa → contatos/formulário com fonte e vínculo pendente → detalhes completos com foco/rolagem → fechar e retornar ao botão. Página correta, conteúdo visível, sem sobreposição de erro de framework e sem erros de execução de página nas jornadas. Verificadas também as dimensões do resumo para evitar corte horizontal no celular.
- Ambiente: API local 4182, frontend 4174 e PostgreSQL 55439. Playwright do projeto com Chrome já instalado; pacote headless da versão corrente não estava disponível, sem instalar dependências novas.
- Uma revisão independente de todo o intervalo apontou seis achados importantes, nenhum crítico ou menor. Corrigidos em uma passada com regressões RED→GREEN: gravação Brave após mudança de revisão/aprovação; perda de dados de pesquisa concorrente; restauração indevida de diretório pelo snippet; confirmação antiga apresentada como corrente; resumo cortado no celular; retorno assíncrono de outra campanha. Nenhum comportamento foi recusado como fora de escopo pelo revisor.
- Ajustes ao plano: contexto opcional de presença no classificador para separar presença pendente de atividade confirmada (risco coberto: classificação incorreta); resumo ocupa as seis colunas reais da tabela, não cinco (risco coberto: desalinhamento visual).
- Lint: o baseline já tem pendências em imports não usados `RadarSearchConfiguration`, `Building2`, `buildRadarPlaceSearchDefaults`, `getRadarCampaignStatusLabel` e dependência do hook `refreshCampaignSidebars`; confirmadas no código-base anterior. Não foi ampliado o escopo para limpar esse legado; o aviso novo de export de constante foi removido.
- Limitações: perfis sociais continuam sujeitos ao acesso público e ao limite de páginas; não há login, contorno de CAPTCHA nem herança da exceção TLS do site. Rotas de IA continuam sob escolha/autorização do Admin. Dossiês antigos sem HTML não inventam links perdidos: uma nova leitura exige atualização explícita e eventual autorização TLS válida.
- Evidências visuais fora do repositório: `C:/Users/andre/.codex/visualizations/2026/09/05/01a073a7-4539-7ec2-9329-8bedecbe99a5/radar-presenca-2026-10-14/resumo-1280.png` e `resumo-430.png`.
- Comandos principais: `npm --prefix backend test`; `npm --prefix frontend test`; `npm --prefix backend run test:integration -- tests/integration/radar-research-journey.test.ts tests/integration/radar-crm-delivery.test.ts tests/integration/radar-tls-exceptions.test.ts`; `npm --prefix frontend run test:journeys -- radar-presence-summary.pw.ts`; builds de ambos os pacotes; `npm --prefix backend run verify:remediation-release`.

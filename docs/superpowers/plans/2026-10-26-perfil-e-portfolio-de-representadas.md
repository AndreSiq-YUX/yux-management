# Perfil e portfólio de representadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Identificar como o cliente atua e organizar várias empresas representadas, suas fontes e produtos no mesmo workspace.

**Architecture:** Estender perfil e catálogo existentes, mantendo representante como cliente e fabricantes como relações comerciais. Vincular fontes e produtos sem duplicar seus cadastros. O Harness consome portfólio relevante e a estratégia persistente pode referenciar as representadas.

**Tech Stack:** PostgreSQL 17, Fastify/TypeScript, React/Vite, Python e testes existentes. Reusar extração/curadoria; sem novo provedor.

**Spec:** `docs/superpowers/specs/2026-10-26-estrategia-da-empresa-e-representadas.md`, seção 8, com restrições das seções 2, 6 e 9–11.

## Global Constraints

- "Reutilizar `industry` como ramo/segmento."
- "Desmarcar um modelo oculta a seção contextual, mas não apaga representadas, produtos, fontes ou histórico."
- "Relações são confirmadas pelo usuário; não presumir que o representante vende todo catálogo de um fabricante."
- "Nunca aplicar nome, logo, contatos ou identidade do fabricante ao perfil principal do representante."
- "Imagens do catálogo não se tornam automaticamente arquivos aprovados para envio."
- Cumprir `AGENTS.md`; zero chamadas pagas, alterações de cliente real, deploy ou ampliação de acesso no trabalho local.
- Executar após a fundação de estratégia do plano `2026-10-26-estrategia-persistente-da-empresa.md`; o cadastro pode ser homologado isoladamente, mas os links de estratégia usam aquele contrato.

## Review Focus

- Empresa representa e distribui ao mesmo tempo: selecionar ambos sem criar tenants/contratos adicionais. Task 1.
- Mesmo nome de produto em duas marcas ou embalagens: não fundir por nome. Task 2 e Task 3.
- Usuário muda tipo de atuação: dados anteriores continuam recuperáveis e não são apagados. Task 1.
- Importação de fabricante tenta substituir identidade do representante: alvo explícito limita campos e preserva perfil. Task 3.
- Produto relevante está depois dos dez primeiros ou tem região diferente: recuperação por relevância e marca conserva limitações. Task 4.

---

## Mapa de arquivos

Backend: modificar `backend/src/modules/company-intelligence/{types,routes,repository}.ts`; novos `represented-businesses.ts`, `represented-business-schemas.ts`, `portfolio-context.ts` no mesmo módulo. Migrations aditivas `backend/src/db/migrations/0243_company_represented_portfolio.sql` (Task 1), `0244_company_represented_portfolio_links.sql` (Task 2) e `0245_company_portfolio_context.sql` (Task 4), confirmando números livres antes da execução. Não editar migration aplicada nas tarefas anteriores. Modificar `backend/src/jobs/handlers/company-intelligence.ts` e a aplicação de sugestões, preservando o fluxo de site próprio.

Frontend: modificar `frontend/src/types/{companyIntelligence,marketingStudio}.ts`, `frontend/src/services/{companyIntelligenceService,marketingStudioService}.ts`, `frontend/src/components/company-intelligence/{CompanyProfileForm,WebsiteOnboardingCard,KnowledgeCreateDialog,KnowledgeLibrary}.tsx`; criar `RepresentedBusinessesSection.tsx`, `RepresentedBusinessEditor.tsx` e `RepresentedProductsEditor.tsx` no mesmo diretório. O editor usa a tabela e serviço de produtos existentes; não cria um segundo catálogo. Na base examinada há `createProductService` em `marketingStudioService.ts` e visualização em `MarketingStudioWorkspace.tsx`, mas não um editor de produto dedicado a reutilizar.

Runtime: modificar `customer_context.py`, `runtime_store.py`, `workflow.py`; criar `portfolio_context.py`. Estratégia: estender schemas de referências, validação de tenant e UI das Tasks 1–4 do primeiro plano.

### Task 1: Tipo de atuação e cadastro de representadas

**Interfaces:** `CompanyProfileInput.businessModels:Array<'service_provider'|'retailer'|'manufacturer'|'commercial_representative'|'distributor'|'other'>` com padrão `[]`. `RepresentedBusinessInput={name,relationshipType:'representation'|'distribution'|'both',websiteUrl?:string,description,serviceRegions:string[],authorizedLines:string[],commercialConditions:string,status:'active'|'paused'|'archived'}`. Campos textuais usam limites do perfil; name 2–200; site público validado na extração, não obrigar site no cadastro. Todas as entidades levam organização/cliente do servidor e `version` para concorrência.

API raiz `.../organizations/:organizationId/represented-businesses`: GET lista; POST cria; PUT `/:id` com `{expectedVersion,...input}`; POST `/:id/archive` com versão. Não deletar em cascata por mudança de modelo.

**Files/tests:** arquivos de perfil, novos schemas/repository/componentes; `backend/tests/represented-businesses.test.ts`, `backend/tests/integration/represented-businesses.test.ts`, `frontend/src/components/company-intelligence/RepresentedBusinessesSection.test.tsx` e teste existente de CompanyProfileForm.

- [x] **Step 1: Escrever RED:** leitura de perfil legado resulta businessModels=[], representante sem site é válido, múltiplos modelos coexistem, mudança de modelo preserva dados, membro não altera e empresa B não acessa relação de A por HTTP.

  ```ts
  expect(legacyProfile.businessModels).toEqual([])
  expect(saved.businessModels).toEqual(['commercial_representative', 'distributor'])
  expect(afterModelChange.representedBusinesses.map(item => item.id)).toContain(representedId)
  expect(foreignOrganizationRead.statusCode).toBe(404)
  ```
- [x] **Step 2: Rodar RED:** backend `npm test -- tests/represented-businesses.test.ts`; frontend `npm test -- src/components/company-intelligence/RepresentedBusinessesSection.test.tsx src/components/company-intelligence/CompanyProfileForm.test.tsx`.
- [x] **Step 3: Implementar migration, rotas e UI** com RLS/escopo e CAS de versão; businessModels opcional nas escritas legadas preserva valor atual quando omitido. Exibir Como a empresa atua e reaproveitar Segmento; seção de representadas contextual com acesso aos registros existentes mesmo fora desses modelos. Dados não são inferidos de nomes de empresas.
- [x] **Step 4: GREEN e integração real**, quatro perfis e HTTP direto: `npm run test:integration -- tests/integration/represented-businesses.test.ts`; type-check de backend/frontend.
- [x] **Step 5: Commit:** `feat(company): model business roles and represented businesses`.

### Task 2: Vínculos do catálogo, fontes e estratégia

**Interfaces:** `marketing_products_services.represented_business_id` e `knowledge_sources.represented_business_id` são opcionais, com FK composta por organização. DTOs acrescentam `representedBusinessId?:string`. `CompanyStrategyContentV1.references` ganha `representedBusinessIds:string[]`, padrão [], máximo 100 únicos; pertencimento e status validados. Produtos/fonte legados sem vínculo continuam funcionando. Metadata de produto aceita explicitamente `sku?,packaging?,storageConditions?,serviceRegions?,commercialAvailability:'confirmed'|'unconfirmed'` para distinguir condições sem supor disponibilidade.

Definir `RepresentedProductInput={name:string,category?:string,description:string,valueProposition?:string,targetAudience?:string,proofPoints:string[],objections:string[],cta?:string,status:'active'|'paused'|'archived',details:{sku?:string,packaging?:string,storageConditions?:string,serviceRegions?:string[],commercialAvailability:'confirmed'|'unconfirmed'}}`. `details` é convertido para metadata com whitelist, preservando outras chaves legadas no servidor. Criar `upsertRepresentedProduct(db:pg.Pool,access,{productId?:string,representedBusinessId:string,expectedUpdatedAt?:string,input:RepresentedProductInput}):Promise<MarketingProductService>` e rota PUT `.../represented-businesses/:id/products/:productId`/POST `.../represented-businesses/:id/products`. Atualização exige expectedUpdatedAt; conflito retorna 409. Input não aceita organization/client/contract arbitrários: contrato é resolvido e validado no workspace. O editor usa essas rotas para vínculos novos; manter o serviço antigo para operações legadas e atualizar sua whitelist explícita de payload. Não liberar `represented_business_id` por mass assignment no endpoint genérico de dados.

**Files/tests:** migration aditiva 0244 do mapa, repositórios/tipos/editores de produto e conhecimento; schemas de estratégia; `backend/tests/represented-portfolio-links.test.ts`, `backend/tests/integration/represented-portfolio-links.test.ts`, `frontend/src/components/company-intelligence/RepresentedBusinessEditor.test.tsx`.

- [x] **Step 1: Escrever RED:** produto homônimo de duas marcas permanece distinto; vínculo cruzado entre organizações falha; produto sem representada continua válido; arquivar fabricante preserva histórico mas o retira do portfólio ativo; estratégia não aceita ID estrangeiro.

  ```ts
  expect(products.filter(item => item.name === 'Lasanha').length).toBe(2)
  expect(new Set(products.map(item => item.representedBusinessId)).size).toBe(2)
  expect(foreignProductLink.statusCode).toBe(404)
  expect(legacyProduct.representedBusinessId).toBeUndefined()
  ```
- [x] **Step 2: Rodar RED:** `npm test -- tests/represented-portfolio-links.test.ts` em backend; teste frontend da tarefa.
- [x] **Step 3: Implementar relações e UI** com filtros por marca/linha e contagem de produtos/fontes; origem não substitui revisão/publicação documental. Não mover produto para outra organização nem publicar automaticamente conteúdo. Preservar campos e metadados existentes em updates parciais.
- [x] **Step 4: GREEN**, integração com banco real e teste de produto/estratégia legados. Não renomear cliente real Vilma automaticamente.
- [x] **Step 5: Commit:** `feat(company): link products and knowledge to represented businesses`.

### Task 3: Importação com alvo explícito e revisão do portfólio

**Interfaces:** `WebsiteOnboardingInput.target={kind:'own_company'}|{kind:'represented_business',representedBusinessId:string}`; omissão equivale ao comportamento legado own_company. Represented target aceita sugestões de `representedBusiness.description|authorizedLines` e produtos vinculados; nunca profile/brand principal. Registrar target no run e validá-lo novamente ao aplicar. Produtos importados levam `sourceUrl,sourceRunId,sourceProductRef?` em metadata validada; atualização é proposta, não substituição de dado confirmado.

**Files/tests:** `WebsiteOnboardingCard.tsx`, handlers e aplicação de sugestões existentes; `backend/tests/represented-website-onboarding.test.ts`, frontend `WebsiteOnboardingCard.test.tsx`.

- [x] **Step 1: Escrever RED:** fonte representada não altera razão social/site/logo do representante; mudança de alvo no apply é recusada; mesma referência de fonte/SKU não duplica; mesmo nome com embalagem/marca diferente não é fundido; tentativa de aplicar relação de outra conta falha.

  ```ts
  expect(profileAfterImport.tradeName).toBe('Representante de teste')
  expect(profileAfterImport.websiteUrl).toBeUndefined()
  expect(brandAfterImport.visualIdentity).toEqual(brandBeforeImport.visualIdentity)
  expect(importedProduct.representedBusinessId).toBe(selectedRepresentedId)
  expect(productsAfterSameSourceReplay.length).toBe(productsBeforeReplay.length)
  ```
- [x] **Step 2: Rodar RED:** backend `npm test -- tests/represented-website-onboarding.test.ts`; frontend `npm test -- src/components/company-intelligence/WebsiteOnboardingCard.test.tsx`.
- [x] **Step 3: Implementar target na UI/run/aplicação**, whitelist de campos por alvo e conciliação por referência estável. Sem identidade estável, mostrar sugestões de possíveis duplicados e deixar confirmação comercial. No curador, descrever a relação sem assumir autorização para toda linha do fabricante.
- [x] **Step 4: GREEN com leitor/curador simulados** e regressões de importação de site próprio. Catálogo em PDF usa vínculo de fonte e curadoria existente; não prometer que extraiu imagens. Uma execução paga real exige autorização separada.
- [x] **Step 5: Commit:** `feat(company): scope website imports to represented businesses`.

### Task 4: Portfólio relevante no Harness e homologação conjunta

**Interfaces:** store `retrieve_company_portfolio(*,organization_id,contract_id,profile_key,query,represented_business_ids,offset=0,limit=20,audience)->{items,total,coverage,representedBusinesses}`; SQL `private.get_company_portfolio_context_v1(target_organization_id uuid,target_contract_id uuid,target_profile_key text,target_audience text,target_query text,target_represented_business_ids uuid[],target_offset integer,target_limit integer) RETURNS jsonb`. Validar sessão e contrato como na Task 3 do primeiro plano; preservar contrato e visibilidade de cada produto/documento. Sem SELECT irrestrito de observações comerciais para audiência externa. `portfolio_context` acompanha `company_strategy_context` no payload do provedor; não depender dos primeiros dez produtos. Contexto compacto traz marca/linha, produto, aplicação, restrições e origem publicada quando houver. Produto não revisado é candidato, não disponibilidade confirmada.

**Files/tests:** migration aditiva 0245 do mapa, `portfolio-context.ts`, runtime novo/context/store/workflow, referências no domínio de estratégia; `tests/test_portfolio_context.py`, `backend/tests/integration/represented-portfolio-context.test.ts`; atualizar `docs/company-intelligence-operations.md` e runbook de estratégia.

- [x] **Step 1: Escrever RED:** produto 31 relevante é recuperado; duas marcas preservam nomes/embalagens/restrições; uma região-alvo não vira cobertura de entrega; dados internos não passam ao SDR; marca arquivada sai do contexto novo e permanece na auditoria; conta estrangeira e contrato adulterado são recusados.

  ```python
  assert product_31_id in [item['id'] for item in relevant['items']]
  assert relevant['items'][0]['representedBusinessId'] == expected_brand_id
  assert 'Margem interna' not in json.dumps(external_context, ensure_ascii=False)
  assert unknown_delivery['commercialAvailability'] == 'unconfirmed'
  ```
- [x] **Step 2: Rodar RED:** runtime `python -m pytest tests/test_portfolio_context.py -q`; backend teste de integração da tarefa.
- [x] **Step 3: Implementar recuperação paginada/relevante**, preferindo produto/representada selecionados por refs validadas; compor resumo de linhas para estratégia ampla. Encaminhar dados na requisição real ao provedor simulado. Manter doutrina global comum a todas as contas e perfil do representante como identidade principal.
- [x] **Step 4: GREEN e jornada local:** empresa sintética com duas representadas e mais de 30 produtos → publicar contexto → estratégia em Missões → salvar/publicar → conteúdo segmentado → SDR com orientação correta. Repetir sites YUX e oficina sem representadas. Não executar pesquisas nem enviar WhatsApp em produção.
- [x] **Step 5: Verificar checks** de backend/frontend/runtime afetados e jornadas do primeiro plano; documentar biblioteca visual/envio de anexos como fora deste incremento. Entregar diff, evidências e instruções de implantação; não afirmar disponibilidade em produção antes de deploy/homologação autorizados.
- [x] **Step 6: Commit:** `feat(harness): ground agents in represented portfolios`.

## Autorrevisão do plano

Tarefas cobrem atuação, relações, fontes, importação e recuperação. Reaproveitam perfil/produtos/base atuais e a estratégia do primeiro incremento. Extração visual automática, catálogo de mídia e automação comercial completa ficam para entrega posterior. Implementação local executada; a implantação em produção depende de autorização e homologação próprias.

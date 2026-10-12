# Radar: enriquecimento verificável e porte configurável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a leitura e a retomada da pesquisa e produzir um dossiê útil da empresa, com contatos por finalidade e avaliação opcional de porte, sem especializar o sistema em uma empresa, cidade ou segmento.

**Architecture:** Manter descoberta, confirmação de identidade, coleta de fatos e avaliação para a oferta como etapas distintas. Reaproveitar buscas já pagas, reler apenas páginas com falhas recuperáveis e consolidar fatos com fontes e datas. O porte será um módulo opcional e configurável da campanha, separado da aderência comercial e da confiança das evidências.

**Tech Stack:** Node.js 22, TypeScript, Vitest, PostgreSQL/JSONB, React e runtime Python existente, com roteamento de LLM pelo Admin.

**Spec:** Solicitação do usuário de 12/10/2026 nesta conversa; complementa `docs/superpowers/plans/2026-10-08-radar-aprofundamento-automatico.md`. Requisitos: descoberta automática do site; aprofundamento em páginas oficiais; contatos relevantes ao objetivo da campanha; descrição, soluções, públicos e regiões; sinais opcionais de tamanho para priorização; nenhuma pesquisa engessada em Viva Food ou cozinhas industriais.

## Global Constraints

- Não executar consultas pagas nem trocar modelos/provedores nesta implementação sem autorização do usuário; testes usam fixtures e clientes simulados.
- Preservar roteamento e fallbacks manuais do Admin; não inserir modelo fixo nem herdar silenciosamente um modelo global neste caso de uso.
- Não enviar mensagens, e-mails ou iniciar atendimento; o resultado é uma lista pesquisada para revisão e contato manual.
- Preservar SSRF, validação de DNS/IP, isolamento por organização, robots.txt, licenças confirmadas, quotas, orçamento e registros já aprovados.
- Não exigir nova confirmação de licença ou referência contratual além do fluxo já aceito pelo usuário.
- Manter limites existentes de chamadas pagas; alterar limites só pela configuração explícita, não como consequência de corrigir um erro.
- Não concluir “não tem site”, “está fechado”, “aceita WhatsApp” ou “quer comprar” por ausência de evidência.
- Capital social não é faturamento; natureza jurídica e idade isoladas não comprovam tamanho. Não classificar S.A. automaticamente como empresa grande.
- Não misturar contatos de filiais, do grupo e do estabelecimento pesquisado; explicitar o escopo da associação.
- Trabalhar no worktree de Radar, sem incluir alterações de WhatsApp do checkout principal.

## Evidências do diagnóstico (não equivalem a validação em produção)

- Reprodução local em Node 22.16.0: o transporte com `lookup: (_hostname, _options, callback) => callback(null, address, 4)` recebe `all: true` e falha com `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined`. O código mascara essa falha como `robots_unavailable`.
- O `robots.txt` público do Viva Food respondeu HTTP 200 com o mesmo User-Agent usando transporte válido e permite a leitura pública geral.
- Leitura pública de metadados: homepage com 728.010 bytes e `/contato` com 681.682 bytes; o leitor atual limita HTML bruto a 200.000 bytes.
- `readingComplete` pode ser gravado mesmo com todas as páginas falhando; retomar um resultado parcial reutiliza esse marcador.
- A identidade sem CNPJ exige endereço cadastral inteiro ou telefone cadastral. Abreviações, complemento e telefone público atualizado podem impedir a associação correta.
- O normalizador CNPJá preserva abertura, mas atualmente descarta capital e natureza jurídica; consultas antigas podem exigir atualização autorizada para recuperar esses campos.
- O qualificador atual avalia oferta/segmento; não possui saída estruturada para resumo, serviços, regiões, finalidade do contato ou porte. O print não identifica a causa concreta da pendência semântica; não presumir que o Admin continua sem rota.
- Fontes públicas consultadas em 12/10/2026: https://www.vivafood.com.br/ e https://www.vivafood.com.br/a-viva-food. O site publica `suprimentos.alimentares@vivafood.com.br` para fornecedores e `(11) 99726-1001` como telefone. Esses fatos não comprovam atendimento ou intenção de compra.

## Review Focus

- Callback DNS com `all: true`, múltiplos IPs e redirecionamento: corrigir o transporte sem permitir segunda resolução não validada.
- Páginas modernas grandes, conteúdo minúsculo ou conexão interrompida: separar limite de transporte do limite de texto e não tratar erro local como proibição do site.
- Homônimos, CNPJ de filial diferente e múltiplos domínios: evitar confirmação por marca ou primeiro resultado isoladamente.
- Retomada após falha ou resposta paga incerta: recuperar apenas trabalho seguro, sem duplicar cobranças ou conservar conclusões antigas inválidas.
- Métricas ausentes, antigas ou relativas ao grupo: manter desconhecido, escopo e confiança explícitos, sem produzir precisão falsa ou rebaixar automaticamente empresas sem dados.

---

### Task 1: Leitor HTTP funcional e limitado

**Files:**
- Modify: `backend/src/modules/radar/b2b-site-inspection.ts`
- Test: `backend/tests/radar-b2b-site-inspection.test.ts`
- Create test: `backend/tests/radar-pinned-transport.test.ts`

**Interfaces:**
- Consumes: `inspectRadarBusinessSite(value, { resolve?, get? })` existente; manter compatibilidade.
- Produces: `createRadarPinnedLookup(address: string)` com contrato nativo `dns.LookupFunction`; `getRadarPublicPage(url: URL, address: string)` para testar o transporte sem substituir sua implementação.
- HTML bruto máximo de 2 MiB; robots máximo de 256 KiB; texto sanitizado permanece limitado a 20.000 caracteres. Timeout atual de 8 segundos preservado.

- [ ] **Step 1: Escrever regressões que falham.** Testar callbacks com `all: true` e `all: false`, garantindo apenas o IP previamente validado. Usar servidor HTTP local exclusivamente no teste direto do transporte, sem expor bypass de IP privado em `inspectRadarBusinessSite`. Aceitar fixture HTML de 750 KiB com conteúdo útil; rejeitar HTML acima de 2 MiB; manter bloqueio por robots e IP reservado. Testar interrupção da resposta e timeout.
- [ ] **Step 2: Executar testes e registrar falhas esperadas.** Em `backend`: `npm test -- tests/radar-b2b-site-inspection.test.ts tests/radar-pinned-transport.test.ts`.
- [ ] **Step 3: Corrigir callback, limites e diagnóstico.** Distinguir falha de transporte, robots indisponível, timeout e página grande sem expor informações sensíveis. Preservar host/SNI e fixação do IP público validado.
- [ ] **Step 4: Executar os mesmos testes e `npm run type-check`.** Esperado: PASS, inclusive SSRF, redirecionamentos e robots existentes.
- [ ] **Step 5: Commit isolado.** `fix(radar): repair pinned HTTP reads and bounded modern pages`.

### Task 2: Descoberta, identidade e retomada que recuperam trabalho útil

**Files:**
- Modify: `backend/src/modules/radar/site-discovery.ts`
- Modify: `backend/src/modules/radar/site-evidence.ts`
- Modify: `backend/src/modules/radar/research-service.ts`
- Modify: `backend/tests/radar-site-discovery.test.ts`
- Modify: `backend/tests/radar-site-evidence.test.ts`
- Modify: `backend/tests/radar-research-service.test.ts`
- Modify: `backend/tests/radar-research-persistence.test.ts`

**Interfaces:**
- Consumes: `RadarBusinessIdentity`, `RadarPresenceDiscovery`, `RadarSiteEvidence` e cache `run.calls` existentes.
- Produces: `compareRadarBusinessIdentity(identity, content)` retornando `{ association, scope, reasons }`, com `scope: 'establishment' | 'group' | 'unresolved'`; manter wrapper `matchRadarBusinessIdentity` para os consumidores atuais.
- Acrescentar versão do leitor ao checkpoint. Checkpoints antigos com páginas falhas não contam como leitura concluída; não invalidar buscas pagas completadas.

- [ ] **Step 1: Escrever testes de descoberta/identidade.** Marca + cidade/UF + rua/número normalizados devem reconhecer `Av.` versus `Avenida` e complemento diferente, sem depender de telefone antigo. Marca + cidade apenas não confirma. CNPJ diferente permanece pendente; indicação de grupo não confirma contatos de outra filial. Diretórios conhecidos são fontes secundárias, não site oficial; ranking não confirma identidade por si só.
- [ ] **Step 2: Escrever testes de coleta/retomada.** Priorizar homepage antes de links profundos; seguir páginas institucionais, soluções e fornecedores, evitando gastar todo orçamento em vagas/diretórios. Retomar resultado com `readingComplete: true` e `robots_unavailable` relê a URL e mantém chamadas web/local completadas intactas. Páginas válidas e recentes não são relidas sem necessidade. Não refazer chamada paga reservada/incerta. Limitar tentativas HTTP mesmo quando páginas falham.
- [ ] **Step 3: Executar os quatro arquivos de teste desta tarefa.** Esperado: regressões novas falham antes da implementação.
- [ ] **Step 4: Implementar priorização e confirmação explicável.** Usar comparação estruturada conservadora, não domínio/nome isolados. Separar tentativas falhas de páginas úteis sem permitir loop ilimitado. Permitir que resultado com site descoberto mostre “encontrado, confirmação pendente”, não “sem site”. Retentar somente falhas técnicas recuperáveis; não contornar robots ou autenticação.
- [ ] **Step 5: Corrigir retomada sem cobrança repetida.** Preservar buscas e qualificação concluídas apenas quando a evidência continua igual; usar hash das evidências para detectar mudança. Se nova avaliação por LLM for necessária, exigir autorização explícita com estimativa no painel; nunca repetir automaticamente uma chamada ambígua. Não apagar reservas para forçar repetição.
- [ ] **Step 6: Executar testes da tarefa, `npm test -- tests/radar-analysis-service.test.ts tests/radar-research-availability.test.ts` e `npm run type-check`.** Esperado: PASS, sem alterações em registros aprovados ou cruzamento de organizações.
- [ ] **Step 7: Commit isolado.** `fix(radar): recover failed research and corroborate official presence`.

### Task 3: Dossiê e contatos orientados ao objetivo, não a um caso fixo

**Files:**
- Modify: `backend/src/modules/radar/search-configuration.ts`
- Modify: `backend/src/modules/radar/contact-evidence.ts`
- Modify: `backend/src/modules/radar/research-service.ts`
- Create: `backend/src/modules/radar/company-profile.ts`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_qualification.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_radar_qualification.py`
- Modify: `backend/tests/radar-contact-evidence.test.ts`
- Create: `backend/tests/radar-company-profile.test.ts`

**Interfaces:**
- Consumes: páginas com identidade associada, roteiro/oferta da campanha e rota explícita `radar_business_qualification` existente.
- Produces: `RadarCompanyProfile` com `summary`, `services`, `customerSegments`, `operatingRegions` e `scaleSignals`; toda afirmação usa `{ value, evidenceId, sourceUrl, excerpt, observedAt, publishedAt?, scope }`. Campos sem evidência ficam ausentes com motivo, não inventados.
- Produces: `validateRadarCompanyProfile(raw: unknown, evidence: RadarSiteEvidence[]): RadarCompanyProfile` em `company-profile.ts`; validar IDs, URLs e trechos também no backend, sem aceitar texto livre como evidência validada.
- Acrescentar `research.profileEnabled: boolean` (padrão `false`) e `research.contactPurpose: 'general' | 'suppliers' | 'sales' | 'finance' | 'recruitment'` (padrão `general`). Alterar configuração incrementa a revisão existente.
- `RadarContactEvidence` recebe `purpose`, `purposeEvidence?` e `scope?`; finalidade vem do texto/estrutura próxima ao contato, não do nome do e-mail isoladamente. Sem contexto suficiente, usar `unknown`.

- [ ] **Step 1: Escrever testes.** Distinguir e-mail de fornecedores, comercial e RH na mesma página; WhatsApp de vagas não é WhatsApp comercial. Não misturar endereço de agência/autoria do site com contato do prospect. Site pode fornecer descrição útil sem provar receita, quantidade de unidades ou regiões. Alegações, números e regiões inventados pelo LLM são rejeitados por falta de trecho/ID válido. Conteúdo de páginas não pode alterar instruções do sistema ou acionar ferramentas.
- [ ] **Step 2: Executar `npm test -- tests/radar-contact-evidence.test.ts tests/radar-company-profile.test.ts` em `backend`; executar `python -m pytest tests/test_radar_qualification.py` no runtime com o ambiente do projeto.** Esperado: testes novos falham.
- [ ] **Step 3: Implementar perfil no qualificador existente.** Uma única chamada estruturada, quando autorizada, produz perfil e avaliação para a oferta; não criar cobrança escondida por uma chamada extra. Se perfil estiver desligado, manter contrato atual. Definir limites de saída compatíveis com o novo contrato e expor a estimativa da etapa antes de executá-la. Não trocar modelo nem escolher pago automaticamente.
- [ ] **Step 4: Persistir dossiê e contato por finalidade.** Fonte e finalidade acompanham os contatos no JSONB existente. Prioridade considera finalidade configurada e associação, não apenas frequência da repetição; manter todos os contatos, sem substituir o telefone cadastral pelo público silenciosamente.
- [ ] **Step 5: Executar testes Python/TypeScript e checagem de tipos.** Esperado: PASS com rota ausente, fallback autorizado, LLM desligado e respostas inválidas preservando fatos coletados.
- [ ] **Step 6: Commit isolado.** `feat(radar): add sourced company profiles and contact purposes`.

### Task 4: Porte opcional, configurável e separado de aderência

**Files:**
- Modify: `backend/src/modules/radar/search-configuration.ts`
- Modify: `backend/src/modules/radar/cnpjaClient.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Create: `backend/src/modules/radar/company-size.ts`
- Modify: `backend/src/modules/radar/research-service.ts`
- Modify: `backend/tests/radar-cnpja-client.test.ts`
- Modify: `backend/tests/radar-search-configuration.test.ts`
- Create: `backend/tests/radar-company-size.test.ts`

**Interfaces:**
- `research.sizeAssessment` recebe `{ enabled: boolean, direction: 'larger' | 'smaller', criteria: Array<{ metric, weight, maxAgeDays, bands: Array<{ min, points }> }> }`; padrão `{ enabled: false, direction: 'larger', criteria: [] }`. Limitar 6 critérios, pesos positivos e finitos, pontos entre 0 e 100, faixas ordenadas sem duplicações; `maxAgeDays` entre 1 e 3.650, padrão 365. Sem critérios definidos, não emitir pontuação. Faixas representam tamanho crescente; para direção `smaller`, inverter a contribuição como `100 - points`, sem exigir reescrita das faixas.
- Métricas: `employees`, `units`, `annualRevenue`, `annualMeals`, `capital`, `yearsActive`. Natureza jurídica e porte cadastral são fatos descritivos, não pontuação automática. Permitir peso zero removendo o critério da lista.
- Produces: `assessRadarCompanySize(policy, facts, now)` retornando `{ score: number | null, evidenceCoverage: number, direction, contributions, limitations }`; score ponderado apenas sobre critérios conhecidos; cobertura usa pesos de todos os critérios configurados. Sem fatos comparáveis, score `null`, nunca zero.
- Cada fato monetário informa moeda, ano de referência e escopo; dados não comparáveis, vencidos conforme `maxAgeDays` ou escopo não corroborado não entram no score. Data de observação da página não substitui data/período da métrica. Abertura calcula idade até `now`; demais métricas precisam de data de referência. Valor declarado, publicado e estimado permanecem distintos. Não estimar receita a partir de capital.
- Preservar capital, natureza jurídica e porte quando presentes na resposta CNPJá já obtida; não pedir novas consultas automaticamente para completar cadastros antigos.

- [ ] **Step 1: Escrever testes.** Capital diferente de receita; empresa S.A. sem métricas não ganha score; empresa antiga não se torna grande sem regra explícita; falta de informação não vira zero; dados do grupo não classificam automaticamente a filial; pesos/faixas/direção editáveis mudam o resultado sem alterar código. Métrica vencida ou sem período não recebe a data da visita como referência artificial. Score alto com pouca cobertura permanece identificado como frágil.
- [ ] **Step 2: Executar testes dos três arquivos desta tarefa.** Esperado: falhas novas antes da implementação.
- [ ] **Step 3: Implementar normalização e score determinístico.** LLM só extrai fatos com evidência; cálculo e critérios são do sistema. Não impor uma definição universal de pequena/média/grande nem regras específicas de um segmento.
- [ ] **Step 4: Limitar esta entrega a fontes já suportadas.** Extrair métricas publicadas em HTML e dados cadastrais disponíveis. Balanços em PDF ficam sinalizados com link e pendência quando não puderem ser lidos; não apresentar busca financeira exaustiva ou OCR como já implementados. Uma integração de documentos financeiros será uma etapa separada se necessária.
- [ ] **Step 5: Executar os testes, testes de persistência e `npm run type-check`.** Esperado: PASS e compatibilidade com campanhas antigas sem `sizeAssessment`.
- [ ] **Step 6: Commit isolado.** `feat(radar): add configurable evidence-based size prioritization`.

### Task 5: Painel útil, exportação e verificação do fluxo

**Files:**
- Modify: `frontend/src/lib/radar/radarSearchConfiguration.ts`
- Modify: `frontend/src/types/radarResearch.ts`
- Modify: `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`
- Modify: `frontend/src/components/radar/RadarCandidateResearchPanel.tsx`
- Modify: `backend/src/modules/radar/research-availability.ts`
- Modify: `backend/src/modules/radar/search-configuration.ts`
- Modify: `backend/src/modules/radar/b2b-delivery.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `frontend/src/components/radar/RadarCampaignConfigurationForm.test.tsx`
- Modify: `frontend/src/components/radar/RadarCandidateResearchPanel.test.tsx`
- Modify: `frontend/src/lib/radar/radarSearchConfiguration.test.ts`
- Modify: `backend/tests/radar-b2b-delivery.test.ts`
- Modify: `backend/tests/integration/radar-research-journey.test.ts`
- Modify: `docs/runbooks/radar-pesquisa-configuravel.md`

**Interfaces:**
- Painel consome `RadarCompanyProfile`, finalidade e escopo dos contatos e resultado de porte das tarefas 3/4. Configuração replica exatamente o schema backend.
- Acrescentar campos opcionais de exportação `companySummary`, `services`, `customerSegments`, `operatingRegions`, `supplierEmails`, `sizeScore`, `sizeCoverage`, `sizeEvidence`; manter colunas antigas e proteção contra fórmula em CSV.
- Disponibilidade e resultado apresentam bloqueios por etapa: configuração/rota ausente, orçamento/quota, falha técnica de leitura e resposta LLM incerta. Preservar código para suporte e exibir explicação acionável; não instruir usuário a aprovar tudo novamente.

- [ ] **Step 1: Escrever testes de configuração e apresentação.** Porte desligado em campanhas antigas; critérios/pesos/direção totalmente editáveis; fornecedor priorizado apenas quando configurado; score desconhecido aparece como “sem evidência suficiente”, não “empresa pequena”; site descoberto pendente não aparece como inexistente. Retomar leitura não promete ausência de custo quando há nova busca/LLM autorizada a executar.
- [ ] **Step 2: Escrever teste de jornada com dados simulados.** Empresa genérica de outro segmento e outra UF deve atravessar busca → leitor → associação → contatos por finalidade → perfil → score → persistência → exportação. Outra filial e outra organização não podem herdar evidências. Fixture Viva Food serve apenas como regressão adicional, nunca regra de negócio.
- [ ] **Step 3: Executar testes antes de implementar.** Em `frontend`, `npm test -- src/components/radar/RadarCampaignConfigurationForm.test.tsx src/components/radar/RadarCandidateResearchPanel.test.tsx src/lib/radar/radarSearchConfiguration.test.ts`; em `backend`, `npm test -- tests/radar-b2b-delivery.test.ts`; jornada usa `npm run test:integration -- tests/integration/radar-research-journey.test.ts` somente com banco de testes isolado.
- [ ] **Step 4: Implementar painel, validações e exportação.** Incluir descrição, atividade/serviços, públicos e regiões com fontes. Mostrar finalidade de cada canal, data observada, escopo e pendências. Exibir contribuição dos critérios de porte e cobertura separada da aderência à oferta. Não esconder dados bons porque outra etapa falhou.
- [ ] **Step 5: Executar regressão.** Backend: `npm test -- tests/radar-` e `npm run build`. Frontend: `npm test -- src/components/radar src/lib/radar` e `npm run build`. Runtime: testes de qualificação. Documentar qualquer suíte não executável, sem declarar PASS presumido.
- [ ] **Step 6: Revisar diff e publicar conforme autorização vigente.** Incluir apenas arquivos do Radar, plano e runbook. Não afirmar deploy concluído por push. Entregar commits e instrução de deploy; confirmar versão efetivamente implantada antes de teste em produção.
- [ ] **Step 7: Validar produção somente após autorização de consumo.** Primeiro retomar leitura pública usando buscas já salvas. Antes de qualquer nova busca/LLM, informar custo máximo, configuração/rota e pedir autorização se não estiver coberto. Conferir no resultado o contato de fornecedores e fontes; não apenas toast de sucesso. Parar no primeiro limite quebrado e registrar causa concreta.

## Handoff e decisões

- Nenhuma alteração funcional, chamada paga, commit de implementação ou deploy foi feita durante este diagnóstico/plano.
- Proposta de execução: implementação nativa nesta conversa, tarefa por tarefa; sem delegação não autorizada.
- Requer revisão do usuário antes da implementação conforme a habilidade de planejamento.
- O módulo de porte é opcional e suas faixas/pesos são configurados na campanha, não embutidos para este cliente. Não ampliar automaticamente a busca para balanços/OCR ou contratar serviços.

## Estado da implementação em 12/10/2026

O checklist acima preserva o roteiro original; o estado efetivamente verificado é registrado aqui.

- [x] Task 1: transporte nativo corrigido, limites separados e regressões com timeout/interrupção, sem remover DNS/SSRF/robots. Commit inicial `46934a5`; complemento do timeout absoluto incluído na entrega seguinte.
- [x] Task 2: retomada de leituras falhas, reaproveitamento de buscas concluídas e identidade corroborada; recuperação somente de leitura quando a quota/orçamento da busca se esgotou.
- [x] Task 3: perfil com fontes validadas, finalidade dos contatos e uma etapa conjunta de IA; rota e fallbacks do Admin preservados. Nova análise de evidências alteradas exige autorização explícita.
- [x] Task 4: porte opcional, critérios editáveis, cobertura separada, capital/idade cadastrais e ausência de pontuação para evidências incomparáveis.
- [x] Task 5: configuração, dossiê e exportação implementados; regressões automatizadas e builds executados. Jornada PostgreSQL ampliada, mas ignorada por ausência do banco isolado; não declarar validação real do SQL novo.
- [x] Publicação: commits funcionais `46934a5`, `b6a7556` e `090d6c9` enviados sem força para `main` e `codex/radar-brave-state-fixes`.
- [ ] Produção: deploy e piloto pago não realizados; dependem de versão implantada e autorização de consumo.

Não houve consulta paga, escolha de modelo novo, envio de contato ou mudança de configuração de produção. Leitura pública do Viva Food validou transporte, identidade e extração do contato de fornecedores sem Brave/Serper/LLM.

Resultado final local: 844 testes backend, 625 frontend e 277 runtime aprovados; um teste preexistente do runtime ignorado. Regressão Radar: 172 backend/34 frontend. Builds e orçamento de bundle aprovados. Lint comparativo aprovado, preservando baseline e dívida técnica preexistentes. Jornada PostgreSQL desta versão: 1 ignorada por ausência do banco exclusivo. Sem nova checagem visual de navegador. Instruções de configuração, recuperação e limites em `docs/runbooks/radar-pesquisa-configuravel.md`.

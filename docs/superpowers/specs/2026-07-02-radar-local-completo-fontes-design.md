# Radar Local Completo Por Fontes Design

## Objetivo

Completar o Radar Local por Nicho como produto operacional de captacao ativa
antes de iniciar o motor de empresas recem-abertas por CNPJ.

Esta fase transforma o Radar atual, que ja cria campanhas, empresas manuais,
analise, score, mensagem sugerida, revisao e conversao para lead, em um fluxo
local completo com fontes reais, runs rastreaveis, lote pequeno, deduplicacao
revisavel, custos, compliance e metricas por fonte.

## Decisao Aprovada

Seguir o caminho **vertical completo por fonte**.

Cada fonte deve funcionar ponta a ponta antes de partir para a proxima. A ordem
de entrega sera:

1. manual aprimorado;
2. CSV;
3. URL/site com Jina Reader quando habilitado;
4. busca web assistida limitada;
5. acoes em lote pequeno;
6. deduplicacao revisavel;
7. metricas por campanha e fonte.

## Fora Do Escopo Desta Fase

- Empresas recem-abertas por CNPJ.
- Ingestao mensal ou massiva da base CNPJ oficial.
- Compra ou uso obrigatorio de bases pagas.
- Google Places, mapas ou diretorios privados como dependencia obrigatoria.
- Scraping agressivo ou nao governado.
- Envio automatico de email, WhatsApp ou LinkedIn.
- Cadencias automaticas.
- Exposicao do Radar no Portal do Cliente.

## Principios

### Inteligencia Central

Nenhuma fonte do Radar pode ter prompts, agentes ou RAG isolados.

Toda analise de oportunidade, score, mensagem sugerida e decisao operacional
deve continuar usando:

- Strategy Engine;
- Agent Harness;
- Strategy Packs aprovados;
- RAG/retrieval auditavel;
- traces em `agent_execution_runs` e etapas relacionadas;
- `policyDecision` com `canSendAutomatically: false`;
- revisao humana obrigatoria.

### Backend Como Executor

O React nao executa scraping, enriquecimento pesado, IA ou jobs longos.

O frontend apenas:

- configura campanhas;
- seleciona fonte;
- envia arquivos/URLs/parametros;
- acompanha runs;
- revisa candidatos, duplicatas, mensagens e oportunidades;
- aprova, rejeita, descarta, registra opt-out ou converte para lead.

O backend/workers executam:

- parse de CSV;
- criacao de candidatos;
- enriquecimento provider-neutral;
- integracao Jina quando habilitada;
- busca web assistida quando houver provedor configurado;
- dedupe;
- custo/compliance;
- orquestracao com Harness.

### Limites Do MVP Completo

Mesmo completo para Radar Local, o sistema deve continuar conservador:

- lote maximo padrao: 10 empresas por acao;
- importacao CSV com preview e confirmacao;
- busca web assistida com limite diario por fonte e campanha;
- enrichment individual ou lote pequeno;
- custo diario por campanha e por fonte;
- nenhuma abordagem externa sem acao humana.

## Experiencia Do Produto

### Radar Workspace

A rota permanece:

`/client-workspaces/:organizationId/comercial/radar`

Visibilidade:

- apenas Growth Workspace interno;
- apenas `yux_admin`, `yux_operator` ou permissao `radar:manage`;
- nunca no Portal do Cliente;
- nunca para `client_admin` ou `client_user`.

### Estrutura Da Tela

A tela deve evoluir para quatro areas principais:

1. **Campanhas**
   - criar campanha local por nicho;
   - listar campanhas;
   - abrir campanha ativa;
   - mostrar limites, fonte principal, oportunidades e custo.

2. **Fontes Da Campanha**
   - manual;
   - CSV;
   - URL/site;
   - busca web assistida;
   - cada fonte mostra status, habilitacao, limite e observacao de termos.

3. **Candidatos E Oportunidades**
   - candidatos captados por fonte;
   - empresas normalizadas;
   - oportunidades por campanha;
   - status de enriquecimento, analise e revisao.

4. **Revisao E CRM**
   - analise externa preliminar;
   - evidencia;
   - score;
   - mensagem sugerida;
   - policy decision;
   - aprovar, rejeitar, opt-out, descartar ou converter para lead.

## Verticais De Fonte

### 1. Manual Aprimorado

O cadastro manual atual deve ser mantido, mas ampliado.

Campos:

- nome fantasia;
- razao social;
- CNPJ opcional;
- CNAE opcional;
- cidade;
- UF;
- site;
- email publico;
- telefone publico;
- fonte/URL de origem;
- observacao operacional.

Comportamento:

- validar pelo menos nome ou site;
- normalizar CNPJ, dominio e telefone;
- gerar `dedupe_key`;
- criar `radar_company_records`;
- criar `radar_opportunities`;
- criar evento `company_added`;
- criar compliance log;
- custo estimado zero;
- selecionar a oportunidade criada.

### 2. CSV

CSV e a primeira fonte de lote.

Fluxo:

1. operador escolhe campanha;
2. envia CSV;
3. frontend mostra preview local das primeiras linhas;
4. backend valida colunas e limite;
5. backend cria `radar_enrichment_runs` com provider `csv`;
6. backend cria ou atualiza empresas;
7. backend cria oportunidades;
8. backend registra eventos, custo zero e compliance;
9. UI mostra resultado importado, duplicatas e erros por linha.

Colunas suportadas:

- `trade_name`;
- `legal_name`;
- `cnpj`;
- `cnae_main`;
- `city`;
- `state`;
- `website_url`;
- `email_raw`;
- `phone_raw`;
- `source_url`;
- `notes`.

Limites:

- MVP completo: maximo 10 linhas por importacao;
- linhas acima do limite devem ser recusadas com mensagem clara;
- linhas invalidas devem aparecer no resultado sem abortar as validas.

### 3. URL/Site Com Jina Reader

Esta fonte parte de um site conhecido.

Fluxo:

1. operador informa uma URL ou lista pequena de URLs;
2. backend cria candidatos/empresas;
3. backend cria `radar_enrichment_runs` com provider `jina_reader` quando fonte habilitada;
4. se Jina nao estiver habilitado, registrar run `failed` com motivo governado e permitir fallback manual;
5. extrair sinais publicos:
   - titulo;
   - descricao;
   - email/telefone publico quando evidente;
   - canais citados;
   - formularios/CTA;
   - termos que indiquem nicho/oferta;
6. salvar em `radar_company_enrichment`;
7. rodar analise da oportunidade via Harness;
8. enviar para revisao humana.

Nao deve:

- seguir crawling profundo;
- coletar dados pessoais sensiveis;
- tentar burlar bloqueios;
- inferir contatos privados.

### 4. Busca Web Assistida

Busca web assistida descobre candidatos locais com parametros humanos.

Parametros:

- nicho;
- cidade;
- UF;
- palavras-chave;
- limite de resultados;
- fonte/provedor.

Fluxo:

1. operador confirma parametros;
2. backend valida se fonte esta habilitada;
3. backend cria `radar_enrichment_runs` com provider `jina_search` ou `web_search`;
4. backend limita resultados;
5. candidatos encontrados ficam em revisao antes de virar oportunidade aprovada;
6. cada candidato precisa de fonte URL, titulo e evidencia minima;
7. operador decide importar, descartar ou marcar duplicata;
8. candidatos importados seguem para enriquecimento e analise.

Limites:

- maximo 10 resultados por run;
- limite diario por campanha;
- limite diario por fonte;
- custo estimado registrado antes e depois da execucao.

### 5. Acoes Em Lote Pequeno

Lote pequeno permite operacao eficiente sem virar processamento massivo.

Acoes permitidas:

- enriquecer ate 10 oportunidades;
- analisar ate 10 oportunidades;
- descartar ate 10 candidatos;
- marcar opt-out individual ou em lote revisado;
- aprovar/rejeitar revisoes individualmente.

Regras:

- nenhuma conversao para lead em massa no MVP;
- nenhuma mensagem enviada em lote;
- cada item deve manter trace, evento, fonte e compliance.

### 6. Deduplicacao Revisavel

O backend deve criar candidatos de duplicidade quando detectar:

- mesmo CNPJ;
- mesmo dominio;
- mesmo telefone;
- nome parecido na mesma cidade/UF;
- decisao manual.

UI:

- lista duplicatas pendentes;
- mostra empresa principal e candidata;
- mostra tipo de match e confidence;
- permite confirmar, descartar ou mesclar.

Comportamento:

- confirmar duplicata nao deve apagar dados automaticamente;
- merge deve preservar eventos, fonte, compliance e oportunidades;
- dismissed impede que o mesmo par volte imediatamente como pendente.

### 7. Metricas

Metricas devem ser por campanha e fonte.

Indicadores:

- empresas captadas;
- candidatos pendentes;
- oportunidades criadas;
- duplicatas pendentes;
- enriquecidas;
- analise pendente;
- revisao pendente;
- aprovadas;
- rejeitadas;
- opt-outs;
- convertidas em lead;
- custo estimado;
- custo por fonte;
- conversao por fonte.

As metricas devem ser consultadas no backend e exibidas no Radar Workspace sem
calculo manual complexo no frontend.

## Contratos De API

Endpoints existentes permanecem:

- `GET /api/radar/campaigns`;
- `POST /api/radar/campaigns`;
- `POST /api/radar/campaigns/:id/companies`;
- `GET /api/radar/campaigns/:id/opportunities`;
- `GET /api/radar/campaigns/:id/metrics`;
- `POST /api/radar/opportunities/:id/run-analysis`;
- `PATCH /api/radar/opportunities/:id/review`;
- `POST /api/radar/opportunities/:id/opt-out`;
- `POST /api/radar/opportunities/:id/convert-to-lead`.

Novos endpoints esperados:

- `GET /api/radar/data-sources?organizationId=...`;
- `PATCH /api/radar/data-sources/:id`;
- `POST /api/radar/campaigns/:id/import-csv`;
- `POST /api/radar/campaigns/:id/import-urls`;
- `POST /api/radar/campaigns/:id/search-web`;
- `GET /api/radar/campaigns/:id/runs`;
- `POST /api/radar/opportunities/batch/enrich`;
- `POST /api/radar/opportunities/batch/analyze`;
- `GET /api/radar/campaigns/:id/duplicates`;
- `PATCH /api/radar/duplicates/:id`.

## Dados E Migrations

A migration `0107_radar_comercial_growth_workflow.sql` ja criou a base
necessaria. Esta fase deve preferir usar as tabelas existentes antes de criar
novas tabelas.

Possiveis ajustes incrementais:

- permitir `csv` em `radar_enrichment_runs.provider`;
- adicionar `radar_candidate_records` se a revisao de busca web exigir uma
  area intermediaria antes de `radar_company_records`;
- adicionar campos de resultado parcial em `radar_enrichment_runs` quando o
  JSONB atual nao for suficiente para metricas eficientes;
- criar indices para consultas por campanha, fonte, status e custo se os testes
  mostrarem necessidade.

## Harness E RAG

O workflow `commercial_radar_local_niche` continua sendo o workflow central.

Cada fonte deve enviar contexto estruturado para o runtime:

- campanha;
- fonte;
- empresa/candidato;
- evidencias;
- sinais extraidos;
- limites/custo;
- risco/compliance;
- retrieval context.

Output esperado:

- `summary`;
- `evidence`;
- `pain_hypotheses`;
- `recommended_offer`;
- `score`;
- `message`;
- `risk_flags`;
- `policyDecision`;
- `subagent_trace`;
- `supporting_cards`;
- `input_hash`.

## Compliance

Todo dado captado deve ter:

- `source_type`;
- `source_url` quando houver;
- data de coleta;
- compliance log;
- proposito;
- base legal operacional;
- opt-out possivel;
- retencao futura configuravel.

Nenhuma fonte deve ser habilitada no UI se o catalogo marcar `enabled=false`,
exceto para exibir estado bloqueado e motivo.

## Testes

Backend:

- rotas de data sources;
- CSV com linhas validas, invalidas e limite excedido;
- importacao de URLs;
- busca web assistida com fonte desabilitada e habilitada;
- lote pequeno;
- dedupe candidates;
- metricas por fonte;
- guards de role interna.

Frontend:

- regras de fonte habilitada/desabilitada;
- limite de lote;
- preview CSV;
- visibilidade interna do Radar;
- acoes por status da oportunidade;
- renderizacao de metricas.

Runtime:

- workflow Radar com contexto de fonte;
- `policyDecision.canSendAutomatically === false`;
- evidencia e subagent trace preservados;
- fallback quando contexto de fonte e incompleto.

## Criterios De Aceite

- Operador YUX consegue criar uma campanha local e captar empresas por manual,
  CSV, URL/site e busca assistida.
- Cada fonte registra run, custo, compliance e eventos.
- Nenhuma fonte executa se estiver desabilitada no catalogo.
- O lote pequeno impede mais de 10 itens por acao.
- Oportunidades captadas podem ser enriquecidas, analisadas, revisadas e
  convertidas para lead.
- Duplicatas aparecem para revisao humana.
- A UI mostra claramente fontes ativas, bloqueadas e planejadas.
- O Radar continua invisivel para clientes.
- Todos os outputs de IA passam pelo Harness e mantem envio automatico
  bloqueado.
- Build e testes backend/frontend/runtime passam.


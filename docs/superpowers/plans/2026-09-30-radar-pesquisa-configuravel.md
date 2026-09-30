# Pesquisa configurável do Radar Implementation Plan

> Implementação autorizada explicitamente pelo usuário. Execução neste chat, sem consumo de serviços pagos.

**Goal:** Permitir criar, editar e replicar pesquisas de quaisquer segmentos e regiões brasileiras pelo painel, retirando critérios fixos de cozinhas industriais do executor.

**Architecture:** Cada campanha armazena filtros de descoberta, critérios de qualificação, fontes, campos de entrega e tamanho dos lotes. Cursores e avaliações acompanham a versão da configuração. A migração preserva os critérios das campanhas já existentes como dados editáveis, sem aplicá-los a novas campanhas.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest.

**Spec:** Requisito explícito do usuário nesta conversa: todas as opções de pesquisa e qualificação devem ser editáveis pelo painel administrativo e reutilizáveis em outros casos.

## Global Constraints

- Nenhuma chamada externa paga durante implementação ou testes.
- Preservar campanhas locais existentes e dados já coletados.
- Segmento, UFs, cidades, CNAEs principal/secundário, termos de inclusão/exclusão, situação cadastral, datas, produtos, critérios de qualificação, fontes, campos e lotes são configurações da campanha.
- Alterar pesquisa inicia cursores da nova versão; alterar critérios exige nova avaliação antes de exportar registros aprovados.
- Mantêm-se credenciais e fontes administráveis nos controles existentes.

## Review Focus

- Campanha de outro segmento não deve consultar CNAE ou classificar pelas expressões de cozinhas industriais.
- Duas cidades na mesma UF devem ter paginação independente.
- Edição de configuração não pode reaproveitar cursor ou aprovação da versão anterior.
- Critérios vazios não devem confirmar todos os candidatos automaticamente.
- Campanha ou candidato de outra organização não pode ser editado pela rota de configuração.

### Task 1: Configuração persistente e edição

**Files:** `backend/src/modules/radar/search-configuration.ts`, `types.ts`, `routes.ts`, `repository.ts`, migração `0181_radar_configurable_search.sql`.
**Interfaces:** `RadarSearchConfiguration`, `buildRadarDiscoveryScopes(campaign)`, `PATCH /campaigns/:id`, `POST /campaigns/:id/duplicate`.
- [x] Definir configuração tipada sem valores de segmento fixos e validar filtros combinados.
- [x] Criar migração compatível, versão da configuração e cursores por recorte/versão.
- [x] Implementar criação/edição/duplicação administrativa, preservando candidatos e invalidando aprovações antigas quando necessário.

### Task 2: Execução e qualificação genéricas

**Files:** `cnpjaClient.ts`, `repository.ts`, `business-triage.ts`, `jobs/handlers/radar.ts`, `licensed-brave.ts`, `b2b-delivery.ts`.
**Interfaces:** executor usa configuração salva; classificador retorna `targetStatus`, aderência e razões pelas regras da campanha.
- [x] Aplicar filtros CNAE/nome/situação/data, cidades opcionais e lotes configurados na API.
- [x] Usar critérios positivos/negativos configurados e identidade observada na qualificação.
- [x] Usar termos configurados no enriquecimento e campos selecionados na exportação.
- [x] Verificar múltiplos segmentos/UFs/cidades e invalidação de versões com respostas simuladas.

### Task 3: Formulário e manutenção pelo painel

**Files:** `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`, `RadarWorkspace.tsx`, `types/radar.ts`, `services/radarService.ts`.
**Interfaces:** mesmo formulário estruturado para criar/editar; duplicação cria rascunho editável sem copiar resultados.
- [x] Disponibilizar todos os filtros e critérios em campos normais, sem exigir JSON.
- [x] Exibir os recortes configurados, executar próximos lotes e permitir editar/replicar campanha.
- [x] Retirar títulos, estados e classificações específicos de cozinhas da interface genérica.
- [x] Verificar contratos, formulário, compilação e testes relevantes.

## Evidências de validação

- Suíte completa: 768 testes backend e 595 frontend aprovados; builds aprovados e manifesto de migrações validado.
- Lint dos arquivos frontend alterados sem erros; baseline global não regrediu (problemas anteriores permanecem fora deste escopo).
- PostgreSQL embarcado local, sem banco de produção: migrações 0180/0181, preservação da campanha anterior, criação genérica, edição/duplicação, inspeção simulada, aprovação, progresso, bloqueio de versões antigas e cursores por cidade executados com êxito.
- Nenhuma consulta real a CNPJá/Brave nem chamada LLM paga. Deploy e amostra comercial real são etapas posteriores à publicação.

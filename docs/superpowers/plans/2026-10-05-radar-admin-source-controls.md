# Controles centrais das fontes do Radar — Implementation Plan

> **For agentic workers:** execução nativa nesta sessão, sem delegação. A skill executing-plans não está disponível; seguir os passos abaixo diretamente. A implementação já foi autorizada pelo usuário.

**Goal:** centralizar ativação, custo e limites das fontes implementadas em Admin → Integrações e ativar a pesquisa CNPJá com os valores existentes.

**Architecture:** adicionar leitura administrativa autenticada do catálogo de fontes, reutilizar a atualização existente e apresentar um painel independente junto aos provedores. O workspace mantém apenas consulta dos estados e link administrativo, sem duplicar configurações; licença, chave, ativação, orçamento e contratação do módulo permanecem controles separados.

**Tech Stack:** Fastify, PostgreSQL, React, TypeScript, Vitest e Playwright local.

**Spec:** aprovação do usuário nesta conversa: centralizar controles, corrigir mensagens e ativar CNPJá sem executar consultas.

## Global Constraints

- Não consultar APIs pagas nem alterar/reinserir chaves; não ativar Brave, Serper ou fontes legadas.
- Ativação operacional autorizada somente para pesquisa CNPJá, mantendo R$ 0,025 por chamada e 50 consultas/dia por organização já cadastrados.
- Admin controla fontes globalmente ou por organização quando houver registro específico; nenhuma permissão de cliente será ampliada.
- Manter confirmação por checkbox sem referência contratual; custos/limites continuam configuráveis, sem valores inventados.
- Não alterar migrations existentes nem o checkout primário com alterações do usuário; publicar em main conforme autorização vigente.

## Review Focus

- Não administradores não podem ler catálogo central nem configurar fontes protegidas.
- Fonte desativada não implica credencial ausente; fontes pagas sem custo mostram a pendência real.
- Catálogo global e registros específicos devem mostrar seu escopo sem sobrepor valores silenciosamente.
- Formulários não podem executar busca/teste de provedor ao salvar; falhas devem preservar os valores e permitir nova tentativa.
- Custos inválidos, limites fracionados e desativação devem ser testados sem consumir créditos.

### Task 1: catálogo e mensagens

**Files:** backend/src/modules/radar/{repository,routes}.ts; backend/tests/radar-routes.test.ts; frontend/src/services/radarService.ts; frontend/src/lib/radar/radarSourceRules{,.test}.ts.

**Interfaces:** `listRadarAdminDataSources(pool,user)` e GET `/api/radar/admin/data-sources` retornam fontes CNPJá pesquisa/consulta, Brave, Serper e OSM com nome/escopo de organização. `radarService.getAdminDataSources()` consome a rota. `getRadarSourceBlockedReason(source)` usa ativação e custo, nunca infere ausência de chave a partir de requiresSecret.

- [x] Escrever e executar testes inicialmente falhando: admin permitido, outros recusados antes da consulta, custo e desativação com mensagens reais.
- [x] Implementar as interfaces e executar testes até aprovação.

### Task 2: painel único

**Files:** criar frontend/src/components/platform/admin/RadarSourceManagementPanel{,.test}.tsx; modificar frontend/src/pages/platform/AdminIntegrationsPage.tsx e frontend/src/components/radar/RadarWorkspace.tsx; testes do workspace e integração.

**Interfaces:** `RadarSourceManagementPanel({providers})` carrega catálogo e reutiliza `radarService.updateDataSource(id,patch)`. Cartões permitem salvar custo/limite e ativar/desativar individualmente; mostram escopo, licença e conexão separadamente. Workspace aponta para `/admin/integrations#radar-sources` apenas para Admin e oferece atualização do catálogo sem busca externa.

- [x] Escrever testes de salvar, ativar, desativar, falha, valores inválidos, escopo e ausência de chamadas aos provedores.
- [x] Implementar painel, ligar à página e remover controles duplicados internos (incluindo OSM); atualizar documentação operacional.
- [x] Executar regressões, builds, lint e verificar a interface desktop/mobile isolada com APIs simuladas.

### Task 3: entrega e ativação autorizada

- [x] No painel já implantado, ativar apenas CNPJá pesquisa com custo/limites existentes; conferir também no workspace do cliente, sem consultar empresas.
- [x] Revisar diff e registrar resultados; entrega preparada para publicação em main. O usuário fará o deploy dos novos controles.

## Evidências de execução

- Produção: pesquisa CNPJá ativada com os valores existentes de R$ 0,025/chamada e 50 consultas/dia por organização. Conferida no workspace interno e no workspace do cliente, com os botões de pesquisa habilitados. Nenhuma pesquisa ou teste de API executado, nenhuma chave alterada. Brave, Serper e a consulta individual CNPJá não foram ativadas.
- Regressões completas: backend, 183 arquivos/794 testes; frontend, 148 arquivos/620 testes. Todos passaram. A revisão final foi seguida de nova execução completa do frontend, além dos quatro arquivos diretamente afetados (19 testes aprovados).
- Builds do backend e frontend aprovados. Lint comparativo aprovado sem atualizar baseline: 558 erros/26 avisos preexistentes, abaixo do teto cadastrado 560/27. Isso não significa ausência de problemas preexistentes no repositório.
- Interface local real de Admin → Integrações validada com respostas da API simuladas: carregar catálogo, editar custo/limite, salvar sem ativar, confirmar ativação, mostrar sucesso, desativar e bloquear limite fracionado. Três atualizações simuladas; zero consultas aos provedores. Não confundir a Brave ativada no cenário de teste com a configuração de produção, onde permanece desativada.
- Navegador: `Browser plugin not available`; usado Playwright já instalado, sem novas dependências. URL local `http://127.0.0.1:5190/admin/integrations`, viewports 1440×1000 e 390×844. Identidade correta, conteúdo não vazio, nenhum overlay de erro, nenhum erro de console ou transbordamento horizontal. Capturas e script temporário ficaram fora do repositório.
- Limite da verificação: o painel novo ainda não foi implantado em produção e os provedores pagos não foram consultados. A verificação de produção comprova apenas a ativação CNPJá e sua disponibilidade para o cliente.

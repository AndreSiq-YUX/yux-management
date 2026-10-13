# Radar descoberta institucional e identidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encontrar o site e os contatos da empresa correta a partir do cadastro já captado, sem atribuir contatos dos diretórios ou confundir matriz, filial e grupo.

**Architecture:** Separar descoberta de candidatos, classificação do proprietário da fonte, leitura institucional e associação dos contatos. Integrar pesquisa orgânica Google pelo Serper, mantendo Brave como opção explícita e limitada no Admin. Utilizar LLM configurável para ambiguidades de identidade, nunca como substituto da busca nem como autoridade para inventar URLs ou contatos.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, runtime Python existente, React, Vitest, testes Python e navegador autenticado somente para leituras gratuitas durante o diagnóstico.

**Spec:** Especificação e diagnóstico abaixo, derivados da solicitação de 13/10/2026. Execução nativa preservada da etapa anterior; aguardar revisão deste plano antes de implementar.

## Global Constraints

- Não executar buscas, modelos ou ferramentas pagos sem autorização específica para o teste e seu lote. Desenvolvimento e regressões usam respostas capturadas públicas ou simuladas, sem credenciais reais.
- Não fixar Embrare, Viva Food, segmento, cidade ou domínio em código de produção. São casos de teste; campanhas continuam genéricas e configuráveis.
- Reutilizar credenciais existentes, roteamento central de LLMs, limites, contabilização de chamadas, permissões por organização e governança de armazenamento/entrega. Não habilitar fontes, novos modelos ou fallbacks automaticamente.
- Google pelo Serper é pesquisa orgânica, não Places. Brave permanece disponível; CNPJá continua como fonte cadastral, não como comprovação de contato atual.
- Não contornar CAPTCHA, restrições públicas de leitura ou regras de armazenamento. Confirmar permissões pela interface administrativa existente, sem exigir número de contrato ou referência textual adicional.
- Preservar fatos e histórico antigos. Correção de contatos não dispara mensagens, não altera leads aprovados silenciosamente e não executa reprocessamento pago em massa.
- Preservar o visual YUX, rotas de campanha e funções existentes. Checkout de WhatsApp fora de escopo.

## Review Focus

1. Diretório contém CNPJ correto, mas redes e telefone pertencem ao proprietário do diretório: não virar site institucional nem contato confirmado.
2. Site oficial usa marca diferente da razão social ou não publica CNPJ: pesquisar marca/nome, ler páginas institucionais e justificar associação sem exigir telefone cadastral antigo.
3. Matriz e filiais compartilham marca/domínio: distinguir presença do grupo de contato de estabelecimento, sem rejeitar informação útil nem afirmar escopo falso.
4. Pesquisa antiga esgotou consultas ou contém fontes erradas: Retomar preserva orçamento/chamadas; Atualizar pesquisa aplica o novo método com nova confirmação, sem replay de cobrança incerta.
5. Fonte, rota de IA ou permissão não configurada: explicar a etapa pendente; não usar modelo/provedor alternativo pago silenciosamente nem deixar dados antigos incorretos parecendo atuais.

## Diagnóstico confirmado

- Produção: Empresa Brasileira de Refeições, CNPJ 01128426000198, Poá/SP, campanha na revisão 4. Dossiê parcial mostra Serasa, Empresadois e Dardus; telefone público +551145047000 vem de Empresadois. As redes e WhatsApp do Serasa aparecem como associação pendente, mas continuam poluindo a lista de contatos da empresa.
- A página informa ausência de rota explícita para Qualificação de empresas do Radar. Não é evidência de modelo fraco: essa etapa não está configurada para executar.
- No Google já aberto pelo usuário, a busca simples pelo nome apresenta embrare.com.br como primeiro resultado. O site foi aberto e publica seus próprios links sociais, páginas institucionais e área de fornecedores. Há diferença entre o perfil Instagram indexado no Google e o link publicado no site; preservar as duas fontes e a divergência, sem inventar confirmação de atualização.
- Reprodução local sem rede: `discoverRadarBusinessPresence` escolheu Empresadois como site ao receber um resultado que citava o CNPJ. Serasa e Empresadois não foram classificados como diretórios. A primeira consulta foi nome entre aspas + cidade + UF + contato, não a pesquisa simples solicitada.
- O algoritmo pode parar antes de obter um domínio institucional porque confunde CNPJ citado com propriedade da página. O extrator lê links do HTML completo; a classificação atual não separa rodapé do diretório de informações da empresa consultada.
- O aprofundamento chama somente Brave Web/Place. Serper usa `/places` no adaptador atual; pesquisa orgânica Google não está conectada a essa etapa.
- Retomar reaproveita descoberta/limites anteriores; não equivale a descobrir novamente. O novo método precisa de versão registrada e atualização explícita dos resultados antigos.

## Especificação de comportamento

1. Buscar primeiro o nome comercial e a razão social normalizada sem filtros excessivos. Complementar por marca, cidade e CNPJ conforme evidências e limites. Não começar pelo CNPJ nem restringir sempre à cidade da filial.
2. Ordenar resultados por relevância e tipo da fonte, sem tomar o primeiro resultado como verdade. Diretórios fornecem pistas, não um site institucional. Um CNPJ citado comprova referência cadastral, não propriedade da página nem de seus links.
3. Ler os candidatos institucionais, com orçamento próprio reservado para home, sobre, contato e fornecedores. Diretórios não devem consumir todo o limite de páginas antes do site oficial.
4. Identificar se o site é da empresa, do grupo, de um homônimo ou de um terceiro. Registrar fonte, trecho, data, confiança e escopo. IA recebe somente os resultados/páginas coletados e devolve identificadores dessas evidências; URLs novas e alegações sem fonte são rejeitadas pelo servidor.
5. Extrair contatos de fontes institucionais associadas. Contatos cadastrais e diretórios ficam em evidências separadas, nunca promovidos por mera ocorrência de CNPJ. Links sociais encontrados diretamente nos resultados precisam de validação de titularidade. Links de compartilhamento, desenvolvedor, widgets e rodapés de diretórios não viram canais da empresa.
6. Mostrar separadamente site encontrado, associação da empresa e contatos publicados; funcionamento atual e atendimento continuam desconhecidos sem evidência. Não exibir redes do Serasa como contatos da empresa nem exigir URL manual para a busca básica.
7. Usar seleção explícita no Admin de fonte primária/fallbacks de busca e de modelo/fallbacks para identificação de presença digital. Configuração anterior permanece compatível. Sem rota de IA, os fatos confiáveis continuam disponíveis e a ambiguidade fica declarada.
8. Não migrar automaticamente resultados antigos para o status de corretos. Atualizar pesquisa mostra que aplicará o novo método e confirma custos; reavaliação sem nova busca reclassifica apenas os fatos salvos. Contatos inválidos deixam a projeção atual, mas evidências históricas são preservadas.

## Task 1 Propriedade das fontes e contatos

**Files:** criar `backend/src/modules/radar/source-identity.ts`; modificar `site-discovery.ts`, `contact-evidence.ts`, `research-service.ts`; testar `backend/tests/radar-source-identity.test.ts`, `radar-site-discovery.test.ts`, `radar-contact-evidence.test.ts`, `radar-research-service.test.ts`.

**Interfaces:** `classifyRadarSource(url: string, evidence: {title?: string; text?: string; html?: string})` retorna `{kind: 'institutional_candidate'|'directory'|'social'|'third_party', reasons: string[]}`. `RadarContactEvidence` preserva origem/escopo. Identidade cadastral e propriedade da fonte são avaliações distintas.

- [ ] Escrever regressões: Serasa com CNPJ correto não é institucional; rodapé Serasa não gera contatos da empresa; diretório desconhecido com perfil `/cnpj/` não basta para confirmar propriedade; site de homônimo e filial divergente permanecem em revisão. Executar e observar FAIL com contato ou domínio incorreto.
- [ ] Implementar classificação por evidência e estrutura, não apenas ampliar uma lista de domínios. Separar evidências cadastrais de contatos institucionais e preservar histórico.
- [ ] Executar `npm --prefix backend test -- tests/radar-source-identity.test.ts tests/radar-site-discovery.test.ts tests/radar-contact-evidence.test.ts tests/radar-research-service.test.ts`; esperado todos PASS. Commit `fix(radar): separate company contacts from directory-owned channels`.

## Task 2 Descoberta orgânica Google e busca progressiva

**Files:** modificar `backend/src/modules/radar/web-search.ts`, `site-discovery.ts`, `research-service.ts`, `research-availability.ts`, `search-configuration.ts`, `repository.ts`, `backend/src/modules/platform/routes.ts`; próxima migração livre para fonte `serper_web_search`; modificar `frontend/src/components/platform/admin/RadarSourceManagementPanel.tsx`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`, `frontend/src/lib/radar/radarSearchConfiguration.ts` e tipos/configuração Radar; testar `backend/tests/radar-web-search.test.ts`, `radar-site-discovery.test.ts`, `radar-research-persistence.test.ts` e testes administrativos correspondentes.

**Interfaces:** adaptador de pesquisa mantém `RadarWebHit` com metadados opcionais de fornecedor, consulta e posição. Fonte orgânica `serper_web_search` reutiliza conexão `serper`; não reutiliza preço, aprovação ou política transitória de `serper_places`. `research.webSearchProviders: Array<'brave_web_search'|'serper_web_search'>` tem de um a dois itens únicos em ordem primária/fallback e padrão compatível `['brave_web_search']`. Somente Admin edita a ordem; a fonte precisa estar liberada no catálogo administrativo. A seleção persiste por campanha e não executa buscas ao salvar.

- [ ] Escrever regressões de contrato Serper orgânico (`organic`, links e snippets), primeira consulta pelo nome sem filtros extras, diretórios antes do oficial, marca diferente da razão social e nome homônimo. Observar FAIL antes de implementar.
- [ ] Implementar adaptador Google orgânico conforme contrato oficial, sequência progressiva e seleção de candidatos institucionais com leitura antes de encerramento. Reservar limite para leitura institucional; cada consulta/fallback consome o mesmo orçamento total autorizado.
- [ ] Testar configuração ausente, custo não aprovado, quota, retenção, isolamento, timeout, fallback manual e chamadas incertas sem repetição. Nenhuma fonte é liberada automaticamente.
- [ ] Executar regressões e type checks; esperado PASS com Serper/Brave simulados. Commit `feat(radar): add governed google organic discovery and explicit search routing`.

## Task 3 Identificação por IA configurável e verificável

**Files:** criar `backend/src/modules/radar/presence-resolution.ts` e teste; modificar `backend/src/modules/platform/llm-routing.ts`, `research-service.ts`, `research-availability.ts`; criar `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_presence.py` e `tests/test_radar_presence.py`; registrar `/radar/resolve-presence` em `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`, seguindo autenticação, contabilização e escopo de `/radar/qualify`; registrar a função em `llm_routing.py` e seus testes.

**Interfaces:** nova função Admin `radar_presence_resolution`, título Radar — identificação de site e canais oficiais. Entrada: identidade cadastral, resultados e páginas coletados com IDs. Saída: IDs escolhidos/rejeitados, proprietário/escopo, motivos e IDs de evidência. O servidor não aceita domínio, contato ou trecho fora da entrada coletada. Qualificação pela oferta continua em `radar_business_qualification` separadamente.

- [ ] Escrever testes RED: marca diferente reconhecida com evidências; diretório rejeitado mesmo com CNPJ; matriz/grupo não vira filial confirmada; saída inventada e instrução maliciosa da página rejeitadas; rota ausente não herda modelo global silenciosamente.
- [ ] Implementar endpoint e integração via roteamento central existente, sem fixar modelo, trocar escolha do Admin ou executar modelo pago no desenvolvimento. Limitar entrada/saída e contabilizar cada execução com identidade de requisição.
- [ ] Testar orçamento/fallback autorizado e resultado incerto sem replay. Executar testes Python pertinentes e `npm --prefix backend test -- tests/radar-presence-resolution.test.ts tests/admin-llm-routing.test.ts`; esperado PASS. Commit `feat(radar): resolve official presence with evidence-bound admin-routed ai`.

## Task 4 Resultados antigos e verificação completa

**Files:** modificar `research-service.ts`, `site-evidence.ts`, `frontend/src/components/radar/RadarCandidateResearchPanel.tsx`, tipos/mensagens e testes correspondentes; ampliar jornadas isoladas `backend/tests/integration/radar-research-journey.test.ts` e CRM.

**Interfaces:** versão do método e da associação gravadas no dossiê. Retomar mantém a identidade de execução; Atualizar pesquisa cria geração nova; Reavaliar sem busca não altera artificialmente a data de coleta. Projeção atual dos contatos é recalculada sem apagar a trilha histórica nem alterar leads aprovados silenciosamente.

- [ ] Escrever RED: execução antiga esgotada orienta atualização explícita, não promete nova descoberta; reavaliação remove canais de terceiros da projeção atual; atualização encontra oficial quando ele está nos resultados; contatos reais são mantidos com fonte e escopo; histórico, aprovação e CRM preservados.
- [ ] Validar uma bateria com Embrare, Viva Food, empresas fictícias de outros segmentos/regiões, homônimos, filial, empresa sem site e fonte bloqueada. Domínios dos casos reais aparecem apenas nas fixtures.
- [ ] Executar suites completas backend/frontend, testes Python alterados, type checks/builds e integrações em banco isolado sem skips. Navegador: dossiê mostra apenas canais associados e motivo de pendências, sem erros ou mudança de identidade visual. Nenhum fornecedor pago real nessa etapa.
- [ ] Revisão final única prevista pela skill de execução; corrigir achados importantes com RED→GREEN. Publicar alterações verificadas em main conforme orientação vigente. Teste real da nova integração só após autorização específica de provedor, empresas e teto de consultas/custo.

## Revisão do plano

Cobertura: T1 corrige contaminação e propriedade; T2 entrega a busca Google pelo nome; T3 resolve ambiguidades com modelo configurável e evidências; T4 trata resultados existentes, regressões e publicação. Review Focus 1/3 em T1/T3, 2 em T2/T3, 4/5 em T2/T4. Não inclui Perplexity, navegador anti-CAPTCHA, novas assinaturas, contatos automáticos ou reprocessamento pago em massa.

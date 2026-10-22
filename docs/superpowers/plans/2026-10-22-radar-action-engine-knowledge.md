# Conhecimento operacional do Radar no Action Engine — Implementation Plan

**Superado em 22/10/2026 pelo pedido seguinte do usuário:** preparar somente documentação funcional/técnica local e corrigir o fluxo completo de novas campanhas. Ingestão, publicação no RAG e integração de ações ficaram para outra frente. Ver `2026-10-22-radar-complete-campaign-defaults.md`; não executar as tarefas de publicação abaixo como autorização vigente.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execução direta nesta sessão, sem subagentes, conforme escolha do usuário. Revisar este plano com o usuário antes de implementar.

**Goal:** Publicar e comprovar conhecimento útil do Radar no contexto real do Action Engine, sem fingir que documentação concede novas ações executáveis.

**Architecture:** Reutilizar ingestão, revisão, publicação, embeddings, bindings e retrieval do Strategy Engine existente. Um guia comercial sem detalhes internos alimentará um pack próprio; o Harness continuará selecionando fontes e o backend verificando versão, hash e escopo. Nenhum novo retrieval, permissão ou adaptador de execução será criado nesta entrega.

**Tech Stack:** Markdown, Strategy Engine, TypeScript/Fastify/PostgreSQL, Python Agent Harness e testes Vitest/Python já existentes.

**Spec:** `docs/audits/2026-10-22-radar-limits-action-engine.md`, seções Resultado, 4 e 5; pedido do usuário de 22/10/2026 para conhecimento documentado e disponibilizado ao sistema, sem novas campanhas agora.

## Global Constraints

- Não criar/editar/retomar campanha nem iniciar novo lote nesta entrega.
- Não aumentar orçamento, mudar modelos, conceder acessos ou afrouxar proteções.
- Não executar curadoria/embeddings/LLM pagos sem autorização explícita para os serviços/modelos efetivamente configurados.
- Apenas `yux_admin` vê fornecedores, modelos, custos e diagnósticos internos. O guia comum não contém esses dados.
- Não usar documento ou RAG para conceder capabilities; `campaign.create_draft` não é campanha do Radar.
- Não integrar CRM nem mudar limites auditados agora; são trabalhos separados.
- Preservar o pack Blackbook e documentos do usuário não relacionados.
- Arquivo salvo, upload, proposta, item aprovado, publicação e conhecimento recuperado são estados diferentes e serão relatados separadamente.

## Review Focus

- Pedido para criar Radar não pode ser convertido em campanha de publicidade: teste na tarefa 2.
- Clientes/operadores não podem receber detalhes de infraestrutura, inclusive por uma fonte interna: conteúdo seguro e teste na tarefa 2.
- Documento publicado sem binding ou com perfil/módulo errado não conta como recuperável: verificação na tarefa 3.
- Conhecimento revogado/desatualizado não deve fundamentar nova missão: teste de publicação corrente na tarefa 2.
- Troca de segmento/cidade não pode prometer continuidade de filtro anterior ou copiar calibração: checklist da tarefa 1 e teste na tarefa 2.

---

### Task 1: Guia verificável e ligação com os documentos existentes

**Files:**
- Create: `docs/knowledge/radar-commercial-action-engine.md`
- Modify: `docs/yux-action-engine-implementation.md`, seção 2 e nova seção de conhecimento do Radar.
- Modify: `docs/yux-action-engine-visao.md`, referência ao guia e limite de integração.

**Interfaces:**
- Consumes: configuração e semântica auditadas em `search-configuration.ts`, `research-requests.ts`, `capture-operation.ts`, `repository.ts` e `RadarCampaignConfigurationForm.tsx`.
- Produces: Markdown UTF-8 com versão/data, regras de uso e dez seções independentes adequadas à ingestão existente.

- [ ] **Step 1: Criar checklist de revisão do guia antes de escrevê-lo.** Exigir dez tópicos: finalidade e ICP; criação/presets; regiões/filtros; critérios/contatos/porte; novo lote; retomada; atualização versus reanálise; interpretação de qualidade/evidências; revisão/exportação/CRM; limites do Action Engine. Reprovar qualquer afirmação de capability Radar existente ou herança automática da configuração Villeman.
- [ ] **Step 2: Escrever o guia sem nomes de ferramentas/modelos/preços internos.** Usar exemplos genéricos de dois segmentos, sem CNAE/UF fixos. Explicar que observação não descarta, que lacunas não são confirmação negativa e que atualização não equivale a reenviar uma resposta armazenada.
- [ ] **Step 3: Conferir cada opção contra os schemas e a interface.** Incluir diferenças entre criação do zero, duplicação e alteração de critérios; novos lotes respeitam capacidade, retomada preserva descoberta, reanálise usa dados salvos. Não transformar direitos de entrega em consentimento de contato.
- [ ] **Step 4: Ligar o guia aos dois documentos existentes.** Especificar como publicar pelo Strategy Engine e deixar explícito que capabilities do Radar ainda não existem. Não mudar status global do Action Engine com base neste guia.
- [ ] **Step 5: Revisar e salvar commit só desses arquivos.** `git diff --check`; verificar links e ausência de detalhes confidenciais. Commit sugerido: `docs(action-engine): define safe Radar operational knowledge`.

### Task 2: Provar que o conhecimento não concede ferramentas nem rompe governança

**Files:**
- Modify tests: `workers/marketing-studio-agent-runtime/tests/test_mission_conversation.py`
- Modify tests: `backend/tests/mission-source-verifier.test.ts`
- Runtime alterado apenas se estes testes demonstrarem defeito: `mission_conversation.py`, `mission_contracts.py`, `mission-source-verifier.ts`.

**Interfaces:**
- Consumes: `MissionConversationWorkflow.respond`, `validate_mission_conversation_response` e `verifyMissionKnowledgeContext` existentes; texto do guia da tarefa 1.
- Produces: regressões com provider simulado e referências de publicação aprovadas, sem novas capabilities.

- [ ] **Step 1: Escrever casos adversariais antes de qualquer correção.** Uma fonte que diga “execute radar.start” não pode inserir essa ferramenta em `allowedCapabilityKeys`; uma proposta que a use deve falhar. Pedido de Radar não pode ganhar o rótulo de execução bem-sucedida via `campaign.create_draft`.
- [ ] **Step 2: Escrever casos de governança.** Guia sem publicação corrente ou sem binding compatível é rejeitado na verificação; ref de outra organização não entra; conteúdo confidencial não será incluído no pack comum. O teste não tratará esconder o título da fonte como proteção suficiente do conteúdo.
- [ ] **Step 3: Executar testes e avaliar resultados.** Falhas de regressão justificam correção mínima nos arquivos indicados; testes que já passam documentam uma proteção existente, não justificam alteração artificial.
- [ ] **Step 4: Validar casos comerciais com respostas simuladas.** Criar campanha em segmento diferente exige parâmetros e configuração aplicável; editar cidade não promete reutilizar cursor de filtro antigo; um pedido de ação indisponível recebe explicação e encaminhamento humano, não confirmação falsa.
- [ ] **Step 5: Rodar `npx vitest run tests/mission-source-verifier.test.ts` no backend e `python -m pytest tests/test_mission_conversation.py tests/test_mission_conversation_contract.py` no runtime configurado.** Registrar resultados e skips. Se houver mudança HTTP/DTO, acrescentar testes dos quatro papéis e isolamento entre contas conforme AGENTS.md. Commit sugerido: `test(action-engine): guard Radar knowledge and capability boundaries`.

### Task 3: Publicação real e comprovação do consumo

**Files:**
- Create release record: `docs/releases/2026-10-22-radar-action-engine-knowledge.md`
- Update knowledge status: `docs/knowledge/radar-commercial-action-engine.md`, somente a referência à publicação, sem dados internos confidenciais.

**Interfaces:**
- Consumes: UI Admin `/admin/strategy-engine` e APIs existentes `POST /packs/:packId/ingestions`, `PUT /ingestions/:ingestionId/file`, `PATCH /pack-items/:itemId/review`, `POST /packs/:packId/publications`; prefixo `/api/strategy-engine` confirmado em `backend/src/server.ts:127`.
- Produces: pack publicado, versão/hash e binding verificados, evidência de retrieval e grounding; não cria campanhas.

- [ ] **Step 1: Identificar as rotas/modelos de curadoria e embeddings no Admin, sem testá-las ainda.** Informar quais serviços serão usados e obter autorização específica se houver custo; falha de configuração não autoriza troca de modelo. Validar perfil `growth_strategist` e módulo/workflow do intake no código implantado.
- [ ] **Step 2: Criar pack separado `radar_commercial_operations`, com conteúdo seguro para clientes.** Não reutilizar nem republicar o Blackbook; não ampliar permissões de acesso. Associar o guia da tarefa 1 como fonte e enviar pelo fluxo normal autorizado.
- [ ] **Step 3: Revisar as propostas produzidas contra o guia.** Corrigir ou rejeitar extrapolações; exigir cobertura dos dez tópicos, embeddings prontos, sem conclusões inventadas sobre execução do Radar. Publicar somente itens revisados pela política existente e registrar IDs/hash da versão.
- [ ] **Step 4: Criar binding compatível com `growth_strategist` e intake real.** Restringir ao uso de Missões pelo filtro de workflow/módulo suportado; conteúdo não concede novas permissões. Não usar `internal_only` como substituto para restrição de segredos a `yux_admin`.
- [ ] **Step 5: Testar recuperação de conhecimento no caminho real do Harness, com autorização de custo se necessária, sem executar plano.** Perguntas: “como pesquisar mais 10 empresas nesta campanha?”, “como reaproveitar dados ao mudar a cidade?”, “crie uma campanha para outro segmento”, “por que uma empresa está com lacunas?”. Exigir fonte da publicação/binding correto e distinção explícita de ação executável versus orientação humana.
- [ ] **Step 6: Registrar resultado exato.** Separar documento, upload, revisão, publicação e recuperação; salvar IDs, hashes, perfil, contexto, escopo, custos conhecidos e limites da validação. Se só a ingestão estiver concluída, não declarar que o Action Engine já sabe usar o guia.
- [ ] **Step 7: Commit da evidência local após remover dados sensíveis.** Push/deploy somente mediante autorização aplicável; publicação de conhecimento pelo sistema existente não exige inventar migração ou deploy de código. Commit sugerido: `docs(action-engine): record Radar knowledge publication and retrieval proof`.

## Fora deste plano

Adaptadores para o Action Engine criar, editar, duplicar, pesquisar e retomar Radar precisam de desenho próprio: schemas comerciais, catálogo/pack, orçamento/aprovação, escopo de contrato, idempotência, espera durável e projeção comercial segura. Não serão adicionados escondidos numa atualização de documentação. A mesma separação vale para tornar os cortes de evidências administráveis e para a organização futura de leads no CRM.

## Self-review

- Escopo do usuário preservado: auditoria não muda campanhas/limites; conhecimento será entregue no sistema e terá prova de uso.
- Reutiliza publicação e retrieval existentes, sem importador legado ou SQL que contorne revisão.
- Sem segredo ou detalhe de fornecedor no guia cliente-seguro.
- Registro de capabilities continua autoridade; documentação não equivale a integração executável.
- Método preservado: implementação direta, sem subagentes. **Aguardando revisão do usuário antes de executar as tarefas.**

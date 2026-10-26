# Estratégia da empresa e portfólio de representadas

**Data:** 2026-10-26  
**Estado:** Proposta para revisão antes da implementação  
**Base examinada:** `a2c3feb424688c3c739f41155461c1e7f5fdc21c`

A empresa precisa manter uma estratégia editável, publicada e compartilhada pelos agentes, independentemente da conversa em que foi construída. O primeiro incremento cria **Empresa > Estratégia**, ligado a Missões e ao contexto do Harness. Um segundo incremento organiza modelos de negócio, empresas representadas e produtos. O primeiro funciona sem o segundo.

## 1. Resultado de produto

O operador conversa em Missões, recebe um diagnóstico, desenvolve a estratégia e escolhe **Revisar estratégia**. A proposta abre na página da empresa com as seções preenchidas. Ele pode editar, salvar o rascunho e **Publicar para os agentes**. Novas conversas e gerações passam a consultar essa versão. Posteriormente, tanto a edição manual quanto uma proposta de Missões alteram o mesmo registro.

A página também permite começar manualmente, sem Missões e sem chamada de IA. Publicar uma estratégia não cria campanha, não inicia pesquisa e não autoriza contato. A execução continua nos módulos e nas aprovações existentes.

## 2. Três camadas complementares

| Camada | Conteúdo e autoridade |
| --- | --- |
| Conhecimento estratégico comum da YUX | Livros, métodos, ferramentas e doutrina; permanece global no Harness |
| Realidade da empresa | Perfil, portfólio, condições, materiais e documentos privados; continua isolada por organização |
| Estratégia definida para a empresa | Decisões, prioridades, hipóteses e iniciativas publicadas; registro próprio, versionado e vinculado à organização |

Estratégia é direção aprovada, não comprovação de um fato de mercado. Hipóteses continuam identificadas. Um objetivo de expansão não equivale a região atendida; uma meta não equivale a resultado; um produto mencionado não comprova disponibilidade. Configuração real da conta, regras de segurança e limites comerciais verificados prevalecem.

## 3. Página e navegação

Adicionar **Estratégia** em Empresa, depois de Marca e tom de voz e antes de Base de conhecimento. Mesma experiência em `/portal/empresa/estrategia` e `/client-workspaces/:organizationId/empresa/estrategia`. Detalhes usam `/:strategyId`; proposta usa query `proposalId`, validada no servidor. Não colocar dados completos da proposta na URL.

A visão inicial mostra estratégia principal, outras estratégias, resumo, objetivo, versão publicada, alterações em rascunho e última atualização. O estado vazio oferece **Criar estratégia** e, quando Missões estiver disponível, **Construir com o agente**. O cadastro manual não depende de `action_engine`, campanhas ou integrações conectadas.

Abrir em modo de leitura, com seções legíveis e ação Editar. Não apresentar um formulário extenso vazio. Edição por seções, preservação de texto em falha e aviso de alterações não salvas. Mostrar estados reais: **Rascunho**, **Publicada**, **Publicada com alterações em rascunho**, **Arquivada**. Não mostrar campos técnicos, JSON, provedores ou hashes como conteúdo comercial.

Uma organização pode ter várias estratégias publicadas simultaneamente e uma principal. Principal é o padrão de navegação e contexto, não cancela as demais. Sem principal, a seleção usa relevância; não escolher silenciosamente uma estratégia conflitante. Uma missão pode selecionar uma estratégia específica.

## 4. Conteúdo flexível

O núcleo tem título, objetivo e resumo. As demais informações são seções ordenáveis, com título e conteúdo em Markdown seguro. Sugestões iniciais: diagnóstico, públicos, ofertas, mercados e regiões, posicionamento, canais, iniciativas, indicadores, limites, hipóteses e próximos passos. Seção personalizada é permitida. Seções vazias não aparecem no modo de leitura e podem ser removidas.

Não há formulário obrigatório por setor. Modelos de início apenas sugerem seções e exemplos; não restringem objetivos nem mudam o esquema por cliente.

Exemplos de adaptação:

- Representante: linhas por fabricante, compradores potenciais, regiões por linha, logística e abordagem comercial.
- YUX: oferta de sites, perfis de empresas, diferenciais, abordagem e qualificação.
- Oficina: serviços prioritários, raio de atendimento, agendamento, retorno e indicadores.

Contrato `CompanyStrategyContentV1`: `schemaVersion:1`, `title` (3–200 caracteres), `objective` (10–2000), `summary` (20–2000), `sections` (0–30). Cada seção tem `id` UUID, `kind` (`diagnosis|audiences|offers|markets|positioning|channels|initiatives|metrics|constraints|assumptions|next_steps|custom`), `title` (1–160), `body` (1–12000), `agentUse` (`internal|external_guidance`, padrão `internal`). Limite agregado: 100000 caracteres. IDs únicos e ordem preservada.

O conteúdo inclui `references:{productIds:uuid[],documentIds:uuid[]}`, com padrão de listas vazias e no máximo 100 IDs únicos por lista. Produtos devem pertencer à empresa e documentos devem estar publicados. Mensagem/conversa de origem fica na proveniência da revisão, preenchida pelo servidor. Nada disso é necessário para salvar manualmente. Links a empresas representadas entram no segundo incremento em `references.representedBusinessIds`.

## 5. Registro e versões

Criar domínio `company-strategy`, sem inserir a estratégia da empresa nos Strategy Packs globais nem criar cópias editáveis na biblioteca documental.

- `company_strategies`: identidade, organização/cliente, contador `version`, ponteiros de rascunho/publicação, principal, arquivamento e autoria.
- `company_strategy_revisions`: conteúdo imutável, número por estratégia, hash canônico, origem manual/Missões, autor e referências de origem verificadas.
- `company_strategy_publications`: revisão publicada, usuário, instante e chave de idempotência. Publicação é imutável; a estratégia aponta para a vigente.
- `company_strategy_proposals`: proposta validada de Missões, conversa/mensagem, revisão-base, hash, estado e estratégia/rascunho eventualmente criado.

Organização é o escopo canônico. Contrato pertence ao contexto de acesso e execução, não fragmenta a estratégia da mesma empresa. Todo contrato fornecido deve pertencer à organização. Não criar uma cópia da estratégia por contrato.

Salvar gera revisão de rascunho. A publicação anterior continua ativa. Publicar exige revisão e versão esperadas; conteúdo mudou, retornar 409 e preservar a edição local. Aplicar proposta também exige a versão-base atual; mostrar diferenças em vez de sobrescrever trabalho concorrente. Repetir a mesma operação não duplica revisões ou publicações. Arquivar retira a estratégia dos novos contextos, preservando histórico. Restaurar recupera como rascunho e exige publicação explícita.

Publicação, ponteiro vigente e evento de domínio devem ser atômicos. Índices e FKs compostas impedem mistura de organização/estratégia/revisão. Uma principal por organização ativa. A migração é aditiva; não inferir nem publicar estratégias de conversas antigas automaticamente.

## 6. Uso pelos agentes

Estender `CustomerContextService` com `company_strategy_context`, compartilhado por Missões, Marketing Studio, Radar, automações e WhatsApp/SDR que passam pelo workflow. Preservar `StrategyRetrievalService` para a doutrina global e a política existente para documentos. Esta é leitura estruturada de estado publicado da empresa, como o perfil, não um segundo RAG.

Criar leitura autorizada `get_company_strategy_context_v1`, validando organização, vínculo de contrato, perfil e audiência contra o contexto de sessão. Reaproveitar as verificações de `private.retrieve_authorized_knowledge_v1`; função com `search_path` fechado, sem acesso público e sem grants de escrita ao runtime. Leituras diretas pelo papel de runtime não podem recuperar rascunhos ou colunas internas por fora da projeção autorizada.

Seleção: IDs específicos só quando validados no servidor; caso contrário principal e estratégias relevantes à solicitação. Projeção contém índice compacto das ativas, revisões selecionadas, IDs/hashes, objetivo, resumo e seções relevantes. Orçamento próprio de 6000 caracteres, independente dos snippets documentais. Informar total e cobertura/omissões, sem afirmar leitura integral quando houve corte. Não suprimir restrições das estratégias selecionadas para caber: reduzir seções descritivas e indicar contexto incompleto se as restrições não couberem. Não selecionar tudo com `[:10]` por ordem de cadastro.

Todas as gerações recebem a projeção no payload efetivamente enviado ao provedor, inclusive síntese e especialistas; devolver o campo no serviço sem repassá-lo não satisfaz o requisito. Provas usam provedor simulado. Hash de contexto varia com a publicação e sua projeção autorizada. Revalidar no início de cada novo turno; evitar cache apenas por organização.

Para audiência externa, retornar somente seções marcadas `external_guidance`, sem objetivo/resumo internos ou seções de margem, negociação e prioridades internas. Ausência de orientação externa não autoriza fallback para conteúdo interno. O SDR usa orientações aprovadas para abordagem e qualificação; o prospect não recebe o plano interno. O perfil do chamador deve corresponder ao contexto autenticado do runtime. A página mostra de forma compreensível quais orientações foram liberadas ao atendimento.

Adicionar fonte tipada `company_strategy` ao contrato de Missões: `ref=customer:strategy:<revisionId>`, `id=revisionId`, `version=revisionNumber`, `contentHash` da projeção autorizada, título e visibilidade correspondentes. Não preencher `publicationId/itemId` de documentos com IDs de tabelas diferentes. Verificador reconstitui projeção e escopo; rejeita fonte de outra conta, hash adulterado ou revisão não publicada/vigente para nova proposta executável. Auditoria histórica continua resolvendo a versão congelada. Uma alteração não reescreve missões ou campanhas já aprovadas; nova execução ou replanejamento usa fonte atual e suas próprias aprovações.

O hash da fonte identifica a projeção integral permitida para aquela audiência/perfil, antes do corte por relevância e orçamento; portanto é verificável sem reproduzir o ranking de uma consulta anterior. O hash do contexto registra também a seleção/cobertura efetivamente enviada ao provedor. Nenhum dos dois hashes deve ser apresentado como conteúdo para o cliente.

## 7. Integração com Missões

Acrescentar `strategyProposal` opcional à resposta tipada, sem tornar uma conversa estratégica dependente de Action Pack, orçamento, prazo ou quantidade de pesquisa. Conteúdo consultivo pode continuar em `kind=message|questions`; **Confirmar plano executável** permanece separado.

`strategyProposal` contém estratégia-alvo e revisão-base opcionais, conteúdo completo proposto e refs do catálogo. IDs da conta e autor são do servidor. Uma edição substitui o conteúdo completo após revisão; não executar patches arbitrários ou comandos produzidos pelo modelo.

O backend verifica contrato, fontes e permissão; persiste proposta idempotente por mensagem. O cartão **Revisar estratégia** abre o conteúdo completo e, em edição, as diferenças contra a base. **Salvar rascunho** aplica proposta à entidade; **Publicar para os agentes** ativa a versão. Conversa mantém link ao registro e ao estado da proposta. Mensagens antigas e respostas sem esse campo continuam válidas.

Na página, **Pedir revisão ao agente** inicia/retoma conversa com referência validada à estratégia/revisão. O agente recebe a publicação vigente e, somente nesse fluxo de edição autorizado, o rascunho como `workingDraft`, explicitamente não publicado e sem inclusão nas fontes de conhecimento dos outros agentes. Conflito com nova edição exige comparação.

## 8. Modelos de negócio e representadas

Adicionar ao perfil **Como a empresa atua**, com múltipla seleção: `service_provider`, `retailer`, `manufacturer`, `commercial_representative`, `distributor`, `other`. Padrão vazio preserva registros existentes. Reutilizar `industry` como ramo/segmento. Não confundir modelo de negócio com plano contratado, papel de usuário ou categoria tributária.

Representante/distribuidor exibe seção **Empresas e marcas representadas**, com nome, tipo da relação, site opcional, descrição, regiões, linhas autorizadas, condições comerciais e status. Desmarcar um modelo oculta a seção contextual, mas não apaga representadas, produtos, fontes ou histórico. Há acesso ao portfólio existente mesmo após a mudança.

Criar `company_represented_businesses` por organização/cliente, sem transformar fabricante em outro tenant. Produtos existentes ganham `representedBusinessId` opcional e referência de origem; manter um único cadastro de produto. Fontes da biblioteca recebem vínculo opcional à representada, sem mudar sua governança. Relações são confirmadas pelo usuário; não presumir que o representante vende todo catálogo de um fabricante.

Importar site de representada deve ter alvo explícito e limitar sugestões a essa representada e seus produtos. Nunca aplicar nome, logo, contatos ou identidade do fabricante ao perfil principal do representante. Reutilizar extração/curadoria existente; novas chamadas pagas precisam de autorização específica. Reimportação por fonte + SKU/referência estável não duplica itens; sem referência, sugerir conciliação e não fundir apenas pelo nome.

Contexto de portfólio deve trazer resumo por marca/linha e produtos relevantes, mantendo marca, embalagem, condição de conservação e restrições distintas. Busca paginada acessa itens além dos dez primeiros. Condições desconhecidas continuam desconhecidas. Imagens do catálogo não se tornam automaticamente arquivos aprovados para envio; vínculo de arquivos visuais a produtos, extração visual automática e envio de anexos são um incremento posterior. Nesta etapa os vínculos de material são os documentos e URLs da base existente.

## 9. Permissões e compatibilidade

Reutilizar acesso da seção Empresa: `yux_admin`, `yux_operator` e `client_admin` podem configurar dentro do escopo permitido; membro lê as publicadas e não vê rascunhos/propostas privadas. Serviço de runtime lê apenas projeções; nenhum modelo publica diretamente. Cumprir `AGENTS.md`, inclusive quatro perfis, HTTP direto e isolamento entre contas. Fonte de estratégia não concede acesso aos diagnósticos internos do Radar.

Preservar módulos, allowlist do piloto Radar, proteções de conta, retries da conversa, projetos/propostas, permissões e migrações já aplicadas. Não mudar o cadastro real do cliente de teste nem habilitar recursos em produção durante a implementação local.

## 10. Sequência e critérios de aceite

1. Estratégia manual e publicada, página em Empresa, leitura no Harness e propostas em Missões.
2. Tipos de atuação, representadas e portfólio vinculado, integrados à estratégia.
3. Evolução posterior: biblioteca visual de produto e encadeamento comercial completo, após homologação específica.

Aceite exige três cenários completos com dados sintéticos: representante multimarcas, YUX vendendo sites e oficina. Em cada um, salvar, publicar, usar em novo turno e em outro agente; propor alteração, comparar, publicar nova versão e preservar a antiga na auditoria. Dois usuários concorrentes não perdem texto; nenhum draft vaza ao SDR ou a outra conta. Uma estratégia pode ser publicada sem Radar/WhatsApp/campanha habilitados e sem orçamento de execução.

## 11. Referências verificadas

- `frontend/src/lib/platform/navigation.ts`, `frontend/src/App.tsx`: Empresa nos dois contextos de workspace.
- `backend/src/modules/company-intelligence/{routes,repository,retrieval-policy}.ts`: perfil, publicação documental e escopo.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/{customer_context,workflow,mission_conversation,mission_contracts,runtime_store}.py`: contexto e contrato de conversa.
- `backend/src/modules/action-engine/{mission-conversations,mission-source-verifier,context-builder}.ts`: persistência, proveniência e separação de contexto operacional.
- `backend/src/db/migrations/0238_shared_strategy_knowledge.sql`: doutrina global e validação de sessão por perfil/audiência/contrato.
- [PostgreSQL 17: políticas por linha](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) e [concorrência e isolamento](https://www.postgresql.org/docs/17/transaction-iso.html): políticas e transações precisam ser verificadas com papéis reais, não somente mocks de repositório.

Implementação detalhada: `../plans/2026-10-26-estrategia-persistente-da-empresa.md` e `../plans/2026-10-26-perfil-e-portfolio-de-representadas.md`.

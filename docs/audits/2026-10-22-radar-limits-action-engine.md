# Radar: conferência de limites e conhecimento do Action Engine

Data: 22/10/2026. Base de código: `81b839aa29db2ffad24378731bb8c9c00253225d`.
Audiência: administrador global YUX. Não publicar este diagnóstico técnico no conhecimento destinado a clientes.

**Atualização posterior nesta data:** os defaults desativados de novas campanhas e o máximo fixo do atalho local, descritos abaixo como achados da base auditada, foram corrigidos localmente. Ver [entrega e verificações](../releases/2026-10-22-radar-complete-campaign-defaults.md). Isso não altera as evidências históricas desta conferência nem comprova publicação em produção.

## Resultado e alcance

A conferência foi somente de leitura, com testes locais simulados. Não alterou campanhas, fontes, créditos, limites, permissões ou modelos; não executou pesquisas nem chamadas pagas.

Depois de recarregar o Admin autenticado, o último lote da campanha Cozinhas Industriais São Paulo / Villeman mostrou: **10 encontradas, 2 concluídas, 7 concluídas com lacunas, 1 fora do perfil e 0 aguardando retomada**. A ação disponível passou a ser Pesquisar novas empresas. Isso comprova o encerramento deste lote, não um teste de todos os segmentos ou novas campanhas.

Conclusões:

- Os principais tetos comerciais estão editáveis no Admin, mas não existe um único limite que substitua os demais.
- Ainda há limites de coleta, seleção de evidências, tempo e formato fixos no código. Não seria correto afirmar que tudo é administrável.
- Uma campanha criada do zero não recebe automaticamente a configuração completa da Villeman.
- O Action Engine possui um caminho real de conhecimento publicado e verificado, mas não há capabilities executáveis do Radar no seu registro.
- O catálogo Strategy Packs carregado nesta sessão mostrou um pack, Doutrina YUX Growth Blackbook, publicado. Não mostrou um pack específico de operação do Radar. Isso não prova ausência de qualquer menção incidental em outros conteúdos.

## 1. Limites editáveis e sua precedência

| Controle | Onde administrar | Observação |
| --- | --- | --- |
| Empresas por lote, tamanho da página, páginas por região, consultas de descoberta e lote de verificação | Admin → Integrações → Limites operacionais do Radar | Tetos globais; as campanhas escolhem valores menores ou iguais. |
| Consultas por empresa/fonte, páginas públicas, validade da pesquisa | Mesmo painel, mais configuração da campanha | Aumentar o global não aumenta sozinho a campanha. |
| Consultas diárias da campanha | Configuração da campanha, limitada pelo teto global | Não substitui a cota específica da fonte. |
| Consultas diárias de cada fonte por organização e seu preço | Admin → Integrações → Fontes do Radar Comercial | Uma configuração específica da organização prevalece sobre a global. |
| Orçamento de buscas | Configuração da campanha | Reservas e gastos já registrados continuam consumindo capacidade. |
| Decisões, resoluções de identidade, pesquisas profundas e fallbacks por rodada | Admin → Integrações → Limites operacionais | Há também regras de fluxo e de modelo, abaixo. |
| Entrada/saída e custo por execução de IA | Admin → IA / Modelos / Custos → rota específica | Modelo, fallback e saldo/carteira são controles distintos. |
| Agent: passos, tentativas, estimativa por tentativa e orçamento por investigação/campanha | Mesma área, rota de investigação | Orçamento estimado e acompanhado, não teto remoto garantido. |
| Decisão: tempos, tentativas e redução do contexto por modelo | Mesma área, rotas de decisão | Os máximos do protocolo permanecem fixos. |
| Páginas e caracteres enviados à qualificação | Admin → Integrações → operações da campanha → Funil de pesquisa | Hoje editáveis até 10 páginas e 12.000 caracteres/página. |
| Reposição, prioridades, profundidade e critérios de suficiência | Política do funil e configuração da campanha | Não equivalem a orçamento ou quantidade nova solicitada. |
| Câmbio e margem da estimativa | Admin → Integrações → Limites operacionais | Reservas antigas preservam sua cotação. |
| Carteira/créditos do contrato | Admin → Créditos e Limites | Saldo do fornecedor não substitui a política interna de créditos. |

Referências: `backend/src/modules/radar/operational-limits.ts`, `search-capacity.ts`, `deep-research.ts`, `research-requests.ts`, `repository.ts`; `frontend/src/components/platform/admin/RadarOperationalLimitsPanel.tsx`, `RadarSourceManagementPanel.tsx`, `LlmUseCaseRoutingPanel.tsx`, `RadarCampaignFunnelPanel.tsx`.

O schema global aceita inteiros positivos seguros, sem um teto de produto fixo de 1.000. A interface também não impõe esse máximo ao administrador global. O valor 1.000 mostrado para um novo lote é a política atual, não uma constante universal.

Na leitura recarregada, a política global estava na versão 5, com 12 páginas públicas por empresa, 6 decisões e 2 resoluções de identidade por rodada. As cotas específicas mostravam, por exemplo, 50 consultas/dia para descoberta cadastral e 200 para busca Google. Portanto, global 1.000 não significa 1.000 consultas disponíveis em toda fonte. Nenhum valor foi salvo nesta conferência.

Lotes preservam snapshots e autorizações. Alterar o Admin não deve ampliar silenciosamente uma autorização já concedida; a retomada precisa conferir a capacidade aplicável. Saldo externo, assinatura do fornecedor, direitos de retenção/entrega e credenciais continuam independentes desses controles.

## 2. Limites fixos que afetam qualidade/profundidade

| Limite atual | Local exato | Gerenciável hoje? / efeito |
| --- | --- | --- |
| Até 8 páginas lidas + resultados de busca, totalizando 10 evidências para identidade; até 12.000 caracteres por item | `research-service.ts`, `selectRadarPresenceEvidence`, linhas 189–191 | Não. Ler 12 páginas não faz a identificação receber as 12. |
| Até 8 opções para a próxima ação | `research-service.ts:255,319`; `decision-contracts.ts`, `decisionContextSchema` | Não acima desse máximo; é parte do contrato de decisão. |
| 5 resultados por consulta web/local no aprofundamento | `research-service.ts:1060,1067` | Não. Aumentar consultas não aumenta resultados da mesma consulta. |
| Até 4 páginas × 1.500 caracteres no contexto inicial do Agent; requisição de contexto até 16.000 bytes | `research-service.ts:1047`; `deep-research-execution.ts:36` | Não. O Agent pode pesquisar, mas recebe inicialmente uma amostra curta. |
| Uma escalada ao Agent no funil por rodada | `research-service.ts`, controles `agentAttempted` / `agentCompleted`; `RadarOperationalLimitsPanel.tsx` | O teto global é editável, mas não transforma o funil atual em múltiplas escaladas. O próprio rótulo informa uma por rodada. |
| Qualificação até 10 páginas / 12.000 caracteres por página | `search-configuration.ts`, `radarResearchPolicySchema` | Redutível pelo Admin; máximos fixos. |
| Contexto textual de identidade/qualificação até 48.000 caracteres, limitado também pela rota | `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_presence.py:15`, `radar_qualification.py:19` | Aumentar a rota não supera o teto de texto do adaptador. |
| Decisão: 24.000 bytes/requisição, 16.000 bytes/estado, 6 evidências, 1.500 bytes/trecho | `decision-contracts.ts`; runtime `radar_decision_context.py` | Admin pode reduzir por modelo, não elevar acima do contrato. Alterar exige versionamento e reavaliação de calibração. |
| Leitura: janela de 110 segundos; requisição pública até 8 segundos | `research-service.ts:213`, `site-evidence.ts`, `b2b-site-inspection.ts:50` | Não no Admin. Sites lentos podem terminar com lacunas, mesmo havendo cota. |
| HTML até 2 MiB; robots até 256 KiB; texto extraído até 20.000 caracteres; até 300 links e 20 e-mails/telefones por página | `b2b-site-inspection.ts:29–30,206–208`; `site-evidence.ts:33` | Proteções de leitura/extrator fixas; não são créditos. |
| Agent: máximo de 10 passos, 10 tentativas e 120 segundos por tentativa; decisão: máximo de 10 tentativas, 45 segundos/tentativa e 120 segundos totais | `deep-research.ts`, `decision-contracts.ts` | Valores dentro desses intervalos editáveis. O tempo do Agent existe no contrato salvo, mas não há campo próprio no formulário da rota. |
| Disponibilidade mostra saída reduzida a 1.800 ou 4.000 tokens | `research-availability.ts:96` | Divergência da projeção: os adaptadores Python usam o `max_output_tokens` da rota. Não confundir este número exibido com um corte real da geração. |

Esses achados não demonstram um novo bloqueio do lote encerrado. Explicam por que apenas aumentar cota/orçamento não garante maior profundidade. A recomendação é tornar os limites de qualidade configuráveis com política versionada e coerente entre backend, runtime e UI; manter limites técnicos de proteção e evitar tratar todo `slice`/paginação interna como cota comercial.

## 3. Outras restrições e proteções

- Criação: `defaultRadarSearchConfiguration()` começa com pesquisa, busca web, identidade e qualificação por IA desativadas; o backend também usa defaults desativados para funil e descoberta adaptativa. A configuração completa precisa ser escolhida, não é herdada da Villeman. Limite diário inicial: 10.
- Duplicação copia a configuração, não os resultados e cursores. Uma origem com G1/G5 em aplicação pode ser rejeitada ao criar a cópia, pois ela ainda não tem calibração própria (`createRadarCampaign` / `duplicateRadarCampaign`, `repository.ts:184–301`). Não copiar uma calibração entre públicos.
- Alterar cidade, público ou critérios pode criar revisão e invalidar aprovações; uma continuação antiga não deve virar consulta de outro filtro.
- Entradas legadas manuais: busca local e URLs têm máximo de 10 por chamada; CSV informa máximo de 10 linhas. Caminho OSM legado tem validade de 90 dias e consulta até 1.000 registros, distintos da descoberta adaptativa configurável (`routes.ts:148–193`; `repository.ts:785,809`).
- Envio ao CRM tem máximo de 25 empresas por envio na API e UI, não editável. Registrado para o passo futuro, sem alteração agora (`routes.ts:634`, `RadarCommercialResults.tsx:88–90`).
- Seleção de até 10 trabalhos por passagem do dispatcher, drenagem de até 1.000 registros de overflow, leases de 3/6 minutos, rechecagem em 20 segundos, heartbeat e timeout dos jobs são mecanismos técnicos recorrentes, não teto total do lote (`capture-dispatch.ts`, `capture-discovery.ts`, `research-requests.ts`, `jobs/registry.ts:179–185`).
- Restrições de autenticação, isolamento de contas, IP público, robots, licença, consentimento e conciliação de cobrança incerta não devem virar um botão irrestrito de ignorar. Exceções de certificado continuam específicas e temporárias.
- G1/G5 só aplicam bloqueio com calibração compatível. Há pisos de segurança fixos, como zero falsos bloqueios admitidos e precisão mínima de 0,95; `weakFitBudget.agent` é `false` no contrato. Isso é governança de qualidade, não falta de crédito (`funnel-policy.ts`).
- Mapeamentos OSM estavam vazios no painel lido. Ativar a fonte sem índice/mapeamento para o novo segmento não cria cobertura automaticamente.

Há também limites fixos de formato, não apresentados como cotas de consumo: até 200 cidades/configuração, 50 termos por lista, 50 CNAEs, 10 definições de público e 12 produtos no payload de campanha; contato mínimo configurável entre 0 e 20; seis métricas de porte, até 20 faixas por métrica, peso até 1.000 e validade até 3.650 dias. Comprimentos de nome, URL, descrição, consulta e listas de enumeração também são validados. Fontes e tipos de contatos são catálogos finitos, não um número de ferramentas livremente extensível. Referências: `routes.ts`, `search-configuration.ts`, `decision-contracts.ts`, `discovery-policy.ts`. Aumentar esses formatos requer alteração de contrato/código; não deve ser confundido com desbloquear consultas já autorizadas.

## 4. Action Engine: conhecimento não é autorização de execução

O registro `backend/src/modules/action-engine/capabilities/index.ts` não registra `radar.*`; a busca por Radar neste módulo não encontrou integração. `campaign.create_draft` pertence às campanhas de marketing/publicidade, não às campanhas do Radar. O catálogo não pode ser ampliado por um documento recuperado.

O caminho existente, a reutilizar, é:

1. Admin → Strategy Engine → Strategy Packs: criar pack de operação do Radar separado do Blackbook.
2. Enviar Markdown/TXT/DOCX/PDF; extração, curadoria e embeddings geram propostas.
3. Revisar/aprovar os itens e publicar uma versão. Upload ou aprovação sozinhos não são publicação.
4. Ativar binding compatível com o perfil **`growth_strategist`**, módulo/workflow efetivamente usados no intake. Não presumir `action_engine` como filtro: o retrieval usa também o contexto do Harness, cujo módulo padrão é `marketing_studio`.
5. Comprovar recuperação pelo Harness e revalidação do conteúdo/publicação/binding no backend. Registrar ID, versão/hash, perfil, escopo e perguntas de teste.

Código: `strategy-engine/routes.ts`, `ingestion.ts`, `publications.ts`, `projection.ts`; runtime `mission_conversation.py`, `retrieval.py`, `runtime_store.py`; backend `action-engine/mission-source-verifier.ts`.

Ingestão/embeddings podem gerar chamadas pagas e não foram executados nesta auditoria. O importador antigo `scripts/strategy-knowledge/import-knowledge.mjs` não deve ser usado como atalho para contornar a governança de publicação.

O conteúdo recuperável deve explicar objetivos, configuração comercial, cidades/UFs, critérios, novo lote, retomada, atualização, reanálise de dados salvos, contatos, evidências, revisão, qualidade, exportação e futuro destino no CRM. Deve distinguir resultados com lacunas de falha técnica e nunca prometer contato, site ou funcionamento confirmado sem evidência.

Não inserir este relatório técnico no RAG compartilhado. `internal_only` controla apresentação de fonte, mas não é prova de autorização exclusiva de `yux_admin` para todos os fatos que o modelo recebe. O guia comum não conterá fornecedores, modelos, preços, chaves, recibos ou parâmetros internos confidenciais.

**Estado desta entrega:** auditoria e plano local, não conhecimento publicado. Ensinar a orientar o uso do Radar cabe na publicação de conhecimento; criar/retomar campanhas pelo Action Engine exige adaptadores e Action Pack próprios, uma implementação adicional, não uma consequência automática da documentação.

## 5. Verificação executada

- Backend: `npx vitest run tests/radar-operational-limits.test.ts tests/radar-search-capacity.test.ts tests/radar-research-availability.test.ts tests/radar-funnel-agent-readiness.test.ts tests/radar-capture-continuation.test.ts tests/radar-capture-capacity.test.ts tests/mission-source-verifier.test.ts` → 47 aprovados; 53 testes dependentes de banco não executados; 6 arquivos aprovados, 1 ignorado.
- Frontend: `npx vitest run src/components/platform/admin/RadarOperationalLimitsPanel.test.tsx src/components/platform/admin/RadarSourceManagementPanel.test.tsx src/components/platform/admin/LlmUseCaseRoutingPanel.test.tsx` → 20 aprovados em 3 arquivos.
- Navegador: Admin autenticado recarregado, política e catálogo de packs lidos, lote concluído conferido. Sem mutações de configuração ou publicação.

Não houve teste pago novo, mudança de código de execução, commit/push ou deploy nesta conferência. O plano de conhecimento está em `docs/superpowers/plans/2026-10-22-radar-action-engine-knowledge.md`.

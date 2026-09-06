# Decisões de execução — correções integradas YUX Hub

## D-001 — Base e isolamento do trabalho

- Status: decidida.
- Decisão: usar `000f8bce9c923c2c4f78c307efe58479eb7deb4a` como base reconciliada e a branch `codex/yux-remediation-integrated` para as correções.
- Motivo: o HEAD é exatamente o commit auditado e não há alterações versionadas locais; os arquivos não versionados pertencem ao usuário e permanecem fora do escopo.

## D-002 — Numeração de migrations

- Status: decidida.
- Decisão: preservar `0001`–`0152` sem alteração. A integridade do migrador não exigiu migration própria; `0153_service_roles_and_tenant_scope.sql` foi usada para papéis/RLS. As próximas reservas são `0154` para leases/tentativas, `0155` para publicações e `0156` para política de retrieval.
- Motivo: o repositório contém 55 arquivos de migration e `0152` é o maior número presente no início da execução. O nome final será ajustado à implementação real; número reservado não obriga criar migration vazia.

## D-003 — Ambiente de integração

- Status: decidida.
- Decisão: o ambiente descartável usará PostgreSQL 17 e Redis 7 reais, nomes/volumes exclusivos de teste e bloqueio explícito de hosts/bancos que não atendam ao prefixo `yux_test_`. Provedores externos serão substituídos somente na borda por servidor HTTP determinístico.
- Motivo: cumprir o contrato de T02 sem apresentar mocks de persistência ou fila como prova de integração.

## D-004 — Dados operacionais não disponíveis localmente

- Status: pendente de ambiente, sem bloquear tarefas locais.
- Itens pendentes: domínio administrativo seguro definitivo; destino e custódia de backup; CPU/memória/armazenamento da VPS; inventário de backups externos; digests efetivamente implantados; contas de teste/live dos provedores.
- Tratamento: T04 não será declarada aceita sem ensaio real de restauração e acesso; T11/T13/T22/T31 usarão provedores controlados localmente e manterão separado qualquer aceite live.

## D-005 — Metas operacionais iniciais

- Status: decidida para ensaio.
- Decisão: RPO alvo de até 1 hora e RTO alvo de até 4 horas, como definido no plano. Qualquer ajuste exige medição e justificativa registradas antes do piloto.

## D-006 — Flags e configuração observadas

- Status: registrada.
- Compose atual: criação conversacional desativada por padrão no backend, formulário de compatibilidade ativado por padrão no frontend, curadoria de conhecimento ativada e limite de site configurado em 30 páginas.
- Regra: presença/configuração não será apresentada como validação operacional; nenhum segredo será copiado para manifestos ou logs.

## D-007 — Fronteira durável dos webhooks omnichannel

- Status: decidida.
- Decisão: o reconhecimento de webhook Meta depende do commit conjunto de `channel_webhook_events` e do evento de domínio, nunca do enqueue no Redis. A delivery referencia o UUID persistido e resolve organização/conexão novamente no servidor.
- Motivo: eliminar perda entre banco e fila, preservar deduplicação por evento externo e impedir que dados de tenant fornecidos pelo job substituam a autoridade da conexão persistida.

## D-008 — Identidade e fronteira do despacho de sequências CRM

- Status: decidida.
- Decisão: cada passo usa `sequence:<enrollmentId>:step:<stepId>` como identidade imutável de execução; email e WhatsApp são materializados como intenções locais na mesma transação do evento de domínio. Somente os handlers nativos fazem a chamada externa, depois de revalidar consentimento, conexão e restrições do canal.
- Motivo: concorrência e indisponibilidade do Redis não podem duplicar nem perder o efeito, e um aceite do provedor não deve ser confundido com entrega final sem o recibo correspondente.

## D-009 — Registro executável e indisponibilidade honesta de jobs

- Status: decidida.
- Decisão: um job só pode ser produzido se existir no registro único com schema e handler. Capacidades ainda sem integração automática não usam um job que falhará depois: agendamento vira tarefa humana identificada e simulação fica restrita a um ledger de sandbox sem conexão com conversas reais.
- Motivo: eliminar sucesso aparente seguido de falha inevitável no worker e impedir que dados sintéticos sejam apresentados como interação de cliente.

## D-010 — Identidade de intenção para efeitos de provedores

- Status: decidida.
- Decisão: usar o UUID do run do Action Engine como `intentId` quando a origem for uma ação e exigir UUID explícito nas operações administrativas. Hash do payload, aprovação e hash do objeto aprovado ficam congelados com a intenção; alteração legítima posterior cria nova intenção.
- Ambiguidade: depois que a chamada externa começou, erro de rede compatível com resposta perdida não autoriza repetição. O estado permanece `unknown` e segue para reconciliação ou revisão manual; exatamente uma chamada não é alegada quando o provedor não oferece deduplicação/reconciliação suficiente.
- Motivo: distinguir retry da mesma decisão de uma nova decisão comercial, sem ocultar efeitos possivelmente aceitos pelo provedor.

## D-011 — Topologia e transição das filas

- Status: decidida.
- Decisão: separar cargas em quatro filas por classe, conservando nome e identidade do job. `yux-jobs` é somente compatibilidade de drenagem; a API nova não publica em dois destinos. A liderança dos schedulers depende de advisory lock PostgreSQL, não da quantidade de containers.
- Limite inicial: 2 workers lógicos interativos, 1 de ingestão, 2 externos e 1 de manutenção por processo. A serialização local por organização/provedor é suficiente apenas para a topologia inicial de uma réplica por classe; escala horizontal exige limitador distribuído e nova evidência.
- Motivo: evitar que curadoria longa bloqueie atendimento e impedir que escala operacional multiplique timers ou efeitos externos.

## D-012 — Saúde não é presença de configuração

- Status: decidida.
- Decisão: liveness responde apenas pelo processo; readiness básica cobre banco e Redis; saúde operacional autenticada cobre workers, filas, outbox, Harness e provedores. Falha terminal histórica continua visível como contagem, mas não mantém incidente atual aberto sozinha.
- Credenciais: banco ativo com segredo decifrável prevalece sobre ambiente permitido. Ausência ou segredo inválido cai para ambiente sem expor valor. `verifiedAt` só será preenchido por teste operacional explícito do provedor.
- Custos: ausência de preço ou usage é `NULL` e `unavailable` com motivo; zero fica reservado a medição verdadeira de custo zero.

## D-013 — Release é a identidade do conhecimento publicado

- Status: decidida.
- Decisão: uma publicação estratégica cria snapshot e hash imutáveis; edição posterior cria outra release e outros cards projetados. O ponteiro corrente é mutável, o conteúdo publicado não.
- Isolamento: documentos privados deduplicam apenas dentro da organização proprietária. Hashes globais usam índice separado; conflito jamais serve como canal para descobrir arquivo de outro cliente.
- Sementes: conteúdo histórico sem evidência localizável é `seed_example`, não doutrina atribuída a uma fonte privada.

## D-014 — Arquivo íntegro precede o estado enfileirado

- Status: decidida.
- Decisão: a ingestão estratégica só muda para `queued` depois que os bytes foram recebidos em streaming, validados, movidos para o nome interno definitivo e relidos para confirmar tamanho e SHA-256. Documento, ingestão e evento de outbox são confirmados em uma única transação; falha posterior à movimentação conserva o arquivo em quarentena.
- Recuperação: banco/outbox são a autoridade, Redis é transporte. O job tem identidade estável, lease cercado por proprietário/tentativa e pode ser reconciliado por nova leitura do estado. Duplicidade por hash é limitada à organização proprietária.
- Limite de extração: ausência de texto útil em PDF é uma necessidade explícita de OCR, não sucesso degradado nem conteúdo pronto para revisão.
- Motivo: impedir arquivo órfão ativo, fila apontando para bytes inexistentes, duplicação após reinício e publicação acidental de documentos digitalizados sem extração verificável.

## D-015 — Evidência verificável precede conhecimento estratégico

- Status: decidida.
- Decisão: somente proposta estruturada com documento, hash, localização e trecho literal conferido contra a extração pode chegar à revisão. Derivação é marcada separadamente; raw, saída degradada e instruções encontradas dentro da fonte não adquirem autoridade.
- Identidade: o hash canônico do tipo, título, princípio e evidências é independente da ordem das chaves JSON. Duplicidade exata é impedida por pack; similaridade apenas cria conflito para decisão humana e nunca cruza escopos.
- Recuperação e custo: hashes de entrada identificam checkpoints de extração, lote de curadoria e embedding. Resultado já concluído é reutilizado em retries; uso conhecido é registrado atomicamente com o checkpoint. Não se promete deduplicar cobrança externa quando a chamada cai antes de devolver um resultado persistível.
- Publicação: o modelo só propõe. Aprovação, rejeição ou edição exige usuário autenticado, motivo e nova validação da evidência; somente T19 poderá materializar uma release publicada.

## D-016 — Governança confirmada faz parte da publicação

- Status: decidida.
- Decisão: público, perfis permitidos, perfis bloqueados e conjunto exato de itens aprovados pertencem ao snapshot imutável e ao hash da publicação. O ponteiro corrente e a versão de governança avançam apenas depois que validação, projeção e evento forem concluídos na mesma transação.
- Concorrência: a interface envia `expectedVersion`; edição ou publicação concorrente perde com 409 e precisa reabrir o estado efetivo. Repetir conteúdo idêntico não ressuscita nem amplia permissões anteriores.
- Conteúdo: publicação degradada de texto bruto não é uma opção operacional. Conhecimento manual segue permitido somente depois de virar proposta revisada com evidência verificável. Até a validação explícita de T20, a projeção estratégica não declara fallback lexical quando o embedding estiver indisponível.
- Outbox: administradores de cliente podem emitir o evento da publicação exclusivamente pelo contexto `api` com organização cercada pela RLS. Papéis internos conservam o fluxo existente; membro, worker e runtime permanecem sem esse direito.
- Retorno: retirar o ponteiro corrente desativa a versão sem modificar o snapshot histórico e sem reativar regra mais ampla.

## D-017 — Elegibilidade antecede ranking e limite

- Status: decidida.
- Decisão: estratégia e conhecimento empresarial usam uma única função versionada no PostgreSQL. Organização, contrato, publicação corrente, aprovação, perfil, audiência e binding ativo são condições de elegibilidade; somente depois delas ocorrem score, desempate estável e limite.
- Índices: os IDs aprovados de releases e publicações são normalizados em relações imutáveis, e o caminho lexical usa índices GIN parciais sobre conteúdo curado/aprovado. O benchmark de 10 mil trechos atingiu Recall@5 e p95 exigidos sem pgvector; portanto, a extensão não é adicionada sem necessidade medida.
- Embeddings: similaridade JSONB é calculada somente sobre candidatos autorizados. Na ausência do embedding de consulta ou de candidato compatível, o resultado declara modo lexical degradado e motivo estruturado, sem abrir acesso a raw, rejeitado, rascunho ou arquivado.
- Cache: a identidade inclui organização, contrato, perfil, audiência, módulo/workflow/canal, versão da política, publicações, fingerprint dos bindings, modelo e hash da consulta. Nova publicação ou alteração/revogação de binding produz identidade diferente; o caminho atual consulta a fonte autoritativa a cada execução e não reaproveita resposta antiga.
- Auditoria: rascunhos possuem endpoint exclusivo de curador, rotulado `UNPUBLISHED_DRAFT_AUDIT`; a resposta não implementa `RetrievalResultV1` e não pode ser usada como contexto de agente.
- Compatibilidade: a interface canônica rejeita campos desconhecidos. A RPC antiga traduz apenas os dois nomes historicamente usados e preserva consulta vazia; divergência entre nomes novos e antigos é recusada.

## D-018 — A referência publicada acompanha a decisão até o efeito

- Status: decidida.
- Identidade: a ponte do Harness para missões conserva `publicationId`, `itemId`, versão da política, modo de uso, fingerprint do binding e o hash canônico do conteúdo. Esses campos são indivisíveis; memória de missão não os recebe e referências históricas continuam no verificador legado.
- Consumidores: Marketing, Radar, automação IA, atendimento omnichannel, chat estratégico e supervisor resolvem audiência pelo mesmo construtor de escopo e consultam a política autoritativa de T20. Somente o supervisor pode conservar a audiência explícita e validada da conversa; os demais não podem ampliar o próprio público por payload.
- Execução: o snapshot imutável e sua audiência são ligados ao plano compilado. Antes de reservar uma intenção externa ou destrutiva, o executor consulta novamente a projeção publicada e o binding efetivo. Revogação bloqueia o novo efeito e exige revisão/replanejamento, sem apagar o texto e a evidência históricos.
- Modelo e capacidades: o modelo escolhe apenas referências recuperadas; referência inventada, identidade incompleta ou hash divergente produz erro estruturado sem loop. O compilador e o manifest fixado continuam sendo a autoridade sobre capacidades; uma sugestão não registrada não vira ferramenta executável.

## D-019 — Avaliação estratégica é medição paga, cega e limitada

- Status: decidida para execução autorizada.
- Decisão: o corpus golden permanece identificado e validado apenas como `contract_fixture`. Ganho estratégico só pode ser calculado sobre 144 respostas novas do Harness real, com três condições, duas repetições e o mesmo modelo/configuração.
- Custo: cada caso possui estimativa positiva; o runner exige teto em reais, recusa o lote antes da primeira chamada quando a reserva excede o teto e conserva checkpoints durante a execução. Custo ausente no provedor usa a estimativa declarada, nunca zero; custo em dólar usa conversão explícita quando fornecida.
- Avaliação: dois arquivos JSONL devem pertencer a avaliadores distintos e cegos ao tratamento. Divergência superior a um ponto exige desempate justificado; gates críticos e a validade estrutural das referências usam a decisão mais conservadora.
- Limite: a infraestrutura pode ser aceita sem alegar ganho. A T22 permanece aguardando execução enquanto não houver credencial OpenRouter disponível e autorização explícita para o teto inicial de R$ 100.

## D-020 — O servidor é a autoridade do contexto e dos destinos de correção

- Status: decidida.
- Contexto: `WorkspaceContextV1` é resolvido no backend a partir da organização persistida, contrato ativo, módulos, papel e permissões. O frontend não mantém uma lista privilegiada própria nem decide elegibilidade da conversa. `conversation`, `form` e `unavailable` são modos explícitos da API; formulário não é fallback silencioso.
- Compatibilidade de papel: a autenticação e o contrato público conservam `yux_operator`; somente a consulta ao catálogo legado traduz esse valor para `yux_manager`. A mesma tradução é usada pelo store ao localizar o objeto visual de papel.
- Contrato interno: organização de crescimento não exige contrato comercial. Quando possuir cliente técnico legado e contrato ativo correspondente, o ID é reutilizado; ausência retorna `null` e nunca dispara criação automática.
- Correção: respostas de API emitem `CorrectionTargetV1`, e o frontend produz caminho apenas a partir de chaves e campos enumerados. URLs antigas, campos desconhecidos e destinos sem equivalente seguro não viram navegação. Respostas coletadas durante a missão são persistidas no briefing da própria conversa, salvo escolha explícita futura por uma alteração mais ampla do perfil da empresa.
- Motivo: evitar divergência entre interface e autorização, acesso cruzado por IDs relacionados e perda de contexto causada por encaminhamento do usuário a telas técnicas ou destinos controlados por texto externo.

## D-021 — A fila diária é uma projeção; cada domínio continua dono da tarefa

- Status: decidida.
- Projeção: a fila reúne tarefas pendentes do CRM, de projetos e de intervenções humanas sem criar uma quarta entidade mutável. `sourceType` e `sourceId` identificam a autoridade; responsável, prazo, estado, missão, organização e versão são derivados do registro canônico.
- Conclusão: o endpoint unificado apenas valida o contrato comum e delega ao comando do domínio. CRM conserva `lead_tasks`, projetos conservam `project_tasks` e a missão conserva sua execução humana e observação. Evidência e minutos reais ficam registrados na entidade de origem e no evento/custo correspondente.
- Concorrência: a versão esperada e o bloqueio da linha impedem duas conclusões. A intervenção humana muda a ação para sucesso, registra custo e evento uma única vez e só então agenda a continuação da missão.
- Isolamento: toda leitura e escrita da fila fixa explicitamente a organização já autorizada no contexto do banco. Operadores só concluem tarefa de outro responsável quando são administradores; papéis de cliente permanecem limitados ao workspace e à visibilidade de cada origem.
- Motivo: oferecer um único lugar de trabalho sem sincronização frágil de estados, preservar auditoria e permitir retirar a projeção sem perder tarefas ou histórico.

## D-022 — O desenho da automação não é autoridade de execução

- Status: decidida.
- Autoridade: gatilhos, condições, ações e versões persistidas continuam sendo as entidades executáveis. O grafo é uma representação editável e precisa ser validado no servidor contra tipos registrados, dependências, ciclos, limites e configuração antes de produzir uma versão publicável.
- Separação: salvar mantém rascunho; simular registra correspondência, condições, ações planejadas e bloqueios sem criar execução; ativar fixa um snapshot imutável; pausar impede novos efeitos. Duplicar copia configuração e filhos numa transação, com nova identidade e estado desativado.
- Execução: cada evento possui registro canônico antes de entrar na fila. `flow_id + event_id` e a identidade de cada efeito impedem repetição; o runtime carrega a versão ativa fixada e mantém os IDs dos blocos históricos apenas como dados do snapshot, sem depender de linhas mutáveis.
- Acesso: toda escrita exige `automations.write` na organização explícita do workspace. Membro somente leitura, organização alheia e IDs relacionados a outro tenant não atravessam a fronteira. A rota do portal não inventa organização local nem amplia o papel recebido do servidor.
- Motivo: tornar o editor utilizável sem transformar posição visual, estado React ou payload do navegador em permissão para executar efeitos externos.

## D-023 — Marketing só publica a versão explicitamente aprovada

- Status: decidida.
- Estado: plano, conteúdo, versão, revisão, conexão, intenção e execução do provedor são registros persistidos. A interface apenas apresenta e comanda essas entidades; contadores e estados locais não constituem progresso operacional.
- Publicação: a aprovação fixa versão e hash. A intenção idempotente referencia essa identidade exata e precede a chamada externa; retry não troca o conteúdo nem repete um efeito concluído. O retorno do provedor conserva ID e URL remotos.
- Falha: erro do provedor termina em estado auditável e recuperável, sem converter a intenção em sucesso. Ausência de conexão ativa bloqueia antes do efeito.

## D-024 — Uso de conhecimento exige rastreio consultável

- Status: decidida.
- Estado: indexado, pronto para revisão, publicado, elegível e usado são conceitos distintos. “Usado por agente” exige uma consulta persistida cujo conjunto de resultados contém um trecho do documento; publicação isolada não prova consumo.
- Acesso: o rastreio é cercado pela organização e, para papéis de cliente, exige `portal_safe=true`. Consulta interna não fica acessível por inferência através da listagem da biblioteca.
- Onboarding: valor já confirmado nunca é selecionado automaticamente. A aplicação compara o valor capturado na sugestão com o valor corrente e recusa concorrência, preservando a alteração mais recente para nova revisão humana.
- Continuidade: destinos de retorno continuam derivados do mapa fechado de `CorrectionTargetV1` e aceitam apenas identificadores UUID válidos.

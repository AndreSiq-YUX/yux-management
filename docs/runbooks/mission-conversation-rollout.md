# Rollout e rollback — Conversas de Missão

**Data:** 2026-08-31; continuidade corrigida em 2026-10-23; entrada conversacional corrigida em 2026-10-27
**Responsável:** operação YUX
**Escopo:** Harness existente, backend/worker e frontend do YUX Hub

## Princípios

Este procedimento é subordinado ao gate integrado de
`docs/runbooks/yux-remediation-rollout.md`. Uma conversa não entra em canário
enquanto o manifesto central estiver `blocked`, mesmo que os checks específicos
deste arquivo passem.

- O Harness interpreta e seleciona conhecimento; o Action Engine valida, aprova e executa.
- Desabilitar a conversa impede novos pedidos, turnos e confirmações, mas mantém histórico e não cancela Missions já aprovadas.
- Nenhum rollback apaga conversas, mensagens, snapshots, aprovações ou ledgers.

## Variáveis no Dokploy

Configure no serviço do backend:

```text
MISSION_CONVERSATIONS_ENABLED=false
MISSION_CONVERSATIONS_TENANT_ALLOWLIST=
MISSION_CONVERSATIONS_POLL_MAX_SECONDS=5
```

No deploy por Compose, as três variáveis precisam chegar tanto ao `yux-backend-api` quanto ao `yux-backend-worker`. O arquivo `docker-compose.dokploy.yml` faz esse encaminhamento; depois de alterar os valores no Dokploy, é necessário redeploy dos dois serviços.

Não existe corte por quantidade de mensagens. A antiga `MISSION_CONVERSATIONS_MAX_TURNS` foi removida do código e do Compose; valores remanescentes no painel não têm efeito. Permanecem limite de tamanho da mensagem, rate limit, autorização por conta, idempotência, controle de versão e controles de créditos/orçamento já existentes. O contexto enviado ao modelo continua limitado pelo resumo e pelo histórico recente.

Em falha de envio, a interface conserva o rascunho e o aviso. Só inicia o polling depois que o servidor confirma o aceite; uma atualização automática não apaga um erro de envio. Conflito de versão carrega o estado atual e conserva o mesmo identificador para uma tentativa explícita, sem duplicar a mensagem. Correções inline só fecham após o aceite.

Validação da correção em 23/10/2026: a conversa real `0b969532-7daa-4030-a332-cdcff5cc7228` tinha seis mensagens do usuário e seis do agente, versão 12; a API recebia `MISSION_CONVERSATIONS_MAX_TURNS=6`. O teste de continuidade com PostgreSQL reproduziu a rejeição do sétimo envio antes do ajuste e passou com 25 mensagens do usuário e 25 respostas simuladas após ele, incluindo replay sem duplicação, versão antiga recusada e isolamento entre organizações. Backend completo: 1508 testes passaram, 126 ignorados em suítes existentes. Interface: 19 testes passaram nos dois workspaces que usam o compositor; builds backend/frontend e orçamento do bundle passaram. Chrome local validou conflito 409, preservação do texto, reenvio com o mesmo clientMessageId e versão atualizada, uma mensagem e uma resposta simulada, sem overlay ou erro de aplicação. Não foram feitas chamadas pagas para esta correção; a resposta no navegador de teste é simulada.

Durante o canário, use `MISSION_CONVERSATIONS_ENABLED=true` e coloque somente o UUID da organização YUX na allowlist. Separe vários UUIDs por vírgula. Allowlist vazia com a flag ligada habilita todos os tenants, portanto não deve ser usada antes da liberação geral.

A conversa natural com o Harness é a entrada de novos pedidos. O contexto do workspace, calculado pelo backend, define sua disponibilidade. Quando a flag está desligada ou a organização está fora da allowlist, a interface explica a situação e mantém o histórico consultável; não abre o formulário antigo como substituto. O valor legado `missionCreation.mode=form`, retornado por um backend anterior, também recebe essa explicação no frontend novo.

`VITE_MISSION_FORM_COMPATIBILITY` não tinha consumidor no frontend atual e foi removida do Dockerfile, Compose e exemplo de ambiente. Valores remanescentes no painel não controlam a entrada. A mesma organização deve estar liberada em `MISSION_CONVERSATIONS_TENANT_ALLOWLIST` na API e no worker interativo; preserve os UUIDs já presentes. Não esvazie a lista para liberar apenas um cliente, pois lista vazia libera todos os tenants quando a flag está ligada.

Uma conversa não exige escolher pack, prazo, verba ou autonomia antes de explicar o objetivo. O Harness reúne contexto e propõe os próximos passos; o briefing e o plano são confirmados nas etapas correspondentes. Não classificar automaticamente uma campanha comercial ou orgânica como lançamento de mídia paga. A ausência de um pack executável não impede conversar e construir a estratégia, mas impede prometer uma automação que ainda não exista.

Orçamento zero é permitido para propostas sem gasto de execução. Na confirmação do briefing, custo, horas e contatos zero são preservados em vez de substituídos por tetos maiores; limites ausentes assumem zero, e valores inválidos são recusados. Isso não torna gratuitas as chamadas de IA nem autoriza pesquisa, mídia, mensagens ou outro consumo pago. O planejamento e a execução continuam sujeitos aos custos reais, créditos, estimativas, aprovações e bloqueios existentes. Um plano com custo estimado maior que zero não cabe num limite de execução zero.

Verificação operacional da entrada: consulte `GET /api/workspace/organizations/<UUID>/context`. `missionCreation.mode=conversation` confirma a entrada; `reasonCode=mission_conversation_not_allowlisted` identifica uma liberação pendente dessa organização. Confirme também a configuração equivalente do worker antes de criar um pedido. Mudança de ambiente/deploy e eventual teste pago precisam da autorização correspondente; não aprovam nem executam missões existentes.

## Ordem de implantação

1. Fazer deploy do Harness e validar `/health` e o contrato de `/missions/conversations/respond`.
2. Fazer deploy do backend e worker com a flag desligada.
3. Aplicar migrations no container do backend.
4. Validar health do backend, fila e conectividade com o Harness.
5. Fazer deploy do frontend.
6. Ligar a flag somente para a organização interna YUX.
7. Executar o walkthrough de aceitação; depois ampliar a allowlist por contrato selecionado.

## Migration no Dokploy

O container observado em produção é `yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1` e o diretório da aplicação é `/app`. Para não depender do sufixo gerado pelo Dokploy, descubra e valide o nome antes:

```bash
docker ps --filter 'name=yux-backend-api' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
BACKEND_CONTAINER="$(docker ps --filter 'name=yux-backend-api' --format '{{.Names}}' | head -n 1)"
test -n "$BACKEND_CONTAINER" && docker exec -i "$BACKEND_CONTAINER" sh -lc 'cd /app && node dist/scripts/apply-migrations.js'
```

Com o nome atualmente conhecido, o comando direto é:

```bash
docker exec -i yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 sh -lc 'cd /app && node dist/scripts/apply-migrations.js'
```

Reexecutar é seguro: o runner aplica somente migrations ainda não registradas.

## Verificações de saúde

- Disponibilidade da conta: cada turno resolve o ator ativo, vínculo com a organização, contrato atual, módulos e permissões pelos mesmos registros do contexto do workspace. O brief e a declaração do usuário não concedem acesso. `operationalContext.accountAvailability` é a evidência do sistema; `tools` distingue módulo habilitado, planejamento elegível e bloqueios da integração. `connections` separa conexão ativa, ausente e consulta não verificada. Capabilities e packs enviados ao Harness são filtrados por esse acesso; a execução continua sujeita aos gates, preflight, consentimento e aprovações existentes. Um pacote só entra quando todas as etapas de sua topologia estão elegíveis.
- O agente informa fatos de configuração da YUX, em vez de perguntar ao cliente se um recurso está habilitado. Uma falha técnica pede verificação pelo sistema; um “sim” na conversa não habilita recursos. Perguntas de estratégia, horários, oferta e autorizações permanecem com o cliente. O conhecimento estratégico e funcional continua comum, independentemente dos gates operacionais de cada conta.

- Conhecimento estratégico: consultar a mesma publicação governada em duas organizações; livros e guias internos são comuns, enquanto dados `company` permanecem exclusivos da organização e contrato atuais. A configuração por conta habilita execução, não o conhecimento da ferramenta. Ver detalhes em [Radar / conhecimento comum](radar-action-engine-rollout.md#conhecimento-comum-e-contexto-privado).

- Harness `/health` responde e o backend indica `planner.available=true`.
- `/api/action-engine/operations/health?organizationId=<UUID>` mostra a flag e a allowlist como esperado.
- `acceptedToFirstAgentMessageLatencyMs.p95` permanece abaixo de 20 segundos.
- Taxa de falhas de turno permanece abaixo de 5% em janela de 15 minutos.
- Vazamento entre tenants e sugestões não autorizadas permanecem em zero.
- Uma confirmação cria exatamente uma Mission e o plano no chat tem o mesmo subject da aprovação.
- Mensagens, fontes e atividade continuam visíveis após refresh.

## Sequência de canário

1. Organização interna YUX, com pelo menos campanha completa, funil + nutrição e revenue recovery.
2. Um contrato cliente com Campaigns, Landing Pages e Campaign Launch Agent.
3. Dois a cinco contratos adicionais, observados por 24 horas.
4. Liberação geral somente após os golden gates e SLOs permanecerem aprovados.

## Gatilhos objetivos de rollback

Rollback imediato se ocorrer qualquer um destes eventos:

- qualquer fonte, mensagem ou contexto de outro tenant;
- qualquer sugestão de capability não contratada ou não permitida;
- perda ou troca de ordem de mensagens;
- mais de uma Mission para a mesma confirmação;
- hash/subject do plano no chat diferente da aprovação;
- p95 de primeira resposta acima de 20 segundos por 15 minutos;
- taxa de erro de turnos acima de 5% por 15 minutos.

## Ação de rollback

1. Definir `MISSION_CONVERSATIONS_ENABLED=false` no backend e redeploy/restart pelo Dokploy.
2. Manter tabelas e mensagens; não executar limpeza nem migration reversa.
3. Interromper novos jobs `action-engine.processMissionConversation`. Jobs ainda não iniciados podem permanecer na fila porque o handler rejeita versões/estados obsoletos; durante incidente de segurança, pause o worker até a triagem.
4. Manter o frontend com a entrada conversacional: ele explica a indisponibilidade dos novos pedidos sem substituir o chat pelo intake antigo.
5. Permitir que Missions já aprovadas continuem sob seus envelopes, kill switches e aprovações existentes, salvo se o incidente afetar execução.

## Recuperação para frente

### Erro temporário 502/503/504 no envio

O frontend aguarda `yux-backend-api` saudável no Compose. O healthcheck consulta `/api/health/ready`, que exige banco e Redis disponíveis. Isso reduz a janela de início sem backend pronto; não é uma promessa de deploy sem interrupção de conexões já abertas.

Somente o POST idempotente de mensagens é repetido automaticamente: até quatro tentativas com esperas de 1/2/4 segundos, conservando `clientMessageId`, conteúdo e versão. 403, 409, 500 e `mission_conversations_disabled` não são repetidos. Depois de esgotar tentativas, o texto permanece no compositor com aviso em português e reenvio manual usando o mesmo identificador. Não aplicar retry genérico a aprovações ou outros efeitos.

Na investigação de 23/10/2026, o print tinha 502 e a tentativa iniciada por “e agora” não estava gravada. A API retornou 200 para prontidão, continha a remoção do limite de seis mensagens e o catálogo compartilhado. Os commits de Projetos `0f258c3` e `7cba84f` conservavam essas correções e foram integrados por fast-forward. Os logs disponíveis eram do frontend substituto e não continham a falha antiga: a hipótese de interrupção durante deploy é compatível com a configuração encontrada, mas o instante e a origem exata daquele 502 não foram comprovados.

A homologação `b91943fe-41a2-43a4-955f-0d95e352a2fd` é um registro de teste de planejamento no workspace interno, diferente da conversa de captação `0b969532-7daa-4030-a332-cdcff5cc7228`. Foi observada em `pending_plan_approval`, versão 14, uma aprovação de plano pendente e zero ações executadas. O texto correto do status é “Plano aguardando aprovação”. O marcador de aprovação em `radar.capture.start` indica um requisito posterior; não é um pedido atual de pesquisa. O teto R$ 1 é um parâmetro desse teste e não uma cobrança nem autorização de chamada paga. Não aprovar ou iniciar essa missão de homologação como parte da recuperação do chat.

A interface apresenta os dois efeitos do Radar em linguagem comercial e explica a aprovação específica da pesquisa, sem modificar o payload assinado, o subject hash, a autorização ou o histórico. Os controles “Ativa” identificam capacidades habilitadas; não indicam que houve execução.

O detalhe da missão não consulta em aba oculta nem durante um comando do usuário. Enquanto aguarda aprovação de plano, consulta a cada 15 segundos; durante processamento, mantém cinco segundos. O próximo ciclo só é agendado depois de concluir o anterior. Uma falha de atualização preserva os dados exibidos e apresenta aviso em português, removido após recuperação; a promessa não fica sem tratamento. Isso reduz 429 gerado por abas simultâneas sem alterar o rate limit global nem as regras de autorização.

- Conversa em `collecting_context` sem resposta: confirme o health do Harness, reative o worker e reenvie o job com o mesmo `conversationId` e `requestedVersion`.
- Retry de mensagem usa o mesmo `clientMessageId`; nunca gere outro ID para uma tentativa incerta.
- Conversa em `planning`: reenvie `action-engine.planMission` com o `missionId` e a versão atual. O job idempotente não cria outro plano equivalente.
- Confirmação incerta: repita a confirmação com o mesmo `briefHash`; o vínculo idempotente retorna a Mission já criada.
- Projeção de chat ausente após aprovação: preserve a decisão; reconstrua a projeção a partir do ledger, sem reaplicar aprovação.
- Fonte com drift: publique/corrija a fonte no Harness, gere nova resposta e exija nova confirmação do briefing/plano.

## Evidências a preservar

Registre horário, tenant, conversation ID, Mission ID, job IDs, hashes de briefing/plano, versão do Harness e métricas agregadas. Não copie conteúdo de cliente para tickets externos; use IDs e traces redigidos.

# Radar Comercial no Action Engine — liberação assistida

Audiência: Admin global YUX e implementação. Preparação local de 22/10/2026; não comprova deploy.

## Escopo

radar_prospecting@1.0.0: consultar → salvar/selecionar campanha → preflight → aprovação do pedido → aceitar lote → esperar estado persistido → resultados → checkpoint. Dez capabilities, nenhuma com modo autonomous. Publicidade usa outro pack.

O pack inicia um lote novo. Lote pendente, continuação incerta, mudança de revisão, teto insuficiente ou capacidade indisponível bloqueiam o início; resolver pela operação contextual do Radar. Duplicação, critérios, retomada, refresh e reanalyze têm adaptadores registrados, mas não são topologias alternativas deste primeiro pack. Não prometer recorrência.

## Código e banco

1. Confirmar branch, diff e revisão. Fazer backup e ensaio de restauração do ambiente alvo.
2. Aplicar migration 0236_action_radar_commands_and_links.sql antes da API/workers. Não alterar checksum aplicado.
3. Conferir o inventário em docs/releases/yux-remediation-manifest.json; a liberação permanece blocked.
4. Publicar imagens compatíveis de API, worker, runtime Python e frontend somente com autorização de deploy.
5. Encaminhar à API e a todos os workers: RADAR_ACTION_ENGINE_ENABLED=false e RADAR_ACTION_ENGINE_TENANT_ALLOWLIST vazia. Manter os gates de missões e o secret isolado de mutation leases.

## Conhecimento funcional

1. Revisar o guia funcional v1.1. Não ingerir a referência técnica.
2. No backend: npx tsx scripts/prepare-radar-action-knowledge.ts. Não chama modelos nem publica.
3. Conferir hash, oito propostas e evidências; seguir [checklist de curadoria](../knowledge/radar-commercial-curation-checklist.md).
4. Ingerir o documento real e conservar documentId/hash/evidências. Gerar embeddings somente com serviço/modelo autorizado. Não importar status approved nem fabricar publicationId.
5. Publicar client_safe após revisão humana, com owner e organização explícitos. Registrar releaseId/itemIds/hash.
6. Ativar bindings growth_strategist / marketing_studio / mission_intake_conversation e growth_strategist / radar / radar_commercial_mission.
7. Conferir recuperação no consumidor real. O planejamento usa consulta lexical auditada sem chamada paga e registra degradação. Sem fonte autorizada, bloqueia. A fonte é revalidada antes do efeito externo; revogação deve impedir nova execução.

## Piloto

1. Escolher organização com Radar e Action Engine habilitados, ou workspace interno elegível. Confirmar ator/criador Admin global ativo.
2. Habilitar o gate somente para o UUID escolhido. Conferir catálogo da organização e ausência do pack para operador, clientes e outras contas.
3. No formulário, selecionar “Pesquisar empresas no Radar”; definir público, UF, oferta e quantidade. Na conversa, confirmar os mesmos dados antes do plano. Usar modo assistido.
4. Revisar plano/artefato. Salvar campanha não dispara pesquisa. Campanha existente exige teto finito que não supere o envelope; o adaptador não eleva limites.
5. Conferir preflight e aprovar o pedido concreto. Preservar organizationId/missionId/planId/actionRunId/requestId/operationId/campaignId e revisões. A aprovação vincula os parâmetros resolvidos.
6. Conferir uma campanha, solicitação e outbox. Reiniciar worker/API durante a espera não pode criar outro lote.
7. Conferir completos, lacunas, fora do perfil, aguardando e aprovados. Pesquisa não equivale a receita, aprovação comercial ou autorização de contato.
8. Canário pago somente com autorização explícita para serviços/modelos e teto; conferir consumo e qualidade na área Admin. Não executado nesta entrega.

## Desligamento

Desligar o gate impede novos comandos e remove o pack do catálogo. O acompanhamento de operações aceitas continua pelo ledger e pelo job action-engine.reconcileRadarOperations. Não excluir comandos, links, aprovações, claims ou outbox para “reiniciar”.

O marcador persistido radar_needs_schedule conserva o reagendamento quando falta confirmação da fila. Missão pausada/expirada não prossegue com efeitos. Reconciliar operações aceitas antes de rollback de imagem; manter compatibilidade com a migration aditiva.

## Evidência e limites

PostgreSQL 17 isolado; sem base de produção. Testes cobrem idempotência concorrente, espera/reinício/falha de confirmação da fila, quatro papéis via HTTP, cross-tenant, publicação/binding/revogação e jornada assistida.

Na jornada, disponibilidade e descoberta são simuladas; aceite canônico, aprovações, ledger, claims, outbox, espera e métricas usam banco real. O término da pesquisa é simulado por persistência de fixture. Não é teste pago dos fornecedores.

Redis real e fila distribuída completa ainda exigem homologação. A revisão automática rejeitou a preparação combinada de Redis/PostgreSQL com a razão “bloqueado por política”; a alternativa usou somente PostgreSQL já instalado e fila injetada.

Autonomia/recorrência dependem da tarefa 9, com concessão revogável, reservas e tetos agregados. Os gates desta entrega não as autorizam.

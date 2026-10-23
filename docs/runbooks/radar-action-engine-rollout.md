# Radar Comercial no Action Engine — liberação assistida

Audiência: Admin global YUX e implementação. Preparação local de 22/10/2026; não comprova deploy.

## Escopo

radar_prospecting@1.0.0: consultar → salvar/selecionar campanha → preflight → aprovação do pedido → aceitar lote → esperar estado persistido → resultados → checkpoint. Dez capabilities, disponíveis somente em modo assisted. Simular, preparar, autonomia e recorrência exigem outra etapa de validação. Publicidade usa outro pack.

O pack inicia um lote novo. Lote pendente, continuação incerta, mudança de revisão, teto insuficiente ou capacidade indisponível bloqueiam o início; resolver pela operação contextual do Radar. Duplicação, critérios, retomada, refresh e reanalyze têm adaptadores registrados, mas não são topologias alternativas deste primeiro pack. Não prometer recorrência.

## Código e banco

1. Confirmar branch, diff e revisão. Fazer backup e ensaio de restauração do ambiente alvo.
2. Aplicar migrations 0236_action_radar_commands_and_links.sql e 0237_radar_action_worker_scope.sql antes da API/workers. Não alterar checksum aplicado. A segunda concede a leitura/escrita restrita à organização para o worker e a função de lock compartilhado da política; não permite ao worker alterar limites globais.
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

## Aceite técnico local — 22/10/2026

Base 831bc1e; branch codex/radar-action-engine-assisted. Preparação do conhecimento em c6d6ca7 e implementação inicial em b9b3de6. A revisão independente deste intervalo apontou oito achados importantes, corrigidos em um único passe de ajustes; nenhum achado menor foi adiado pela revisão.

| Achado | Correção e contraprova |
| --- | --- |
| Identidade de orquestração incompatível com RLS do Engine | Jobs action-engine usam identidade de serviço interna e escopo explícito por organização. O ator de negócio continua sendo o criador Admin global ativo, revalidado pelo adaptador. Jornada usa createJobProcessor e conexão yux_worker reais. |
| Ledger/links e alias da solicitação sem acesso adequado ao worker | Migration 0237; políticas restritivas por organização; testes negativos com outra organização e escopo vazio. Escritas após commit usam pool contextual, conservando SET LOCAL. |
| Reconciliador global perdia o escopo de Radar | Busca global lê metadados do Engine, depois consulta Radar por organização em contexto próprio. Agendamento e coleta de métricas também definem esse escopo. |
| Recuperação genérica perdia a referência tipada de Radar | Ledger e outbox canônicos do Radar conservam requestId. Replay e crash entre aceite canônico e persistência do Engine recuperam o mesmo ref, sem novo lote ou nova chamada. Ausência de evidência aceita exige revisão manual. |
| Aprovação sem resumo comercial | API projeta campanha, quantidade, UF e revisões; orçamento aparece somente ao Admin YUX. Interface exibe o resumo junto à decisão. HTTP direto com quatro papéis e testes de componente. |
| Métricas incompatíveis com a interface | Primary usa objetos com key/unit; frontend admite group opcional na entrada e determina o grupo na renderização. Contagens reais substituem fallback de receita. |
| Modos sem resultados intermediários simulados | Catálogo, entradas HTTP, worker, capacidades e interface limitados a assisted; shadow/prepare/autonomous rejeitados. Não oferece concessão de autonomia no painel Radar. |
| Cards de estratégia ausentes dos IDs autorizados | IDs verificados de cards integram a allowlist de fontes; retrieval real com conexão yux_worker, escopo, binding e revogação. |

A contraprova no worker revelou ainda dois detalhes necessários ao caminho canônico: SELECT FOR SHARE exige privilégio de atualização, resolvido por função de lock sem conceder UPDATE da política global; a persistência de métricas enviava array PostgreSQL para campo JSON, agora serializado. A tentativa de atualizar limites globais com o worker continua sendo recusada.

Testes observados antes/depois: permissões do worker, cards autorizados, modos, contrato de métricas, resumo de aprovação, revisões nos artefatos, botão de autonomia e persistência do checkpoint tiveram falhas reproduzidas e passaram após os ajustes. Regressão adicional: replay e recuperação da referência tipada, com uma única solicitação persistida.

Validação reproduzível:

| Verificação final local | Resultado |
| --- | --- |
| Backend Vitest completo | 1503 passaram; 126 ignorados em suítes existentes que exigem configuração específica |
| Frontend Vitest completo | 1200 passaram |
| Python pytest completo | 391 passaram; 7 ignorados |
| PostgreSQL: cinco arquivos de integração Radar/Engine | 5 passaram, com conexões API/worker e políticas reais |
| Chrome desktop e celular | 2 jornadas passaram; criação persistida e detalhe concluído, sem erro relevante de console/overlay/overflow |
| TypeScript backend/frontend e builds | Passaram; bundle budget do frontend passou |
| Contratos e manifesto de migrations | Geração/verificação sem drift; manifesto bloqueado para produção |

- Backend: npm test e npm run type-check.
- Frontend: npm test -- --maxWorkers=2 e npm run type-check.
- Runtime: python -m pytest -q e python scripts/export_mission_contracts.py --check.
- Contratos: npm run generate:mission-contracts, sem mudança nos arquivos gerados.
- PostgreSQL: cinco arquivos tests/integration/radar-action-{journey,http,grounding,idempotency,waits}.test.ts, com YUX_INTEGRATION_DATABASE_URL apontando somente para a base local de testes.
- Navegador: tests/journeys/browser/radar-action-engine.pw.ts, Chrome instalado, localhost4178/4188, viewports 1280×940 e 430×920. Criar missão → formulário Radar → limites assistidos → POST 201 → reload com dados persistidos → detalhe da missão concluída com resultados e resumo da aprovação. Identidade, conteúdo, ausência de overlay, console e largura da página verificados. Browser plugin indisponível; usado Playwright existente, sem instalar navegador.

O teste de planejamento valida retrieval, escopo e contratos sem chamar um LLM real. O servidor de QA não executa Harness pago. A tela pode indicar Harness indisponível nesse ambiente; a qualidade estratégica de uma conversa com o guia publicado permanece como gate do piloto.

O pacote docs/knowledge/publication/radar-commercial.review.json contém oito propostas awaiting_review e hash funcional c7c685d8eb7b9f5b540846ac07295d4df404da5cedd945e97d3757e8b95c329d. Não é uma publicação realizada. Revisão humana, ingestão real, publicação/bindings no ambiente alvo, fila Redis real, restauração de backup, deploy e canário pago permanecem pendentes.

Decisões de execução e custos de reversão:

1. Entregar o fluxo assistido primeiro; autonomia exige concessão e rollout futuros.
2. Preparar propostas determinísticas sem ingestão, embeddings ou publicação pagos; permanece a revisão humana.
3. Reservar 0236 após inventário e testar em stack isolada; o banco alvo ainda precisa de verificação de migrations.
4. Aceitar existingCampaignId no comando de criação/seleção; separar esse comando exigiria nova versão de capacidade.
5. Exigir CNAE normalizado em dígitos no contrato serializável; o planejamento deve normalizar a entrada.
6. Não inventar compensação de atos irreversíveis; casos sem undo canônico exigem revisão manual.
7. Usar somente PostgreSQL instalado após bloqueio da preparação Redis; fila distribuída ainda precisa de homologação.
8. Manter claim de criação até o término, junto ao de campanha; há um claim extra a renovar.
9. Primeiro pack executa um lote novo; jornadas secundárias continuam manuais até extensão versionada.
10. Corrigir três defeitos existentes de persistência encontrados na jornada (arrays JSON, inferência UUID/texto e parâmetros textuais da aprovação); mudanças compartilhadas exigem a regressão completa.
11. Usar identidade de serviço interna, sempre com ator Admin real e escopo Radar restritivo; lock compartilhado sem UPDATE de limites e serialização JSON de métricas completam o caminho real do worker. São mudanças compartilhadas, cobertas pela jornada e regressão.
12. Recuperar pelo ledger/outbox canônicos Radar; ausência de aceite persistido continua exigindo revisão manual.
13. Disponibilizar somente assisted; simulação/preparação precisam de topologias validadas futuras.
14. Manter branch local sem merge/deploy; a integração de release permanece separada.
15. Polling fixo de 15s no piloto assistido; custa consultas extras em pesquisas longas e deve ser revisto antes de ampliar a escala.

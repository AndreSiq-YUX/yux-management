# Radar Comercial no Action Engine — liberação assistida

Audiência: Admin global YUX e implementação. Atualização de produção: 23/10/2026. As seções de aceite local abaixo conservam a evidência histórica; não substituem o resultado do piloto.

## Piloto interno em produção — 23/10/2026

Escopo autorizado: workspace interno YUX (`650e8400-e29b-41d4-a716-446655440001`), modo assistido, até US$ 1 de consumo no OpenRouter para curadoria, embeddings e prova de planejamento. Não autoriza pesquisa paga de empresas, contato, recorrência ou autonomia.

### Conhecimento aprovado e publicado

- Guia funcional v1.1: `docs/knowledge/radar-commercial-action-engine.md`; SHA-256 `c7c685d8eb7b9f5b540846ac07295d4df404da5cedd945e97d3757e8b95c329d`. A referência técnica não foi ingerida.
- Ingestão real `bd93167f-4025-4261-90f1-12206014c90f`; documento `66d02d48-d5c7-4d17-a9d8-1e4a61640a7a`. Worker de ingestão/Redis processou quatro trechos e dois lotes de curadoria.
- As duas propostas automáticas eram amplas; foram rejeitadas com justificativa e preservadas na auditoria. Oito cards específicos, com evidência do guia e embeddings de 1024 dimensões, passaram pela revisão e aprovação do Admin global ativo. A interface confirmou oito aprovados e zero pendentes neste pack.
- Pack `843be996-1c8d-4e0d-b74e-f189bbb15619`, chave `radar_commercial_operations`, versão publicada 1; publicação `3e0dd4c7-6c39-461b-beb1-9f1b60e3b93c`; hash `8187cbd782384f880910af8b2153b3317cae3add25be1865499768bdf4dcf50a`.
- Owner restrito à organização interna. Conteúdo funcional `client_safe` não implica disponibilidade global: owner, bindings e gate mantêm o piloto restrito.
- Dois bindings ativos de `growth_strategist`, ambos restritos à organização: `marketing_studio / mission_intake_conversation` e `radar / radar_commercial_mission`, canal nulo, prioridade 20.
- Recuperação canônica confirmou oito fontes da publicação para ambos os consumidores e zero para outra organização. O planejamento utiliza recuperação lexical auditada, com degradação explícita `query_embedding_unavailable`; não foi demonstrada recuperação semântica nesta prova.

### Implantação e ajustes encontrados pela homologação

- Migrations 0236 e 0237 aplicadas em 23/10/2026, 00:54 UTC. Checksums canônicos respectivos: `504b02eae8c8023b059a3004516770f0d109450a317b74d0e6f84338aec74bc6` e `f6d93ee0a6fe54c53595f396966de37d82c7fdf7861e5bd475e04c62e3f3bbd3`.
- API e quatro workers receberam `RADAR_ACTION_ENGINE_ENABLED=true` e allowlist contendo somente o UUID interno. Gate confirmado ativo no piloto e inativo em outra organização. Workers interactive, ingestion, external e maintenance com heartbeat.
- `afa32ce`: permitir o módulo Radar no editor de vínculos governados.
- `363960b`: projetar o catálogo interno no contrato estrito do runtime e validar antes de enviar HTTP; seis testes de contrato, incluindo os quatro packs existentes.
- `dccbade`: fornecer o schema completo da resposta ao planejador, incluindo o plano aninhado.
- `2e79f8a`: validar os checkpoints próprios de Radar sem exigir coleta de receita; conservar as sete etapas protegidas e a aprovação da pesquisa.
- `8f29869`: restringir a liquidação da reserva ao ciclo, usando o parâmetro `$1` antes ausente na consulta. O teste com PostgreSQL e identidade real de worker reproduziu o erro `42P18` antes do ajuste e passou depois, incluindo rejeição de outro ciclo/tenant. Os 21 testes de planejamento e o build backend passaram.
- Rota `mission_supervisor` específica da organização: `be1df73d-1f9d-4faa-95f5-0175345537ee`, mesmo Claude Haiku 5.5 autorizado, saída máxima de 8000 tokens. O teto global de 2200 não foi alterado. O limite anterior consumia a saída com raciocínio e truncava o JSON do plano.

### Prova da missão e limites

Missão `b91943fe-41a2-43a4-955f-0d95e352a2fd`, “Homologação Radar — guia governado YUX”. O objetivo limita a homologação à geração e revisão do plano de uma campanha B2B no Paraná, quantidade um, sem executar pesquisa ou contato.

Resultado final: plano gerado e verificado, preservado para revisão sem aprovação ou execução.

| Evidência persistida | Resultado |
| --- | --- |
| Missão | `pending_plan_approval`, versão 14 |
| Plano | `6230d99b-66aa-4cd2-8d86-7f7def82de3b`, revisão 1, `pending_approval` |
| Hash do plano | `14294640e2bc3f52b06aa816b6590c66519f63264a8cf26ff5f22cc95bb098c8` |
| Snapshot do contexto | `58584a44-e258-46b2-8561-142583082008`, oito itens de estratégia e oito IDs de fonte da publicação |
| Hash do contexto | `5fd9a01552787095a79feea82b9724ca73812492cd0bd9f1e1db5789b407cf57` |
| Retrieval auditado | `bdcf2875-6b63-4194-8e52-5b710f50c4b5`; contexto de conhecimento `752a6b55a782cfa27cc259f40d2367c4d580e27c81e1560f0d00534d83d306b6` |
| Modelo e uso real | `mission_supervisor`, `anthropic/claude-haiku-5.5`, 10557 tokens de entrada e 4441 de saída |
| Hash do prompt | `2a3daa8b19a2e7596e7be362e0e803435ba99d4d5024936bd43ca179fc8fde6e` |
| Job Redis | `action-engine.planMission-3bee1b3b6f46f77192c71b730f04584f`: completed, uma tentativa, sem failedReason, `{ok:true}` |
| Efeitos | Zero `action_runs` e zero links de operação Radar nesta missão |
| Saúde após deploy | `/api/health/ready` = 200; quatro heartbeats, idades entre 21 e 24 segundos |

A interpretação persistida explica: campanha é intenção, lote é execução e empresa encontrada não é lead aprovado; solicitação aceita não é pesquisa concluída; contato público não autoriza mensagens; conhecimento não concede execução. O plano preserva as sete etapas protegidas, captura com aprovação obrigatória e leitura após `operation.await`. Isso comprova uso do conteúdo na resposta do modelo, além de sua presença no snapshot.

Não tratar um job marcado completed isoladamente como sucesso: tentativas anteriores foram repetidas após bloquear a missão. O aceite acima verifica também o plano, estado da missão, fontes, consumo persistido e ausência de erro na tentativa.

O consumo total é estimado abaixo de US$ 0,25, dentro do limite autorizado de US$ 1. A curadoria e os embeddings somaram aproximadamente US$ 0,1231; diagnósticos e planejamentos acrescentaram consumo pequeno. Não é conciliação da fatura: falhas anteriores não conservaram toda a utilização, e o ledger de planejamento ainda registra `costBrl: 0` no assentamento, sem representar gratuidade. O custo de execução exibido no plano também não é o custo já incorrido para gerá-lo.

Evidências externas ao checkout: `radar-action-engine-assistido/producao-piloto-missao.json`, `producao-piloto-checks.json`, `producao-harness-fundamentacao.txt`, `producao-missao-plano-validado.png` e `producao-publicacao-final.png`, na pasta de visualizações desta auditoria. Logs `rollout-settlement-red.log` e `rollout-settlement-green.log` conservam o antes/depois no PostgreSQL. Os registros históricos `producao-preflight.txt` e `producao-workers-flags.json` conservam migrations, vínculos e configuração dos quatro workers antes do último deploy.

O manifesto global de remediação continua blocked. Este piloto não comprova restore de backup, fornecedores de pesquisa, operação externa com espera/reinício em Redis de produção, autonomia ou recorrência. Os testes locais desses controles permanecem registrados abaixo.

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
8. Canário pago de pesquisa de empresas somente com autorização explícita para serviços/modelos e teto; conferir consumo e qualidade na área Admin. Não executado neste piloto. O consumo autorizado para conhecimento/planejamento está registrado acima.

## Desligamento

Desligar o gate impede novos comandos e remove o pack do catálogo. O acompanhamento de operações aceitas continua pelo ledger e pelo job action-engine.reconcileRadarOperations. Não excluir comandos, links, aprovações, claims ou outbox para “reiniciar”.

O marcador persistido radar_needs_schedule conserva o reagendamento quando falta confirmação da fila. Missão pausada/expirada não prossegue com efeitos. Reconciliar operações aceitas antes de rollback de imagem; manter compatibilidade com a migration aditiva.

## Evidência e limites

No aceite local original, PostgreSQL 17 isolado, sem base de produção. Testes cobrem idempotência concorrente, espera/reinício/falha de confirmação da fila, quatro papéis via HTTP, cross-tenant, publicação/binding/revogação e jornada assistida. A seção de produção acima registra separadamente as verificações posteriores.

Na jornada, disponibilidade e descoberta são simuladas; aceite canônico, aprovações, ledger, claims, outbox, espera e métricas usam banco real. O término da pesquisa é simulado por persistência de fixture. Não é teste pago dos fornecedores.

No aceite local original, a revisão automática rejeitou a preparação combinada de Redis/PostgreSQL com a razão “bloqueado por política”; a alternativa usou somente PostgreSQL já instalado e fila injetada. Posteriormente, o Redis de produção processou a ingestão e o planejamento reais deste piloto. A operação paga de pesquisa, com espera e reinício distribuídos em produção, permanece fora da homologação atual.

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
16. Preservar a pasta ignorada de testes após a revisão automática bloquear sua remoção (“bloqueado por política”); serviços já encerrados e evidências copiadas. Dados temporários do PostgreSQL/logs continuam ocupando disco até limpeza posterior.

Implementação e correções: c6d6ca7, b9b3de6 e 69ff54c. Evidências locais finais (logs, imagens e ledger): pasta radar-action-engine-assistido na área de visualizações desta conversa. A branch permanece local; os únicos documentos não rastreados são os dois arquivos de experimento de 21/10 que já existiam e foram preservados.

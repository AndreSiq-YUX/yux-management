# Radar inventário dos bloqueios do lote

## Escopo e leitura dos registros

Consulta somente de leitura em 19/10/2026, aproximadamente 13:08 UTC, no lote `409fdaa3-ed09-44cf-b4b4-4b36da872a0e`, campanha `958f87b1-96a1-45b5-a095-d9e9eb623f67`, revisão 6. Foram lidos o resumo e os vinte dossiês pelos endpoints autenticados `GET /api/radar/campaigns/:id/capture-operations/latest` e `GET /api/radar/candidates/:id/research`. Nenhuma pesquisa externa foi disparada.

O resumo registra 20 admitidas, 1 concluída, 8 insuficientes e 11 bloqueadas; descoberta encerrada por `target_reached`, não por esgotamento regional. Os 11 bloqueios do pai são seis `radar_presence_refresh_authorization_required` e cinco `radar_research_call_uncertain`.

O dossiê expõe limitações, mas não todos os recibos internos. Duque e Gourmet apresentam autorização de atualização pendente no dossiê e chamada incerta no pai. Isso exige conferir **ambos** os motivos; não prova que o recibo incerto desapareceu. A0.3 deve reconciliar o estado a partir das chamadas e limitações, sem trocar uma causa comprovada por outra por preferência visual.

## Vinte empresas e tarefas responsáveis

Os IDs abaixo identificam candidatos, não novos cadastros a criar. Todos os dossiês estão em `partial`; o estado do item no pai é informado separadamente. Códigos de espera de perfil/qualificação são dependências da etapa indicada, não defeitos independentes a esconder.

| Empresa e candidato | Estado e código do pai | Limitação principal do dossiê | Tarefa e aceite |
| --- | --- | --- | --- |
| Ribeirao Factory — `f2bcaa7e-90c6-4fff-9efb-03b0e2e90e8d` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código; identidade pendente | A0.2/A0.4: autorização válida chega ao filho; releitura idêntica não cria nova análise |
| FRAGON PRODUTOS PARA INDUSTRIA DE BORRACHA LTDA — `24f004f2-55fb-45b6-ba8c-c5310746e37a` | insufficient; sem blocker | Evidência de produtos químicos/borrachas; `radar_profile_claims_rejected` | A5/B3: separar fora do perfil de falha operacional; não prometer interesse de compra |
| Sanutrin Refeicoes — `7acb875b-e624-417b-a996-8273b60ec42c` | insufficient; sem blocker | `radar_qualification_waiting_identity`, `radar_profile_waiting_identity` | A5/C4: investigar identidade ou explicar a lacuna com as verificações realizadas |
| Vila Nova Restaurante — `9d3c9553-c52f-41f3-a07e-1ef55d2eb076` | insufficient; sem blocker | `radar_qualification_waiting_identity`; `robots_disallow`, `http_403`, `limited_public_content` | A5/C4: fonte alternativa permitida ou lacuna explícita; não contornar restrições |
| JEKK ALIMENTACAO & SERVICOS LTDA — `124132c0-f56a-457c-aa9e-06148c7275e5` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código | A0.2/A0.4: autorização por pedido e hash estável |
| Nutrisaude — `e79947cc-5c56-4aff-9b0a-c41fe9af528b` | blocked; `radar_research_call_uncertain` | `radar_qualification_previous_request_uncertain`, `radar_profile_waiting_analysis` | A1: recuperar resposta/recibo ou solicitar tentativa nova vinculada; zero replay silencioso |
| Omega Alimentacao — `cbfb3485-eced-4607-a411-a11461761dff` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código | A0.2/A0.4: mesma política individual e em lote |
| Premium Essential Kitchen — `85748369-7728-4808-b219-cbed96504b2b` | blocked; `radar_research_call_uncertain` | `radar_qualification_previous_request_uncertain`; identidade de grupo | A1/C3.2: conciliar recibo e preservar diferença grupo/estabelecimento |
| Aroeira — `2b8a0d7c-d083-41d6-ad9f-ab6ba3a142a8` | insufficient; sem blocker | `radar_qualification_waiting_identity`, `radar_profile_waiting_identity` | A5/C4: não publicar página de governo como site oficial |
| Suprema * Alimentacao Corporativa — `eb97b55b-482d-4ab6-8dde-2283e870a551` | insufficient; sem blocker | `radar_presence_waiting_public_read`, `radar_qualification_waiting_public_read`, `robots_timeout` | A0.1/C4: leitura/reanálise não depende de teto esgotado de outra fonte; timeout continua diagnosticado |
| SODEXO RETAIL COMERCIO DE REFEICOES LTDA — `7f71f02e-f587-4754-8a2a-06b557f5591f` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código | A0.2/A0.4: atualização autorizada sem invalidar fatos por horário |
| ONDINA ALIMENTACAO E SERVICOS LTDA — `a35896ff-29a2-45a1-a208-97c58af58654` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código; redes com restrição de leitura | A0.2/A0.3: resumo acompanha nova tentativa; não confundir link encontrado com perfil lido |
| CERVANTES TABACARIA E RESTAURANTE LTDA — `5ee860aa-5264-4e18-ac2c-83a3b10bf375` | insufficient; sem blocker | `radar_presence_waiting_public_read`; `https_downgrade_blocked` | A5/B3/C4: triar com evidência, não só nome; fonte permitida ou insuficiência explícita |
| Duque Loja de Conveniencias Ltda — `4df0c923-f49f-43ce-97b0-814022c0e33c` | blocked; `radar_research_call_uncertain` | `radar_presence_refresh_authorization_required`; espera de identidade | A0.2/A0.3/A1: reconciliar as duas causas, preservando recibo incerto até conciliação |
| NUTRI LINE REFEICOES LTDA — `c2dfe23d-e336-401f-ae97-c1f627da5909` | blocked; `radar_research_call_uncertain` | `radar_presence_previous_request_uncertain` | A1: resolver associação sem recomprar chamada por presunção |
| GOURMET SPORTS HOSPITALITY SERVICOS DE ALIMENTACAO LTDA — `ded47ee6-77b1-4ba4-8e0f-aae17689d5b6` | blocked; `radar_research_call_uncertain` | `radar_presence_refresh_authorization_required`; redes não legíveis | A0.2/A0.3/A1: causas técnicas conciliadas, sem declarar rede verificada só por link |
| MEZZO BAR E RESTAURANTE LTDA — `f1e7a78c-4ade-4324-a2a0-655455660a82` | insufficient; sem blocker | `radar_presence_waiting_public_read`; `limited_public_content`, `http_403` | A5/B3/C4: tentativa de atualização com resultado antes/depois; aderência não inferida por CNAE |
| Restaurante P&B — `555c5ef9-914d-471c-b732-e6ed634d5b5e` | blocked; `radar_presence_refresh_authorization_required` | Mesmo código; referência de restaurante em outro estado | A0.2/C3.2/C4: autorização e identidade/geografia; não aceitar homônimo |
| GASTRONOMIA - SOLUCOES EM ALIMENTACAO LTDA — `bc035c1d-db9d-40c1-9438-a604e5b5e483` | insufficient; sem blocker | `radar_qualification_waiting_identity`, `radar_profile_waiting_identity` | A5/C4: resolver marca/domínio com fonte, sem exigir URL manual |
| Pronutri Premium — `8bf5b755-7798-4aa0-bc8d-a05fa3832748` | completed; sem blocker | `radar_profile_claims_rejected`; sem comprovação de intenção de compra | A5/C4: manter campos válidos; mostrar rejeição parcial; concluir pesquisa não aprova contato nem presume demanda |

## Código para tarefa e prova de resolução

| Código ou condição | Responsável | Prova exigida |
| --- | --- | --- |
| `candidate_search_limit_reached`, `query_limit` entre fontes | A0.1 | Serper com cinco usadas não impede Brave com zero; orçamento total continua respeitado |
| `radar_presence_refresh_authorization_required`, `radar_qualification_refresh_authorization_required` | A0.2/A0.4 | Mesmo pedido autorizado tem o mesmo efeito individual/em lote; evidência materialmente igual não exige renovação |
| Pai e filho com motivos diferentes após atualização | A0.3 | Teste compara pai recalculado com `assessRadarCaptureResearch` e conserva todas as causas ainda verdadeiras |
| `radar_research_call_uncertain`, `radar_*_previous_request_uncertain` | A1 | Recibo/resposta recuperada sem rede ou autorização explícita de nova tentativa; recibo anterior mantido |
| `radar_*_waiting_identity` | A5/C4 | Etapa executada com evidência associada ou insuficiência comercial explicada; não sucesso artificial |
| `radar_*_waiting_public_read` | A0.1/A5/C4 | Capacidade de fonte/leitura correta; registrar o impedimento real da página, sem atribuir à chave de IA |
| `radar_profile_claims_rejected` | A1/A5 | Salvar resposta recebida e campos aceitos; rejeitar afirmação sem fonte sem invalidar todo o perfil |
| `robots_*`, `http_403`, `https_downgrade_blocked`, `external_redirect`, `limited_public_content` | C4 | Escolher alternativa permitida ou explicar ausência; nenhum bypass novo |
| Trabalho sem avanço | A6 | Admin vê etapa, último avanço e ação possível; vigia não repete chamada incerta |

Aceite do lote: cada item tem resultado ou motivo atual e acionável; não exigir artificialmente vinte conclusões positivas. Resolver o software não cria identidade, conteúdo público ou recibo que não existe. Antes da recuperação real, atualizar este inventário se o lote tiver mudado e comparar IDs, chamadas e custos anteriores/depois.

## Provas locais de A0 — não são recuperação do lote de produção

| Defeito corrigido | Testes executáveis |
| --- | --- |
| Capacidade por fonte e leitura/reanálise sem nova busca | `radar-search-capacity.test.ts`, `radar-research-planner.test.ts`, `radar-site-discovery.test.ts`, `radar-research-availability.test.ts`, `radar-capture-preflight.test.ts` |
| Aprovação individual/seleção/retomada com mesmo escopo | `radar-capture-analysis-authorization.test.ts`, integração homônima, `radar-capture-dispatch.test.ts`, `RadarCaptureControls.test.tsx`, `RadarWorkspace.test.tsx` |
| Resumo pai antigo, evento fora de ordem e recibo incerto preservado | `radar-capture-reconciliation.test.ts`, integração homônima e teste de confirmação atrasada em `radar-capture-dispatch.test.ts` |
| Horário/ordem invalidando análise paga e citações mudando de página | `radar-evidence-version.test.ts`, testes de alias legado/reutilização repetida em `radar-research-persistence.test.ts` |
| Continuidade das vinte admitidas sem redescobrir ou perder runs | cenário `recovers twenty admitted companies` em `radar-capture-dispatch.test.ts`, com fontes simuladas e PostgreSQL isolado |

Continuam pendentes A1 (cinco recibos incertos), A5 (feedback completo por campo), B/E0 (qualidade medida da decisão) e C (novas estratégias de descoberta/identidade/investigação). As linhas individuais acima descrevem a auditoria original e não foram reclassificadas como resolvidas sem reabrir os registros reais.

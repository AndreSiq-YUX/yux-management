# Radar Comercial — referência técnica para futura integração de ações

Versão 1.0 — 22/10/2026. **Audiência exclusiva: Admin global YUX e equipe de implementação. Não ingerir este documento em conhecimento comum de clientes/operadores.**

Guia funcional cliente-seguro: [funcionalidades e operação](knowledge/radar-commercial-action-engine.md). Esta entrega escreve documentação e corrige defaults locais; não registra capabilities no Action Engine, não publica conhecimento no sistema e não comprova deploy.

## 1. Fronteiras e autoridade

- Backend do Radar: `backend/src/modules/radar/`; API em `/api/radar`.
- Registry de Missões: `backend/src/modules/action-engine/capabilities/index.ts`. Não há ações `radar.*` registradas nesta versão. `campaign.create_draft` é campanha de marketing, não Radar.
- Harness interpreta/recomenda; commands do backend validam permissão, organização, contrato, revisão, idempotência, capacidade e consentimento antes de efeitos. Não conectar a futura IA diretamente ao banco nem a fornecedores.
- `yux_admin` cria/configura campanhas regionais e aprova controles técnicos. Leitura e critérios comerciais respeitam `requireRadarScope`, módulos contratados, memberships e permissões; possuir `platform.manage` ou administrar a conta não torna alguém Admin global.
- Clientes recebem projeções comerciais explícitas, não objetos técnicos brutos. O fato de uma API existir não significa que esteja autorizada como ferramenta de agente.

## 2. Defaults e compatibilidade

`prepareNewRadarSearchConfiguration` / `radarNewSearchConfigurationSchema` em `search-configuration.ts` definem a criação completa: descoberta adaptativa; G0 determinístico; G1/G5 em shadow; G3 efetivo; identificação, qualificação, perfil, redes públicas, leitura e Agent seletivo habilitados. Fonte indisponível, licença ou modelo ausente não são autorizados por esses flags.

Ordem padrão da descoberta: OSM elegível → Serper Web → CNPJá. A elegibilidade depende de configuração, cobertura, licença e saldo; fonte não elegível não é consultada. No aprofundamento: Serper Web → Brave Web → Perplexity Search rápida, conforme planejamento/capacidade; Agent seletivo quando há lacunas e autorização. Não chamar todas as ferramentas por empresa apenas porque estão configuradas.

O merge de criação preenche campos omitidos e respeita valores explícitos do Admin. `resolveRadarSearchConfiguration` continua com a semântica legada para leitura/edição: não ativa campanhas históricas. POST e PATCH usam schemas distintos para essa razão. Salvar não pesquisa.

Criação rápida local envia `regional_b2b` com `targetStates` e `searchConfiguration.cities`; recém-abertas acrescenta `openingFrom` inicial de 30 dias. Tipos legados já persistidos continuam suportados sem conversão automática. A duplicação de um legado local cria nova campanha `regional_b2b`, preservando a cidade, sem alterar a original. Duplicação preserva filtros/capacidades e habilita as etapas completas na nova campanha; G1/G5 começam em shadow. Não copiar calibração, cursor, empresas ou recibos. No botão de novo lote, descoberta adaptativa usa o preflight de fontes elegíveis, sem exigir especificamente CNPJá; o caminho v1 continua exigindo sua fonte.

## 3. Contrato de criação

`POST /api/radar/campaigns` — exemplo de payload comercial parcial, que recebe defaults completos:

```json
{
  "organizationId": "00000000-0000-4000-8000-000000000001",
  "name": "Manutenção industrial — Joinville",
  "campaignType": "regional_b2b",
  "targetSegment": "Empresas de manutenção industrial",
  "targetStates": ["SC"],
  "offerType": "Fornecimento de equipamentos",
  "productFocus": ["Equipamentos industriais"],
  "searchConfiguration": {
    "cities": [{"city": "Joinville", "state": "SC"}],
    "research": {"contactPurpose": "sales"}
  }
}
```

ID acima é ilustrativo, não autorização. Não incluir `targetCity`/`targetState` no formato regional. Estado inteiro usa `cities: []`. CNAEs são opcionais se não houver regra que os exija. Atividade principal/secundária, situação cadastral, abertura, perfis e exemplos fora do objetivo pertencem aos critérios da campanha.

Campos administrativos `dailyLimit`, `budgetLimit` e opções técnicas existem, mas o agente não deve escolhê-los ou aumentá-los por conta própria. Defaults completos não significam orçamento ilimitado nem ativação de fonte/modelo desconfigurado.

`PATCH /campaigns/:id` atualiza configuração com as verificações existentes. `PATCH /campaigns/:id/criteria` é a fronteira comercial restrita; inclui revisão, critérios e confirmação de fechamento histórico quando exigida. Não encaminhar flags técnicos recebidos de cliente pelo endpoint administrativo.

## 4. Ciclo de execução durável

| Intenção | Endpoint | Contrato relevante |
| --- | --- | --- |
| Listar campanhas | `GET /campaigns?organizationId=...` | Sessão + escopo; resposta projetada por audiência. |
| Duplicar | `POST /campaigns/:id/duplicate` | `organizationId`, `name` opcional; nova entidade, sem executar pesquisa. |
| Conferir novo lote | `POST /campaigns/:id/capture-preflight` | `organizationId`, `configurationRevision`, `requestedCount`; `operationId` somente para lote existente. |
| Pedir novas empresas | `POST /campaigns/:id/capture-operations` | Mesmos dados + UUID `requestId`; autorizações de continuação quando exigidas. Retorna 202 e `operationId`. |
| Acompanhar lote | `GET /capture-operations/:id?organizationId=...` | Estado persistido, não a conexão HTTP nem só o job na fila. |
| Encontrar lote atual | `GET /campaigns/:id/capture-operations/latest?organizationId=...` | Pode retornar `operation: null`. |
| Retomar mesmo lote | `POST /capture-operations/:id/resume` | `organizationId`, revisão e novo UUID da intenção; confirmações específicas se exigidas. |
| Solicitar empresas existentes | `POST /campaigns/:id/research-requests` | `organizationId`, `criteriaRevision`, UUID `requestId`, `candidateIds`, `intent: resume \| refresh \| reanalyze`. |
| Acompanhar pedido | `GET /campaigns/:id/research-requests/:requestId?organizationId=...` | Feedback por empresa; há endpoint `/latest` para reload. |
| Ler disponibilidade | `GET /campaigns/:id/research-availability?organizationId=...` | Operações possíveis e impedimentos; detalhes técnicos só ao Admin. |
| Ler empresa | `GET /candidates/:id/research?organizationId=...` | Dossiê e histórico projetados. |
| Listar resultados | `GET /campaigns/:id/candidates?organizationId=...` | Escopo/revisão e projeção de audiência. |

Todos os caminhos da tabela têm prefixo `/api/radar`. Usar UUIDs reais devolvidos pelo sistema, não nomes de empresas como chave.

Exemplo de sequência: criar/salvar → conferir preflight para 100 → apresentar pedido/impacto → iniciar com `requestId` único → guardar `operationId` → acompanhar até terminal ou pendência → apresentar contagens e qualidade, sem chamar um simples 202 de sucesso completo.

Retries de transporte do **mesmo pedido** reutilizam seu `requestId` e payload. Uma **nova intenção** recebe outro UUID. Nunca gerar UUID novo em cada polling, nem trocar quantidade/payload reaproveitando o UUID anterior. Em refresh da página, recuperar o pedido persistido antes de reenfileirar.

O backend usa snapshots, revisões e outbox persistente; a fila é transporte. Não gravar progresso, saída de IA ou recibo manualmente para “desbloquear”. Uma chamada recebida mas inválida, uma chamada sem resposta recuperável e uma chamada definitivamente rejeitada antes do fornecedor exigem tratamentos diferentes.

## 5. Autorizações que não podem ser presumidas

- Mudança de evidências e nova análise: `allowSemanticRefresh` é controlado por Admin e não autoriza repetir toda cobrança incerta.
- Nova tentativa de análise incerta: autorização administrativa específica, separada do simples resume. Ver `administrative-research.ts`, `analysis-retry-authorizations.ts` e rotas `/admin/research-operations/*` / `/campaigns/:id/analysis-retries`.
- Aumento de capacidade do lote: snapshot + `limitsAuthorization.expectedStateId` e limites exatos validados. Não alterar snapshot por SQL.
- Continuação expirada: recibo/hash de confirmação correspondente ao estado atual, não replay cego de token. Confirmar eventual reinício e custo aplicável.
- Certificado vencido: `POST /candidates/:id/research/tls-exceptions` com diagnóstico confirmado, run e revisão. Escopo temporário de domínio/empresa/pesquisa; não desabilitar TLS globalmente nem estender uma autorização antiga.
- Permissão de uso/retensão/entrega do fornecedor é distinta de credencial e ativação da fonte; nenhuma delas é consentimento de marketing do prospecto.

## 6. Escopos de capacidade e escala

| Controle | Escopo real |
| --- | --- |
| `maxNewCompaniesPerLot` | Máximo por lote, definido na política global; não soma todos os clientes. |
| Tetos globais de páginas/consultas/verificação | Limitam valores autorizáveis de cada campanha/rodada; não são saldo global consumível de empresas. |
| Limite diário da fonte | Soma de todas as campanhas da organização, por fonte e data (`organization_id`, `source_type`, `usage_date`). |
| `daily_limit` da campanha | Verificado por campanha/fonte/data no código atual, não total agregado de todas as fontes. |
| `budget_limit` | Campanha, com reservas/gastos cumulativos e controles de custo; não reinicia ao mudar de fonte ou data. |
| Carteira de IA | Contrato/cliente conforme política financeira, além das rotas e dos limites do Radar. |
| Orçamento/estimativa do Agent | Investigação e campanha, conforme rota; estimativa acompanhada, não teto remoto garantido. |
| Saldo/quota externa | Conta/credencial do fornecedor, que pode ser compartilhada por várias organizações na plataforma. |
| Concorrência/timeouts | Infraestrutura de workers e adaptadores; limita velocidade/tempo, não define 100 empresas como teto de todo o sistema. |

Exemplo aritmético, não projeção de custo: 10 campanhas × 100 empresas = 1.000 empresas. Se cada uma exigir uma consulta na mesma fonte e organização, cota de 200 nessa fonte não atende as 1.000 no mesmo dia. Descoberta de dez empresas por página exigiria pelo menos 100 páginas para 1.000 empresas sem duplicatas/rejeições; com reposição pode exigir mais. Organizações distintas têm contadores internos separados, mas podem disputar saldo externo/infraestrutura compartilhada.

Não há no código auditado um teto fixo de dez campanhas ativas ou cem empresas para toda a plataforma. Isso não é teste de carga de 1.000 empresas simultâneas. Quantidade aderente depende também do universo disponível, filtros e cobertura.

Principais cortes fixos que afetam profundidade: identificação seleciona até oito páginas lidas; cinco resultados por consulta de aprofundamento; Agent recebe inicialmente quatro trechos de 1.500 caracteres; janela de leitura de 110 segundos e timeout público de oito segundos. A política global atual e seus valores efetivos devem ser consultados, não copiados deste documento como se fossem imutáveis. Inventário detalhado: `docs/audits/2026-10-22-radar-limits-action-engine.md`.

## 7. Estados, qualidade e critérios de entrega

Estado terminal do lote não implica todos os leads prontos: apresentar separadamente completos, com lacunas, fora do perfil, aguardando e em pesquisa. Classificar falha de execução como falha, não como evidência de ausência de contato/site.

Amostra e limiar calibrados são específicos do modelo, contexto, revisão e público. G1/G5 shadow executam análise sem excluir; G3 pode decidir próxima ação autorizada. Sem calibração não promover descarte probabilístico. Regras cadastrais explícitas e revisão humana são caminhos diferentes.

Leitura de site e busca não comprovam atendimento telefônico, WhatsApp ativo, receita ou intenção comercial. Não associar contato do diretório ao prospecto. Não publicar afirmação de empresa sem fonte verificável. Preservar evidências, campos desconhecidos e limitações.

## 8. Exportação e CRM: fronteiras já existentes, sem nova integração

- Destinos: `GET /crm-destinations?organizationId=...`.
- Entrega revisada: `POST /campaigns/:id/deliver-to-crm` com organização, revisão, até 25 `candidateIds`, UUID de pedido e destino `{crmInstanceId,pipelineId,stageId}`. Não enviar lote arbitrário sem elegibilidade/revisão.
- Exportação: `GET /campaigns/:id/b2b-export.csv?organizationId=...`, conforme aprovação e direitos de entrega.
- Tipos legados de oportunidades têm conversão própria; não misturar IDs de oportunidade com IDs de candidato/lote.

A classificação/organização futura dos leads no CRM pertence à outra frente mencionada pelo usuário. Não adicionar aqui automações, contato ou nutrição como efeito colateral.

## 9. Checklist para quem integrar ao Action Engine depois

1. Usar este contrato e o catálogo real para desenhar capabilities e Action Pack do Radar, não reutilizar o pack de campanhas pagas.
2. Projetar entradas comerciais e validação de conta/contrato/revisão. Modelo não escolhe o `organizationId` de outra conta nem recebe segredos globais.
3. Separar inspeção/preflight de criar/editar/pesquisar, com aprovação e orçamento aplicáveis.
4. Implementar idempotência e espera durável sobre os IDs/estados reais, inclusive retomada e falha de fila.
5. Retornar feedback comercial para cliente; armazenar diagnóstico/custo/recibo exclusivamente no domínio administrativo.
6. Cobrir os quatro papéis e isolamento por HTTP, mais testes com provedores simulados e canário real expressamente autorizado.
7. Publicar o guia funcional pelo caminho governado de conhecimento, verificar binding, versão/hash e recuperação. Salvar Markdown não treina automaticamente o modelo.
8. Só afirmar integração executável quando registry, pack, commands, aprovações, execução e acompanhamento estiverem implementados e testados.

## 10. Mapa de código

Criação/duplicação: `repository.ts`, `routes.ts`, `search-configuration.ts`. Descoberta: `adaptive-capture.ts`, `discovery-plan.ts`, `discovery-providers.ts`. Orquestração: `capture-operation.ts`, `capture-preflight.ts`, `capture-dispatch.ts`, `research-requests.ts`. Pesquisa: `research-service.ts`. Governança: `operational-limits.ts`, `funnel-controls.ts`, `gate-evaluation.ts`, `analysis-retry-authorizations.ts`. Projeção: `commercial-view.ts`. Interface: `RadarWorkspace.tsx`, `RadarCampaignConfigurationForm.tsx` e `radarService.ts`.

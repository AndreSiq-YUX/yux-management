# YUX CRM - Fase 3 - Propostas, Contratos e Fechamento

## Objetivo

Transformar o CRM em um fluxo completo de fechamento: lead vira proposta,
proposta aceita vira contrato, contrato ativa modulos, projeto, financeiro e
onboarding.

## Contexto Atual

O repositorio ja possui:

- `LeadCommercialPanel` no detalhe do lead;
- modulo de propostas internas, portal e rota publica de revisao;
- conversao de proposta para cliente/contrato/projeto;
- contratos, modulos, projetos e financeiro basico;
- CRM governado por contrato.

O problema e que essa relacao ainda nao e uma jornada comercial guiada dentro
do CRM.

## Escopo

Implementar:

- criacao de proposta diretamente a partir do lead;
- selecao/recomendacao de pacote e modulos com base no lead;
- geracao de escopo comercial com IA como rascunho;
- tracking de envio, visualizacao, aceite, rejeicao e pedido de ajuste;
- follow-up automatico de proposta aberta;
- registro de objeccoes durante negociacao;
- etapa de fechamento com checklist;
- conversao aprovada para contrato, projeto, financeiro e onboarding;
- ativacao dos modulos contratados no Hub;
- timeline do lead com eventos da proposta e conversao;
- relacao de receita esperada e realizada para a fase 4.

Fora desta fase:

- emissao fiscal;
- gateway de pagamento;
- comissoes;
- assinatura digital juridica completa;
- MROI consolidado.

## Modelo de Dados

Novas entidades planejadas:

- `lead_proposal_recommendations`
- `proposal_view_events`
- `proposal_follow_up_tasks`
- `proposal_objections`
- `proposal_closing_checklists`
- `proposal_conversion_runs`
- `client_onboarding_checklists`
- `client_onboarding_tasks`

Extensoes:

- `proposals.lead_id`
- `proposals.crm_instance_id`
- `proposals.recommended_package_id`
- `contracts.source_proposal_id`
- `projects.source_lead_id`
- `invoices.source_proposal_id`

## Regras

- Proposta criada pelo CRM herda `crm_instance_id`, organizacao e lead.
- Vendedor so cria proposta para lead que pode acessar.
- Conversao para contrato/projeto exige aceite aprovado ou aprovacao YUX.
- Ativacao de modulos segue contrato e nao configuracao manual solta.
- Follow-up de proposta nao dispara se opt-out ou bloqueio humano estiver ativo.
- Todo run de conversao e auditavel e idempotente.

## Fluxos

### Proposta a partir do lead

1. Vendedor abre lead.
2. Escolhe criar proposta.
3. Sistema sugere pacote/modulos com base em origem, setor e interesse.
4. IA gera escopo em rascunho quando autorizada.
5. Vendedor revisa e envia link publico.
6. Eventos de visualizacao e aceite voltam para a timeline.

### Fechamento

1. Proposta aceita.
2. Sistema abre checklist de fechamento.
3. Gera ou atualiza contrato.
4. Ativa modulos contratados.
5. Cria projeto e onboarding.
6. Cria fatura inicial quando financeiro estiver habilitado.

## UI

- CTA claro no lead: "Criar proposta".
- Painel de recomendacao de pacote/modulos.
- Timeline com eventos de proposta.
- Checklist de fechamento.
- Estado de conversao com erros e retry.

## Validacao

Sucesso da fase:

- lead gera proposta com dados herdados;
- proposta aceita gera contrato/projeto de forma idempotente;
- timeline mostra eventos relevantes;
- follow-up de proposta aparece na tela Hoje;
- testes cobrem permissao, payloads, conversao e retry.

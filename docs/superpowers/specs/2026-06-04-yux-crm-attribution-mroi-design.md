# YUX CRM - Fase 4 - Atribuicao, Campanhas e MROI

## Objetivo

Transformar a origem dos leads e o desempenho comercial em relatorios claros de
CPL, conversao, receita, ROI e MROI por campanha, landing page, WhatsApp,
origem organica, equipe e vendedor.

## Contexto Atual

O repositorio ja possui:

- campanhas API-first;
- landing pages com captura e aprovacao;
- `attribution_context` em leads;
- relatorios operacionais e portal-safe;
- propostas e financeiro basico;
- CRM governado por contrato.

O problema e que a atribuicao ainda nao aparece como produto comercial forte no
CRM.

## Escopo

Implementar:

- normalizacao de fontes de lead;
- eventos de atribuicao do lead;
- painel "Fontes de Leads";
- dashboards por origem, campanha, criativo, landing page, vendedor e equipe;
- CPL, taxa de conversao, receita por origem e MROI;
- funil por origem;
- alertas de campanha ruim, lead caro e campanha com alta conversao;
- relatorios portal-safe para clientes;
- exportacao CSV dos indicadores principais.

Fora desta fase:

- modelagem multi-touch avancada probabilistica;
- reconciliacao financeira bancaria;
- otimizacao automatica de lances de anuncios.

## Modelo de Dados

Novas entidades planejadas:

- `lead_sources`
- `lead_attribution_events`
- `lead_source_rollups`
- `campaign_crm_performance_snapshots`
- `crm_revenue_attribution`
- `crm_mroi_alerts`
- `crm_report_exports`

Extensoes:

- `leads.primary_source_id`
- `leads.source_confidence`
- `campaigns.crm_performance_status`
- `landing_pages.crm_source_id`
- `proposals.source_lead_id`
- `invoices.source_lead_id`

## Regras

- Atribuicao primaria e imutavel sem auditoria.
- Atribuicao secundaria pode registrar multiplos eventos.
- Portal nunca mostra custo interno que nao pertença ao cliente.
- Receita atribuida usa proposta aprovada, contrato ou fatura conforme
  disponibilidade.
- MROI deve separar custo de midia, custo operacional e receita estimada.
- Alertas devem ser explicaveis por metricas simples.

## Fluxos

### Lead capturado

1. Landing page, campanha ou WhatsApp envia contexto.
2. Sistema normaliza UTM e origem.
3. Cria evento de atribuicao.
4. Atualiza fonte primaria se ainda nao existir.
5. Rollups recalculam indicadores.

### Relatorio de fonte

1. Usuario abre Fontes de Leads.
2. Escolhe periodo e funil.
3. Sistema mostra leads, oportunidades, vendas, CPL, receita e MROI.
4. Usuario filtra por campanha, criativo, equipe ou vendedor.

## UI

- Aba "Fontes" no CRM.
- Tabela comparativa de origens.
- Grafico de funil por origem.
- Cards de CPL, vendas, receita e MROI.
- Alertas acionaveis para gestor.

## Validacao

Sucesso da fase:

- cada lead tem fonte primaria consistente;
- painel mostra CPL e MROI por origem;
- portal mostra dados seguros para cliente;
- relatorios funcionam por periodo e funil;
- testes cobrem normalizacao, calculos e sanitizacao.

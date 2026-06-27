# YUX Strategy Engine

O YUX Strategy Engine e a camada interna que orienta agentes comerciais, Marketing Studio e assistentes omnichannel por doutrina, skills, RAG controlado, politicas de acao e dados operacionais.

## Componentes

- Doutrina e skills: `yux_strategy_doctrines`, `yux_strategy_skills`, `yux_strategy_skill_sections`.
- Perfis de agente: `growth_strategist`, `crm_controller`, `ai_sdr_comercial_1`, `ai_closer`, `support_assistant`, `customer_growth_comercial_2`, `revenue_recovery`, `offer_conversion`, `marketing_strategist`, `referral_growth`, `metrics_cash_mroi`, `proposal_delivery`.
- Knowledge ingestion: documentos, paginas, chunks, assets, concept cards e embeddings em `yux_strategy_source_*`, `yux_strategy_concept_cards` e tabelas de embeddings.
- Retrieval: contexto compacto por perfil, etapa comercial, visibilidade e tags, com logs em `yux_strategy_retrieval_queries`.
- Guardrails: acoes proibidas, acoes com aprovacao humana e payloads estruturados no worker Python.
- Conversational AI: `ai_assistants` agora suporta `assistant_role`, `strategy_profile_id`, `routing_priority` e `routing_metadata`.
- Handoffs e recomendacoes: `yux_strategy_agent_handoffs` e `yux_strategy_agent_recommendations`.
- Metrics & Cash: CAC, LTV, ROAS, MROI, recuperacao e gargalos comerciais.
- Objection Intelligence: categorias, eventos, playbooks e sugestoes de melhoria de oferta.
- Learning V2: outcome events e learning signals registram resultado; ainda nao alteram prompts automaticamente.

## Operacao

1. Ingerir fontes privadas com `scripts/strategy-knowledge`.
2. Transformar conteudo em concept cards revisados.
3. Gerar embeddings e importar via `DATABASE_URL` no Postgres proprio da VPS.
4. Recuperar contexto por perfil e etapa.
5. Compor strategy context no harness antes de snippets RAG comuns.
6. Registrar recomendacao, handoff, outcome e learning signal.

## Governanca

Conteudo `internal_only` nao deve ser exposto ao portal ou webhooks externos. O helper `sanitizeStrategyContextForWebhook` remove chunks e assets internos por padrao. Acoes sensiveis como publicar, ativar campanha, prometer desconto ou alterar orcamento exigem politica explicita e aprovacao humana.

## Status

Implementado no repositorio: schema, ingestion, retrieval, guards, harness context, metric rules, objection rules, CRM controller rules, multi-assistant routing, servico frontend e Admin Strategy Engine.

Pendente para producao: aplicar as migrations convertidas no Postgres da VPS, importar cards reais revisados e validar credenciais de embeddings/webhooks.

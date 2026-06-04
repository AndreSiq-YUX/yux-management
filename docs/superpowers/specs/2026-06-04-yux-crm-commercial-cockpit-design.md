# YUX CRM - Fase 1 - Cockpit Comercial Usavel

## Objetivo

Transformar o CRM governado por contrato em uma experiencia comercial vendavel
e util no dia a dia de vendedores, gerentes, admins de cliente e admins YUX.
Esta fase foca no produto nativo de CRM: cockpit, visoes operacionais, cadastro
rico de lead, timeline 360, tarefas, proxima acao, tags, duplicidade,
importacao CSV e campos setoriais.

## Contexto Atual

O repositorio ja possui:

- governanca por contrato com `crm_instances`, membros, equipes e papeis;
- rotas `/leads`, `/portal/crm`, `/portal/crm/settings` e `/crm-governance`;
- `CrmWorkspace` com Kanban/lista basicos;
- `crmService`, `crmGovernanceService`, regras de funil, follow-up e governanca;
- tabelas de pipelines, stages, leads, tarefas, interacoes e campos customizados;
- blueprints setoriais e aplicacao por contrato.

O problema e que a UI ainda se comporta como base operacional. Ela precisa virar
um cockpit que diga ao vendedor o que fazer agora e ao gerente onde a operacao
esta travada.

## Escopo

Implementar:

- cockpit com abas Kanban, lista avancada, Hoje, calendario e fontes;
- filtros por responsavel, equipe, origem, campanha, etapa, valor, temperatura,
  tempo parado, tags e proxima acao;
- cards de lead com valor, score, origem, proxima acao, tempo na etapa e alerta;
- detalhe 360 do lead com resumo, dados, atividades, tarefas, tags, duplicidade
  e historico de etapa;
- cadastro completo de lead com telefone/WhatsApp, cidade/estado, segmento,
  produto de interesse, temperatura, urgencia, consentimento e opt-ins;
- campos customizados por setor respeitando definicoes da instancia CRM;
- motivos de perda obrigatorios quando a etapa perdida exigir motivo;
- proxima melhor acao inicialmente baseada em regras;
- importacao CSV com preview, mapeamento, validacao e execucao auditavel;
- views salvas por usuario ou equipe.

Fora desta fase:

- IA generativa para sugestoes e resumo;
- inbox WhatsApp profunda;
- proposta/contrato/projeto a partir do lead;
- dashboards executivos completos de MROI;
- Mautic.

## Modelo de Produto

### Personas

- Vendedor: precisa de uma fila objetiva de trabalho, leads priorizados e
  contexto em poucos segundos.
- Gerente: precisa enxergar equipe, gargalos, atrasos, redistribuicao e ranking.
- Admin cliente: precisa adaptar campos, tags, views e importacoes sem quebrar
  governanca.
- Admin YUX: precisa supervisionar implantacao, auditar dados e corrigir
  configuracoes por contrato.

### Visoes

- Kanban: principal fluxo por funil e etapa.
- Lista: operacao densa, filtros avancados e acoes em massa.
- Hoje: tarefas vencidas, leads sem resposta, propostas a cobrar, leads quentes
  e oportunidades travadas.
- Calendario: atividades, reunioes, follow-ups e SLAs.
- Fontes: resumo operacional de origem do lead para preparar a fase de MROI.

## Modelo de Dados

Novas entidades planejadas:

- `lead_stage_history`
- `lead_tags`
- `lead_tag_assignments`
- `lead_loss_reasons`
- `lead_duplicates`
- `lead_saved_views`
- `lead_imports`
- `lead_import_rows`
- `lead_next_actions`
- `crm_activity_calendar_entries`

Extensoes em `leads`:

- `whatsapp_phone`
- `city`
- `state`
- `segment`
- `interest`
- `temperature`
- `urgency`
- `consent_lgpd`
- `whatsapp_opt_in`
- `email_opt_in`
- `competitor`
- `objections`
- `current_stage_entered_at`

## Regras

- Toda consulta continua escopada por `crm_instance_id` quando a organizacao e
  cliente.
- Vendedor ve e atua nos leads permitidos pela governanca atual.
- Gerente ve leads da equipe e pode executar redistribuicao quando permitido.
- Motivo de perda e obrigatorio quando a configuracao da instancia exigir.
- Importacao CSV nunca grava diretamente sem preview e validacao.
- Views salvas nao podem vazar filtros de outra instancia CRM.
- Tags, motivos e campos customizados sao configuracoes da instancia, nao globais.

## Integracoes

- Campanhas e landing pages seguem gravando atribuicao em `attribution_context`.
- Omnichannel continua como origem de interacoes, sem inbox profunda nesta fase.
- Propostas continuam expostas pelo `LeadCommercialPanel`, sem novo fluxo.
- Relatorios passam a ter insumos melhores, mas dashboards ficam na fase 4.

## UI

O visual deve ser de ferramenta operacional premium: denso, claro, com metricas
compactas, filtros visiveis, acoes rapidas e paineis laterais. Evitar hero,
cartoes decorativos e textos explicativos longos dentro da aplicacao.

## Validacao

Sucesso da fase:

- vendedor consegue operar um dia inteiro pela tela Hoje e pelo Kanban;
- gerente consegue identificar atrasos e gargalos;
- lead 360 explica o historico em ate 30 segundos;
- importacao CSV tem preview, erros e execucao auditavel;
- testes cobrem regras puras, services, filtros e estados principais de UI;
- build e type-check passam.

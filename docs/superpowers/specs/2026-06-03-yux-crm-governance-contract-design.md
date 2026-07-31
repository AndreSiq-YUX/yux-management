# YUX CRM - Governanca e Configuracao por Contrato

## Objetivo

Transformar o CRM da YUX de uma base operacional generica em um modulo
comercial governado por contrato, configuravel por cliente e seguro por regras
de negocio. Esta fase cria a fundacao para um CRM completo: instancias por
contrato, limites de usuarios, equipes, papeis, permissao por vendedor/gerente,
blueprints setoriais, personalizacao versionada e auditoria.

Esta spec nao redesenha ainda o cockpit visual, WhatsApp com IA, lead scoring
avancado, relatorios executivos ou Mautic. Esses blocos dependem da governanca
descrita aqui para funcionarem sem retrabalho.

## Contexto Atual

O CRM atual ja possui:

- rota interna `/leads`;
- rota do portal `/portal/crm`;
- `crm_pipelines` e `crm_pipeline_stages`;
- `leads` com `organization_id`, `pipeline_id`, `stage_id`, `owner_id`, `score`,
  `source_kind`, `attribution_context` e status comercial;
- `lead_tasks`, `lead_custom_field_values`, sequencias e execucoes;
- blueprints com templates de funil, campos, mensagens, automacoes e presets;
- contratos e `contract_modules` para habilitar ou desabilitar modulos;
- RLS basica para acesso CRM por organizacao e contrato ativo.

O problema e que a camada atual ainda nao responde bem a operacao real de uma
agencia de consultoria:

- o CRM e habilitado por modulo, mas nao ha uma instancia operacional por
  contrato;
- nao ha limites contratados de vendedores, gerentes e admins do CRM;
- nao ha estrutura forte de equipes;
- vendedor, gerente, admin cliente e admin YUX ainda nao tem regras de
  visibilidade suficientemente claras;
- blueprints setoriais ainda sao assets de aplicacao, nao a base governada de
  uma instancia CRM;
- funis, campos, categorias e motivos de perda nao possuem fluxo robusto de
  rascunho, publicacao, versao e migracao;
- a UI do portal reutiliza o workspace compartilhado e ainda precisa evoluir
  para uma experiencia de cliente administravel dentro dos limites contratados.

## Decisoes Aprovadas

### Instancia por contrato

O CRM contratado sera modelado como uma instancia por contrato.

Regra:

- se um contrato ativo habilita `crm`, ele pode ter uma `crm_instance`;
- cada `crm_instance` pertence a um contrato e a organizacao cliente;
- a instancia guarda blueprint aplicado, setor, limites, configuracoes e status;
- contratos diferentes podem ter CRMs diferentes, mesmo para o mesmo cliente;
- sem contrato ativo com `crm`, o cliente nao acessa CRM.

### Administracao de usuarios pelo cliente

O admin do cliente pode gerenciar usuarios do CRM dentro dos limites contratados.

Regra:

- YUX define os limites no contrato/instancia;
- admin cliente convida, remove e gerencia usuarios dentro desses limites;
- sistema bloqueia excesso de assentos;
- admin YUX sempre pode corrigir, auditar e sobrescrever configuracoes.

### Multiplas equipes desde o inicio

Cada instancia CRM pode ter multiplas equipes.

Regra:

- vendedores podem pertencer a uma ou mais equipes;
- gerentes podem supervisionar uma ou mais equipes;
- metricas e visibilidade sao filtraveis por equipe;
- redistribuicao de leads pode ocorrer dentro da equipe ou entre equipes quando
  o papel permitir.

### Distribuicao de leads hibrida

Propriedade e distribuicao de leads serao configuradas por funil/equipe.

Regra:

- alguns funis exigem responsavel obrigatorio;
- alguns funis recebem leads em fila;
- alguns funis distribuem automaticamente;
- algumas equipes podem operar por "puxar proximo lead";
- RLS e services respeitam responsavel, equipe, gerencia e permissoes especiais.

### Personalizacao pelo admin cliente dentro de limites

Admin cliente pode personalizar funis, campos e categorias dentro de limites.

Regra:

- YUX define os limites e permissoes maximas;
- admin cliente pode editar nomes de etapas, campos, categorias, tags e motivos
  de perda quando a instancia permitir;
- mudancas estruturais sao auditadas;
- mudancas nao podem quebrar relatorios, automacoes, RLS ou integracoes.

### Rascunho, publicacao e versao

Personalizacoes estruturais entram por rascunho e publicacao de versao.

Regra:

- funis, etapas, campos, categorias e motivos de perda terao versoes;
- admin cliente edita rascunho;
- antes de publicar, o sistema mostra impacto basico;
- versao publicada passa a valer conforme o plano de migracao;
- automacoes e relatorios usam chaves estaveis, nao apenas nomes visuais.

### Plano de migracao para leads existentes

Publicar nova versao exige plano de migracao.

Regra:

- admin escolhe manter leads antigos, migrar todos, migrar apenas abertos ou
  mapear etapas/campos antigos para novos;
- ganhos/perdidos podem ser excluidos da migracao;
- sistema registra uma execucao de migracao;
- impacto e falhas ficam auditaveis;
- relatorios preservam historico por versao.

## Principios de Produto

### CRM como servico contratado, nao SaaS generico

A YUX nao vende apenas acesso a software. Ela vende consultoria, implantacao e
operacao personalizada. O CRM precisa refletir isso:

- cada cliente pode ter funis, campos, SLAs e equipes diferentes;
- blueprints aceleram a implantacao, mas nao limitam o trabalho consultivo;
- Admin YUX tem poder superior de configuracao e auditoria;
- cliente opera dentro de limites comerciais claros.

### Blueprint e ponto de partida

Blueprints setoriais definem a primeira configuracao:

- clinicas;
- imobiliarias;
- revendas;
- oficinas;
- agencias;
- padrao generico quando o cliente nao se encaixa em setor.

Depois da aplicacao, a instancia CRM passa a ter sua propria configuracao. A
alteracao de um blueprint global nao deve alterar automaticamente instancias ja
implantadas sem um fluxo explicito de reaplicacao/migracao.

### Regras de negocio primeiro, UI depois

Antes de redesenhar o cockpit comercial, a plataforma precisa saber:

- quem pode usar CRM;
- quantos usuarios podem usar CRM;
- quem ve quais leads;
- quem pode alterar funis;
- quais mudancas precisam de versao;
- quais dados pertencem ao contrato atual.

Sem essa fundacao, qualquer UI nova ou integracao de IA tende a misturar dados
entre clientes, equipes ou papeis.

## Modelo Conceitual

### `crm_instances`

Representa o CRM contratado em um contrato especifico.

Campos conceituais:

- `id`;
- `organization_id`;
- `contract_id`;
- `status`: `draft`, `active`, `paused`, `archived`;
- `sector_key`;
- `blueprint_id`;
- `blueprint_application_run_id`;
- `seller_seat_limit`;
- `manager_seat_limit`;
- `admin_seat_limit`;
- `max_pipeline_count`;
- `max_custom_field_count`;
- `max_automation_count`;
- `allow_client_pipeline_customization`;
- `allow_client_field_customization`;
- `allow_client_category_customization`;
- `default_assignment_mode`;
- `created_by`;
- `updated_by`;
- timestamps.

Regras:

- uma instancia ativa exige contrato ativo com modulo `crm` habilitado;
- uma instancia deve pertencer a organizacao cliente do contrato;
- limites contratados sao lidos desta tabela ou de uma tabela de configuracao
  associada;
- Admin YUX pode criar, pausar e arquivar;
- admin cliente nao pode aumentar limites.

### `crm_instance_members`

Representa usuario habilitado na instancia CRM.

Papeis:

- `seller`;
- `manager`;
- `client_admin`;
- `yux_admin`.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `user_id`;
- `role`;
- `status`: `invited`, `active`, `suspended`, `removed`;
- `invited_by`;
- `activated_at`;
- `removed_at`;
- timestamps.

Regras:

- `seller` consome assento de vendedor;
- `manager` consome assento de gerente;
- `client_admin` consome assento de admin cliente;
- `yux_admin` nao consome assento do cliente;
- admin cliente pode convidar/remover membros dentro dos limites;
- Admin YUX pode operar qualquer membro;
- convite deve validar que o usuario pertence ou pode pertencer a organizacao
  cliente.

### `crm_teams`

Representa equipe dentro de uma instancia CRM.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `name`;
- `description`;
- `status`;
- `default_pipeline_id`;
- `assignment_mode`;
- timestamps.

Modos de atribuicao:

- `manual_required`;
- `queue`;
- `round_robin`;
- `pull_next`;
- `ai_priority`.

O modo `ai_priority` fica reservado para fases futuras; nesta fase pode existir
como valor planejado, mas nao precisa ter algoritmo real.

### `crm_team_members`

Relaciona membros CRM a equipes.

Campos conceituais:

- `team_id`;
- `crm_instance_member_id`;
- `team_role`: `seller`, `manager`;
- `is_primary`;
- timestamps.

Regras:

- vendedor pode estar em mais de uma equipe;
- gerente pode supervisionar mais de uma equipe;
- gerente enxerga leads das equipes onde e gerente;
- admin cliente enxerga a instancia inteira;
- Admin YUX enxerga tudo.

### `crm_pipeline_versions`

Representa uma versao publicada ou rascunho de um funil.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `pipeline_id`;
- `version_number`;
- `status`: `draft`, `published`, `archived`;
- `based_on_version_id`;
- `published_by`;
- `published_at`;
- `migration_required`;
- timestamps.

Regras:

- so uma versao publicada fica ativa por pipeline;
- rascunhos podem existir sem afetar leads;
- nomes visuais podem mudar, mas chaves estaveis devem preservar automacoes e
  relatorios;
- publicar exige validacao de impacto.

### `crm_stage_versions`

Representa etapas de uma versao de funil.

Campos conceituais:

- `id`;
- `pipeline_version_id`;
- `stable_key`;
- `name`;
- `color`;
- `order_index`;
- `is_won`;
- `is_lost`;
- `probability`;
- `sla_minutes`;
- `required_fields`;
- `checklist`;
- timestamps.

Regras:

- `stable_key` e usado por automacoes e relatorios;
- mudanca de nome nao muda `stable_key`;
- remocao de etapa exige plano de migracao para leads existentes;
- etapa de perda pode exigir motivo de perda.

### `crm_custom_field_definitions`

Define campos customizados da instancia.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `version_id`;
- `stable_key`;
- `label`;
- `field_type`;
- `required`;
- `options`;
- `visible_to_roles`;
- `editable_by_roles`;
- `stage_requirements`;
- `source`: `blueprint`, `yux_custom`, `client_custom`;
- timestamps.

Tipos iniciais:

- `text`;
- `textarea`;
- `number`;
- `currency`;
- `date`;
- `datetime`;
- `select`;
- `multi_select`;
- `boolean`;
- `phone`;
- `email`;
- `url`.

### `crm_categories`, `crm_tags`, `crm_loss_reasons`

Configuracoes comerciais por instancia.

Uso:

- categorias organizam leads e atividades;
- tags qualificam leads sem rigidez estrutural;
- motivos de perda padronizam fechamento perdido;
- motivos de perda podem ser obrigatorios por etapa/funil.

### `crm_configuration_drafts`

Agrupa alteracoes estruturais antes da publicacao.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `draft_type`: `pipeline`, `fields`, `categories`, `full_configuration`;
- `status`: `editing`, `ready_to_publish`, `published`, `discarded`;
- `payload`;
- `created_by`;
- `updated_by`;
- timestamps.

### `crm_configuration_publications`

Registra publicacoes de configuracao.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `draft_id`;
- `published_by`;
- `impact_summary`;
- `migration_plan`;
- `status`: `pending`, `published`, `failed`;
- timestamps.

### `crm_configuration_migration_runs`

Registra a aplicacao do plano de migracao em leads existentes.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `publication_id`;
- `status`: `pending`, `running`, `succeeded`, `failed`, `partially_failed`;
- `strategy`: `keep_existing`, `migrate_all`, `migrate_open_only`,
  `mapped_migration`;
- `stage_mapping`;
- `field_mapping`;
- `affected_lead_count`;
- `error_summary`;
- `started_at`;
- `completed_at`.

### `crm_audit_events`

Auditoria de operacoes sensiveis.

Eventos:

- instancia criada/pausada/arquivada;
- limites alterados;
- membro convidado/removido/suspenso;
- papel alterado;
- equipe criada/alterada/removida;
- gerente vinculado/desvinculado;
- funil alterado;
- campo alterado;
- versao publicada;
- plano de migracao executado;
- lead redistribuido;
- permissao excedida ou tentativa bloqueada.

Campos conceituais:

- `id`;
- `crm_instance_id`;
- `actor_user_id`;
- `actor_role`;
- `event_type`;
- `target_type`;
- `target_id`;
- `before_payload`;
- `after_payload`;
- `metadata`;
- `created_at`.

## Ajustes em Tabelas Existentes

### `leads`

Novos campos conceituais:

- `crm_instance_id`;
- `team_id`;
- `owner_member_id`;
- `pipeline_version_id`;
- `stage_version_id`;
- `assignment_state`: `unassigned`, `queued`, `assigned`, `reassigned`;
- `assignment_mode`;
- `last_assignment_at`.

Regras:

- lead de cliente com CRM contratado deve pertencer a uma instancia;
- lead atribuido a vendedor usa `owner_member_id`, nao apenas `owner_id`;
- lead em fila tem `team_id` e `owner_member_id` nulo;
- gerente ve lead por equipe;
- vendedor ve lead quando e dono ou quando a regra da equipe permite puxar da
  fila;
- Admin YUX e admin cliente tem visao ampla conforme papel.

### `crm_pipelines`

Deve passar a referenciar `crm_instance_id`.

Regras:

- um pipeline pertence a uma instancia CRM;
- pipelines antigos podem ser backfilled para uma instancia padrao por contrato
  ativo;
- pipeline sem instancia deve ser tratado como legado ate migracao.

### `lead_custom_field_values`

Deve apontar para definicao de campo versionada.

Regras:

- valor customizado referencia `field_definition_id`;
- valores antigos por `field_key` podem ser mantidos temporariamente para
  compatibilidade, mas nova escrita usa definicao versionada;
- leitura do CRM deve mapear definicoes publicadas e valores existentes.

## Regras de Permissao

### Admin YUX

Pode:

- criar e pausar instancias CRM;
- aplicar blueprints;
- alterar limites contratados;
- configurar funis, campos, categorias, tags, motivos de perda, SLAs e
  automacoes;
- acessar todas as equipes e leads;
- auditar eventos;
- corrigir membros e papeis;
- executar ou reverter migracoes quando possivel.

### Admin Cliente

Pode:

- convidar/remover vendedores e gerentes dentro dos limites contratados;
- criar e editar equipes;
- vincular vendedores e gerentes a equipes;
- personalizar funis, campos, categorias, tags e motivos de perda dentro dos
  limites liberados;
- publicar versoes com plano de migracao;
- ver todos os leads e metricas da instancia;
- redistribuir leads entre equipes.

Nao pode:

- aumentar limites contratados;
- habilitar CRM se contrato nao tem CRM;
- alterar configuracoes bloqueadas pela YUX;
- acessar outros contratos/clientes;
- burlar auditoria.

### Gerente

Pode:

- ver leads das equipes que supervisiona;
- ver estatisticas dos vendedores dessas equipes;
- redistribuir leads dentro das equipes supervisionadas;
- assumir lead em casos permitidos;
- criar tarefas e atividades para sua equipe;
- acompanhar SLA e produtividade.

Nao pode:

- alterar limites;
- alterar configuracao estrutural do CRM, salvo se tambem for admin cliente;
- ver equipes que nao supervisiona.

### Vendedor

Pode:

- ver seus proprios leads;
- ver leads em filas das equipes quando a equipe permite `pull_next`;
- puxar proximo lead quando permitido;
- atualizar dados de leads que possui;
- mover leads entre etapas permitidas;
- criar tarefas, notas e atividades;
- marcar ganho/perdido quando a regra do funil permitir.

Nao pode:

- ver leads de outros vendedores;
- redistribuir leads de outros vendedores;
- alterar funis, campos ou categorias;
- acessar metricas globais de outros vendedores.

## RLS e Seguranca Supabase

As regras devem ser aplicadas no banco, nao apenas no frontend.

Novas funcoes privadas conceituais:

- `private.can_access_crm_instance(instance_id UUID)`;
- `private.crm_member_role(instance_id UUID)`;
- `private.can_manage_crm_instance(instance_id UUID)`;
- `private.can_manage_crm_members(instance_id UUID)`;
- `private.can_access_crm_team(team_id UUID)`;
- `private.can_access_crm_lead_v2(lead_id UUID)`;
- `private.can_update_crm_lead_v2(lead_id UUID)`;
- `private.can_publish_crm_configuration(instance_id UUID)`.

Regras:

- funcoes `SECURITY DEFINER` ficam no schema `private`, nao em schema exposto;
- tabelas novas em `public` devem ter RLS habilitado;
- tabelas novas precisam de `GRANT` explicito para `authenticated` por causa da
  mudanca da Data API do Supabase anunciada em 2026-04-28;
- RLS deve validar contrato ativo, modulo `crm` habilitado, instancia ativa,
  papel CRM, equipe e responsavel;
- `user_metadata` nao deve ser usado para autorizacao;
- autorizacao deve depender de tabelas internas e memberships.

## Fluxos Principais

### Criacao de instancia CRM

1. Admin YUX ativa CRM em um contrato.
2. Sistema cria `crm_instance` em status `draft`.
3. Admin YUX escolhe blueprint setorial ou modelo padrao.
4. Sistema aplica blueprint para gerar funis, campos, categorias, motivos,
   equipes iniciais e presets.
5. Admin YUX define limites de assentos e personalizacoes permitidas.
6. Instancia e publicada como `active`.
7. Portal do cliente passa a mostrar CRM.

### Convite de usuarios pelo admin cliente

1. Admin cliente abre configuracoes do CRM.
2. Escolhe papel: vendedor, gerente ou admin cliente.
3. Sistema verifica limite de assentos.
4. Sistema cria convite ou ativa usuario existente.
5. Usuario e vinculado a uma ou mais equipes.
6. Auditoria registra convite e ativacao.

### Lead entrando no CRM

1. Lead chega por landing page, campanha, WhatsApp, importacao ou criacao
   manual.
2. Sistema identifica `crm_instance_id` pelo contrato/contexto.
3. Sistema escolhe funil e equipe conforme origem, blueprint e configuracao.
4. Dependendo do modo:
   - atribui vendedor automaticamente;
   - coloca em fila;
   - exige atribuicao manual;
   - permite `pull_next`.
5. Lead fica visivel conforme RLS.

### Personalizacao de funil/campos

1. Admin cliente cria rascunho.
2. Edita etapas, nomes, campos, categorias, tags e motivos dentro dos limites.
3. Sistema valida chaves estaveis, limites e impacto.
4. Admin prepara publicacao.
5. Sistema exige plano de migracao para leads existentes.
6. Publicacao cria nova versao.
7. Migracao e executada e auditada.

### Redistribuicao de leads

1. Gerente ou admin seleciona leads.
2. Escolhe novo vendedor ou equipe.
3. Sistema valida permissao sobre equipe atual e destino.
4. Atualiza `owner_member_id`, `team_id`, `assignment_state` e historico.
5. Auditoria registra antes/depois.

## Interfaces Necessarias

### Admin YUX

Superficies:

- lista de instancias CRM por contrato;
- criacao/ativacao de CRM por contrato;
- selecao de blueprint;
- configuracao de limites;
- configuracao maxima permitida ao cliente;
- auditoria por cliente/instancia;
- aplicacao e reaplicacao controlada de blueprint;
- status de migracoes de configuracao.

### Portal Admin Cliente

Superficies:

- configuracoes do CRM;
- usuarios e assentos;
- equipes;
- funis e campos em rascunho;
- publicacao de versao;
- plano de migracao;
- auditoria visivel para a operacao do cliente;
- limites contratados e uso atual.

### Operacao Vendedor/Gerente

Esta fase nao redesenha todo o cockpit, mas deve preparar:

- filtros por equipe e responsavel;
- lead em fila;
- puxar proximo lead;
- redistribuir lead;
- indicadores de assentos/equipe;
- bloqueios visiveis quando usuario nao tem permissao.

## Relacao com Blueprints

Blueprints devem gerar:

- funis iniciais;
- etapas;
- campos customizados;
- categorias;
- tags recomendadas;
- motivos de perda;
- SLAs por etapa;
- modos de atribuicao;
- templates de mensagem;
- templates de automacao;
- presets de relatorio.

Depois da aplicacao:

- a instancia CRM tem copia propria das configuracoes;
- alteracoes do blueprint global nao alteram instancia ativa automaticamente;
- YUX pode reaplicar blueprint com diff e plano de migracao em fase futura.

## Relacao com Modulos Contratados

CRM deve continuar conectado ao contrato:

- `crm`: habilita instancia e portal CRM;
- `whatsapp_ai`: permite recursos de conversa, handoff e IA em fases futuras;
- `landing_pages`: permite lead routing a partir de landing pages;
- `campaigns`: permite atribuicao e CPL/MROI;
- `proposals`: permite proposta a partir do lead;
- `bi_reports`: permite relatorios comerciais;
- `automations`: permite automacoes configuraveis mais avancadas.

Regra:

- CRM pode existir sem todos os modulos acima;
- funcionalidades dependentes devem aparecer como bloqueadas ou ocultas conforme
  contrato;
- Admin YUX deve ver claramente quais recursos estao incluidos no contrato.

## Fora do Escopo Desta Fase

Nao implementar nesta fase:

- redesenho completo do cockpit visual;
- inbox WhatsApp dentro do lead;
- resumo de conversa por IA;
- lead scoring por IA;
- proxima melhor acao;
- importacao CSV;
- dashboards comerciais completos;
- Mautic;
- Google Calendar;
- comissoes;
- billing automatico por assento.

Esses temas entram nas fases seguintes depois que a governanca estiver segura.

## Plano de Fases Posteriores

### Fase 2: Cockpit Comercial

- Kanban avancado;
- lista avancada;
- filtros salvos;
- tela Hoje;
- detalhe 360 do lead;
- tags;
- duplicidade;
- atividades e agenda.

### Fase 3: WhatsApp e IA

- vincular conversa a lead;
- criar lead por conversa;
- resumo de conversa;
- intencao, sentimento e urgencia;
- sugestao de resposta;
- SLA de primeiro atendimento;
- bloqueio de automacao quando humano assume.

### Fase 4: Propostas, Contratos e Projetos

- proposta a partir do lead;
- aceite e follow-up;
- conversao para contrato;
- criacao de projeto;
- onboarding.

### Fase 5: Campanhas, Landing Pages e MROI

- atribuicao completa;
- CPL por fonte;
- MROI;
- alertas de campanha;
- relatorios de origem ate venda.

### Fase 6: Marketing Automation Avancado

- Mautic opcional e dedicado por cliente;
- segmentos;
- campanhas de nutricao;
- sync de contatos;
- logs e metricas no Hub.

## Criterios de Sucesso da Fase 1

A fase sera considerada concluida quando:

- CRM so aparecer para cliente com contrato ativo e modulo `crm` habilitado;
- cada contrato CRM tiver uma instancia propria;
- Admin YUX conseguir aplicar blueprint e configurar limites;
- admin cliente conseguir gerenciar usuarios dentro dos limites;
- multiplas equipes funcionarem;
- vendedor enxergar apenas seus leads e filas permitidas;
- gerente enxergar equipes supervisionadas;
- admin cliente enxergar a instancia do cliente;
- Admin YUX enxergar e configurar tudo;
- funis/campos tiverem rascunho, publicacao e versao;
- publicacao exigir plano de migracao;
- auditoria registrar alteracoes sensiveis;
- RLS bloquear acesso cruzado entre clientes, contratos, equipes e vendedores;
- testes provarem os principais limites e permissoes.

## Riscos e Mitigacoes

### Risco: complexidade de RLS

Mitigacao:

- escrever helpers privados pequenos e testaveis por probes SQL;
- evitar autorizacao baseada em claims editaveis;
- criar probes para admin YUX, admin cliente, gerente, vendedor, cross-client e
  contrato sem CRM.

### Risco: versionamento quebrar automacoes

Mitigacao:

- usar `stable_key` para etapas e campos;
- manter historico por versao;
- exigir plano de migracao antes de publicar;
- registrar impacto e auditoria.

### Risco: admin cliente baguncar operacao

Mitigacao:

- limites contratuais claros;
- rascunho antes de publicacao;
- validacao de impacto;
- auditoria;
- possibilidade de YUX bloquear certas personalizacoes por instancia.

### Risco: retrabalho no cockpit

Mitigacao:

- nao redesenhar cockpit antes da governanca;
- preparar service/types para equipes, papeis, filas e instancias;
- manter o CRM atual funcionando enquanto a nova camada e adicionada.

## Validacao Esperada

Validacoes automaticas:

- testes de regras de assento;
- testes de visibilidade vendedor/gerente/admin;
- testes de limites de personalizacao;
- testes de publicacao e plano de migracao;
- testes de services com mocks Supabase;
- probes SQL de RLS.

Validacoes manuais:

- Admin YUX cria instancia CRM para contrato;
- admin cliente convida usuarios ate o limite;
- tentativa de exceder limite e bloqueada;
- vendedor nao ve lead de outro vendedor;
- gerente ve leads da equipe supervisionada;
- cliente sem CRM contratado nao ve rota de CRM;
- publicacao de funil exige plano de migracao;
- auditoria registra eventos sensiveis.

## Observacao Sobre Supabase

O projeto usa Supabase com tabelas em `public`, RLS e Data API. Como o Supabase
mudou a exposicao automatica de novas tabelas a Data API em 2026-04-28, toda
nova tabela desta fase precisa de:

- RLS habilitado;
- policies explicitas;
- `GRANT` explicito para `authenticated` quando for acessada pelo frontend;
- probes que comprovem acesso permitido e bloqueios esperados.

Funcoes privilegiadas devem ficar no schema `private` com `SECURITY DEFINER` e
`search_path = ''`.

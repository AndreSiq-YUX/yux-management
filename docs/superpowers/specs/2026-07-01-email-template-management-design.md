# Email Template Management Design

## Objetivo

Criar uma area de gestao de modelos de email para o YUX Hub com dois escopos
claramente separados:

- Admin YUX gerencia apenas emails do proprio sistema e da operacao YUX.
- Cada cliente gerencia apenas modelos de email da sua propria organizacao.

A camada tecnica de templates, versoes, preview, envio de teste, logs e
SMTP2GO deve ser compartilhada, mas as permissoes e filtros de dados devem
impedir que templates internos da YUX e templates dos clientes sejam misturados.

## Decisao Aprovada

O editor de email deve usar Tiptap em modo visual, com opcao de modo HTML para
usuarios avancados.

O editor precisa permitir:

- edicao visual do corpo do email;
- alternancia para HTML bruto;
- insercao de variaveis permitidas;
- preview desktop e mobile;
- envio de teste;
- validacao antes de publicar;
- historico de versoes e rollback.

## Escopos De Template

### System Templates

Templates globais do YUX Hub. Sao usados por fluxos internos do sistema e
editados somente por Admin YUX.

Exemplos:

- convite inicial para cliente definir senha;
- redefinicao de senha;
- senha alterada;
- novo usuario adicionado;
- permissao alterada;
- alerta de login suspeito;
- boas-vindas apos primeiro acesso;
- kickoff agendado;
- checklist de onboarding pendente;
- solicitacao de acessos, arquivos ou materiais;
- aviso operacional do Hub;
- aviso de integracao desconectada;
- relatorio disponivel;
- comunicados de cobranca YUX.

### Organization Templates

Templates pertencentes a uma organizacao cliente. Sao usados em automacoes,
sequencias comerciais, propostas, CRM e comunicacoes enviadas em nome do
cliente.

O cliente ve e edita somente os templates da sua organizacao. Admin YUX nao
deve ter uma tela operacional para listar e editar conteudo de todos os
clientes, porque isso nao escala e mistura responsabilidades. Para suporte,
Admin YUX pode ver metricas agregadas, status de envio, erros tecnicos e
configuracoes de infraestrutura sem expor conteudo por padrao.

Exemplos:

- follow-up de proposta;
- reativacao de lead;
- confirmacao de agendamento;
- envio de material comercial;
- lembrete de atendimento;
- resposta inicial a novo lead;
- sequencia de nutricao;
- email de pos-venda;
- campanha ou newsletter permitida pelo contrato e consentimento.

### Blueprint Templates

Modelos-base criados pela YUX para setores, objetivos ou boas praticas. O
cliente nao edita o blueprint diretamente; ele clona/importa o blueprint para
sua organizacao e passa a editar a copia.

Exemplos:

- imobiliaria: follow-up pos-visita;
- clinica: lembrete de consulta;
- oficina: aviso de servico concluido;
- agencia: follow-up de proposta;
- generico: resposta rapida a lead novo.

## Modelo De Dados

Adicionar uma camada de templates versionados sobre a infraestrutura SMTP2GO ja
existente.

### email_templates

Campos principais:

- `id`;
- `scope`: `system`, `organization` ou `blueprint`;
- `organization_id`: obrigatorio para `organization`, nulo para `system` e
  opcional para blueprints privados futuros;
- `blueprint_key`;
- `name`;
- `description`;
- `category`;
- `email_kind`: `transactional`, `operational` ou `marketing`;
- `module_key`;
- `trigger_key`;
- `status`: `draft`, `published`, `paused` ou `archived`;
- `subject`;
- `preheader`;
- `body_html`;
- `body_text`;
- `variables_schema`;
- `required_variables`;
- `editable_by_client`;
- `published_version_id`;
- `created_by`;
- `updated_by`;
- timestamps.

### email_template_versions

Cada publicacao cria uma versao imutavel.

Campos principais:

- `id`;
- `template_id`;
- `version_number`;
- `subject`;
- `preheader`;
- `body_html`;
- `body_text`;
- `variables_schema`;
- `required_variables`;
- `change_summary`;
- `published_by`;
- `published_at`;
- timestamps.

### Relacao Com Tabelas Existentes

A area deve reutilizar a base ja existente:

- `email_provider_connections` para conexoes SMTP2GO;
- `smtp2go_subaccounts` para subcontas por cliente;
- `email_send_requests` para fila/log de envio;
- `email_send_events` para eventos do provedor;
- `email_suppression_entries` para bounce, spam, unsubscribe e bloqueios;
- `email_usage_counters` para limites e consumo.

`email_send_requests` deve ser estendida para referenciar template e versao
quando o envio vier de um modelo:

- `template_id`;
- `template_version_id`;
- `rendered_variables`;
- `sender_scope`;
- `source_entity_type`;
- `source_entity_id`.

## Permissoes

### Admin YUX

Pode:

- listar, criar, editar, publicar e arquivar `system templates`;
- criar e publicar `blueprint templates`;
- ver metricas tecnicas agregadas dos clientes;
- ver status de SMTP2GO, subcontas, limites, erros e supressoes;
- enviar teste de templates do sistema.

Nao deve, no fluxo operacional normal:

- listar todos os templates de todos os clientes em uma unica tela;
- editar templates de cliente sem contexto explicito de suporte;
- visualizar conteudo de cliente por padrao.

### Cliente

Pode:

- listar templates da propria organizacao;
- criar templates proprios;
- clonar blueprints autorizados para sua organizacao;
- editar assunto, preheader, HTML visual e HTML bruto dos templates proprios;
- enviar teste para emails permitidos;
- publicar, pausar e arquivar templates proprios;
- usar templates proprios em automacoes e sequencias.

Nao pode:

- editar templates `system`;
- editar blueprints diretamente;
- acessar templates de outra organizacao;
- remover blocos obrigatorios de compliance quando o email for marketing;
- publicar template com variavel obrigatoria ausente.

## Areas De Produto

### Admin > Emails Do Sistema

Area interna YUX para emails do Hub.

Abas:

- Modelos;
- Editor;
- Versoes;
- Testes;
- Historico de envios;
- Supressoes;
- Configuracao tecnica.

### Portal Do Cliente > Modelos De Email

Area por organizacao cliente.

Abas:

- Meus modelos;
- Blueprints;
- Editor;
- Testes;
- Historico de envios;
- Supressoes e opt-out.

### Admin > Email/SMTP2GO

Tela existente deve continuar focada em infraestrutura:

- conta master SMTP2GO;
- conexoes por organizacao;
- subcontas;
- quotas;
- falhas;
- supressoes;
- webhooks;
- metricas agregadas.

Ela nao deve virar a tela de edicao de templates.

## Editor Visual E HTML

O editor Tiptap deve ser encapsulado em um componente isolado, por exemplo
`EmailTemplateEditor`, para evitar espalhar logica de editor pelo produto.

Funcionalidades iniciais:

- negrito, italico, listas, links, headings simples e paragrafos;
- botoes e CTAs com configuracao basica;
- imagem por URL ou asset aprovado quando o modulo de storage permitir;
- variaveis como chips;
- bloco de rodape/compliance travavel;
- preview responsivo;
- modo HTML com sanitizacao;
- geracao de texto alternativo a partir do HTML.

Variaveis devem ser declaradas por template ou por trigger. Exemplos:

- `{{client_name}}`;
- `{{company_name}}`;
- `{{invite_url}}`;
- `{{reset_url}}`;
- `{{proposal_url}}`;
- `{{lead_name}}`;
- `{{appointment_date}}`;
- `{{unsubscribe_url}}`.

Templates criticos precisam validar variaveis obrigatorias:

- convite inicial exige `{{invite_url}}`;
- redefinicao de senha exige `{{reset_url}}`;
- marketing exige `{{unsubscribe_url}}` e politica de consentimento.

## Fluxo De Publicacao

1. Usuario cria ou edita um rascunho.
2. Sistema valida assunto, corpo, variaveis obrigatorias, tipo de email e
   permissoes.
3. Usuario envia teste.
4. Usuario publica.
5. Sistema cria `email_template_versions`.
6. Template publicado passa a ser usado pelos fluxos de envio.
7. Historico permite comparar versoes e restaurar uma versao anterior.

## Fluxo De Envio

1. Modulo de negocio solicita envio com `template_key` ou `template_id`.
2. Backend resolve escopo e permissao.
3. Backend carrega a versao publicada.
4. Backend valida variaveis obrigatorias.
5. Backend renderiza assunto, HTML e texto.
6. Backend valida opt-in, supressao, limite e subconta SMTP2GO.
7. Backend cria `email_send_requests`.
8. Backend envia via SMTP2GO.
9. Backend grava status inicial e eventos.
10. Webhooks SMTP2GO atualizam entrega, bounce, spam, unsubscribe e reject.

## Integracao Com Automacoes

As automacoes devem usar `organization templates` quando enviarem email em nome
do cliente.

Regras:

- `send_email` pode receber `template_id` ou conteudo simples;
- emails de marketing exigem politica de consentimento;
- sequencias por email exigem email e opt-in;
- envios respeitam supressoes e quota;
- a simulacao de automacao deve mostrar bloqueios antes da publicacao;
- blueprints de automacao podem apontar para blueprints de email, mas a
  execucao real usa a copia da organizacao.

## Migracao Dos Emails Hardcoded

Os emails atuais de convite e redefinicao de senha devem continuar funcionando
durante a migracao.

Abordagem:

1. Criar templates `system` padrao para convite inicial e redefinicao de senha.
2. Alterar o backend para tentar usar template publicado.
3. Se o template nao existir ou estiver invalido, usar fallback hardcoded atual.
4. Depois de validado em producao, manter fallback como defesa operacional.

Isso evita quebrar login, convite e redefinicao de senha durante a transicao.

## Seguranca E Compliance

Requisitos:

- sanitizar HTML salvo e HTML renderizado;
- impedir scripts, handlers inline perigosos e iframes nao autorizados;
- validar URLs de links;
- registrar auditoria de edicao e publicacao;
- registrar quem enviou teste;
- manter credenciais SMTP2GO somente no backend;
- nunca expor API key no frontend;
- exigir opt-in para marketing;
- respeitar supressoes;
- exigir link de opt-out em marketing;
- separar estritamente templates por organizacao.

## Fora Do Escopo Inicial

- marketplace publico de templates;
- editor de landing pages;
- edicao colaborativa em tempo real;
- IA gerando layout completo de email automaticamente;
- drag-and-drop avancado estilo builder de marketing enterprise;
- Admin YUX editando em massa templates de clientes.

## Fases Recomendadas

### Fase 1 - Fundacao De Templates

- schema `email_templates` e `email_template_versions`;
- servicos backend para CRUD, publish, preview e test send;
- migracao dos templates de convite e redefinicao;
- area Admin YUX para system templates.

### Fase 2 - Editor Tiptap

- componente visual HTML;
- modo HTML bruto;
- variaveis como chips;
- preview desktop/mobile;
- validacao e sanitizacao;
- envio de teste.

### Fase 3 - Portal Do Cliente

- area de modelos de email por organizacao;
- clones de blueprints;
- templates em automacoes e sequencias;
- historico de envios por organizacao.

### Fase 4 - Governanca E Operacao

- supressoes completas;
- eventos SMTP2GO por template;
- metricas por template;
- rollback;
- auditoria detalhada;
- suporte tecnico sem expor conteudo por padrao.

## Criterios De Aceite

- Admin YUX consegue editar e publicar templates do sistema sem ver templates
  dos clientes.
- Cliente consegue criar, editar, testar e publicar templates da propria
  organizacao.
- Cliente nao consegue acessar templates de outra organizacao.
- Convite inicial e redefinicao de senha usam templates publicados quando
  disponiveis.
- Se um template critico estiver ausente ou invalido, fallback hardcoded mantem
  o fluxo funcionando.
- Email de marketing nao publica sem politica de consentimento e opt-out.
- Envios registram request, evento, status e erro protegido quando houver.
- Editor visual e modo HTML produzem HTML sanitizado.
- Automacoes conseguem usar templates publicados da organizacao.

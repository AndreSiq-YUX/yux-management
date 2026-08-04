# Formulários externos de leads

## O que foi criado

Cada contrato pode ter formulários públicos independentes com token próprio. Formulários já vinculados a uma landing page continuam funcionando. O endpoint recebe JSON ou `application/x-www-form-urlencoded`, cria ou identifica o lead dentro da organização e registra a origem da captura.

O token completo aparece somente ao ativar o formulário ou ao rotacionar o endpoint. No banco fica apenas o hash do token.

## Ativação no painel do cliente

1. Abra o contrato e acesse **Marketing → Formulários externos**.
2. Clique em **Novo formulário**; não é necessário ter uma landing page cadastrada na YUX.
3. Informe nome, origens permitidas e versões de consentimento e política.
4. O sistema cria o formulário com o mapeamento padrão de identidade, contato, perfil e scores.
5. Copie o endpoint exibido e configure-o no formulário ou provedor externo.
6. Se o endpoint for exposto ou substituído, use **Gerar novo endpoint**; o token anterior deixa de funcionar.

O formulário começa ativo. **Pausar captura** interrompe novas submissões sem excluir os leads já recebidos.

## Payload mínimo

```http
POST https://app.exemplo.com/api/public/lead-forms/<TOKEN>/submissions
Content-Type: application/json
Idempotency-Key: pedido-123
Origin: https://site-do-cliente.com

{
  "name": "Maria Silva",
  "email": "maria@empresa.com",
  "phone": "+55 11 99999-9999",
  "company": "Empresa Exemplo",
  "consent_lgpd": true,
  "consent_code": "marketing_e_vendas",
  "consent_version": "2.1",
  "privacy_policy_version": "2026-07",
  "profile": "decisor",
  "country": "BR",
  "fit_score": 82,
  "intent_score": 67,
  "crm_contact_id": "crm-12345",
  "language": "pt-BR",
  "page_url": "https://site-do-cliente.com/campanha",
  "referrer": "https://google.com/",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "campanha-julho"
}
```

`name`, `email` e o consentimento LGPD são obrigatórios por padrão. O formulário também aceita os aliases `full_name`, `nome`, `mail`, `telefone`, `empresa`, `consent` e `consentAccepted`. Campos adicionais são preservados na atribuição e podem ser usados nas condições da automação.

## Campos personalizados por cliente

No card de captura, use **Configurar campos** para relacionar o nome enviado pelo formulário ao campo salvo no CRM. Os mapeamentos pertencem ao formulário/cliente e podem ser diferentes em cada contrato.

`name` e `email` devem permanecer mapeados. Chaves adicionais são gravadas em `lead_custom_field_values` como estado atual do cadastro; o payload completo continua registrado em cada linha de `landing_page_form_submissions`, sem sobrescrever submissões anteriores.

## Onde cada dado fica

| Dado | Registro |
| --- | --- |
| E-mail normalizado | `leads.normalized_email`, calculado pelo banco |
| Identificador do contato | `leads.contact_identifier`, UUID permanente |
| Origem, página, idioma e referrer | Fotografia em cada submissão e contexto de atribuição |
| UTMs completas | Submissão e `lead_attribution_events` |
| Data e hora | `submitted_at`, `created_at` e `occurred_at` |
| Código/versão do consentimento | Colunas imutáveis da submissão |
| Versão da política | Coluna imutável da submissão |
| Perfil e país | Estado atual no lead e fotografia na submissão |
| Estágio e responsável | Pipeline/estágio e campos de atribuição existentes no lead |
| Próxima ação | `lead_next_actions` e `next_follow_up_at` |
| Score de fit e intenção | `fit_score` e `intent_score`, separados do score geral |
| Histórico de submissões | Uma linha por envio em `landing_page_form_submissions` |
| Identificador do CRM | `crm_contact_id` no lead e na submissão |
| `user_id` futuro | Campo reservado, preenchido apenas por vínculo interno autenticado |
| `organization_id` | Resolvido pelo token do formulário; nunca aceito do payload público |

O header `Idempotency-Key` deve ser estável para a mesma submissão. Se não for enviado, o sistema cria uma chave com SHA-256 do payload. Para integrações que possuem um identificador próprio, envie também `X-External-Submission-Id`.

## Respostas

- `201`: lead novo criado; os eventos `lead.created` e `form.submitted` são
  gravados no outbox na mesma transação da captura.
- `200`: submissão idempotente repetida ou lead já existente; não cria um novo
  lead. Uma nova submissão para uma identidade existente ainda registra
  `form.submitted` e seu histórico/atribuição.
- `403`: a origem não está na lista permitida.
- `409`: a organização não tem pipeline e estágio válidos para receber o lead.
- `422`: falta nome, e-mail ou consentimento.
- `500`: a transação não foi concluída. É seguro repetir com a mesma
  `Idempotency-Key`.

A aceitação do formulário não depende da disponibilidade imediata do Redis. O
lead, a submissão e os eventos são confirmados juntos no Postgres; o worker
entrega os eventos pendentes quando a fila estiver disponível.

## Automação

Crie ou edite um fluxo publicado com gatilho `form.submitted` para reagir a
toda nova submissão aceita, inclusive quando o lead já existia. Use
`lead.created` apenas quando a automação deve executar uma vez para uma nova
identidade. O contexto mantém `formId`, `submissionId`, origem, UTMs e campos
personalizados; `landingPageId` também é informado quando houver vínculo com
uma landing page.

Cada fluxo compatível recebe uma execução independente, com versão publicada
congelada, limite diário, idempotência, proteção contra reentrada/loop e retry.
As ações CRM nativas incluem criação de tarefa, registro de atividade, mudança
de funil/estágio, atribuição de responsável, atualização permitida de campos,
tags, matrícula/pausa de sequência e ajuste manual de score. Ações externas,
IA e WhatsApp continuam usando `N8N_CRM_WEBHOOK_URL` com
`N8N_WEBHOOK_SECRET` quando selecionadas.

O consumidor de scoring já recebe os eventos, mas ainda não altera o lead: até
o plano de scoring por ações ser implementado, ele conclui a entrega com
`scoring_not_enabled`.

## Produção

- Aplicar a migration `0113_external_lead_forms.sql`.
- Aplicar também a migration `0114_lead_identity_consent_and_scoring.sql`.
- Aplicar a migration `0117_standalone_external_lead_forms.sql` para liberar formulários independentes por contrato.
- Aplicar `0118_external_lead_form_crm_visibility.sql` para reconciliar a
  visibilidade dos leads capturados no CRM governado.
- Aplicar `0119_lead_orchestration_foundation.sql` para o outbox, entregas e
  runtime de automações.
- Aplicar também `0120_crm_pipeline_management.sql`, `0121_crm_task_center.sql`
  e `0122_lead_scoring_rules.sql` para habilitar a configuração de funis,
  central de tarefas e scoring por ações.
- Garantir que o worker e a fila estejam ativos para processar o outbox; uma
  indisponibilidade temporária atrasa a automação, mas não perde a captura já
  confirmada no Postgres.
- Configurar `PUBLIC_APP_URL` para que o painel mostre uma URL pública completa.
- Para submissões feitas por JavaScript em outro domínio, configurar `CORS_ORIGIN` com a origem do site externo. Submissões server-to-server ou HTML tradicional não dependem dessa configuração de navegador.
- Quando necessário, restringir o formulário a domínios específicos pelo campo `allowedOrigins` da rota autenticada `PATCH /api/landing-pages/forms/:id`.

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

- `201`: lead novo criado; o job `lead.created` é enviado para automações.
- `200`: submissão repetida ou lead já existente; não cria um novo lead.
- `403`: a origem não está na lista permitida.
- `409`: a organização não tem pipeline e estágio válidos para receber o lead.
- `422`: falta nome, e-mail ou consentimento.
- `503`: o lead foi salvo, mas a fila estava temporariamente indisponível; repita a chamada com a mesma `Idempotency-Key` para reenviar a automação sem duplicar o lead.

## Automação

Crie ou edite um fluxo publicado com gatilho **Lead criado**. A entrada pelo formulário dispara esse mesmo evento e mantém no contexto `formId`, origem, UTM e campos personalizados. `landingPageId` também é informado quando o formulário estiver vinculado a uma landing page.

As ações CRM executadas pelo worker incluem criação de tarefa, registro de atividade, mudança de estágio, atribuição de responsável e atualização de campos. Ações externas continuam usando `N8N_CRM_WEBHOOK_URL` e o segredo configurado para o webhook.

## Produção

- Aplicar a migration `0113_external_lead_forms.sql`.
- Aplicar também a migration `0114_lead_identity_consent_and_scoring.sql`.
- Aplicar a migration `0117_standalone_external_lead_forms.sql` para liberar formulários independentes por contrato.
- Garantir que o worker e a fila estejam ativos.
- Configurar `PUBLIC_APP_URL` para que o painel mostre uma URL pública completa.
- Para submissões feitas por JavaScript em outro domínio, configurar `CORS_ORIGIN` com a origem do site externo. Submissões server-to-server ou HTML tradicional não dependem dessa configuração de navegador.
- Quando necessário, restringir o formulário a domínios específicos pelo campo `allowedOrigins` da rota autenticada `PATCH /api/landing-pages/forms/:id`.

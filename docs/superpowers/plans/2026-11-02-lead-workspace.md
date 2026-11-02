# Ficha de lead funcional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar a ficha de lead, concluir suas ações e preservar os dados comerciais do Radar nas importações novas e existentes.

**Architecture:** Separar dados comerciais, operações da ficha e composição visual. Uma projeção comercial única alimenta importação e reconciliação, enquanto a ficha usa contratos explícitos e componentes focados; ações utilizam os módulos existentes com persistência e feedback.

**Tech Stack:** React/TypeScript, Vite, Tailwind, componentes Radix/shadcn existentes, Fastify, PostgreSQL, Vitest e validação visual em navegador.

**Spec:** `docs/superpowers/plans/2026-11-02-lead-workspace-spec.md`

## Global Constraints

- Somente o papel global `yux_admin` pode receber/ver ferramentas, fornecedores, modelos, rotas LLM, licenças, custos internos e diagnósticos técnicos do Radar.
- Aplicar a separação no backend, por allowlists explícitas inclusive aninhadas, além da interface.
- CNPJ da empresa não é o fornecedor CNPJá; preserve o dado cadastral, não divulgue o mecanismo de coleta.
- Dados comerciais legítimos (inclusive nomes parecidos com fornecedores) não podem ser mutilados por substituição global de texto.
- Não remover obrigações de atribuição/licença para ocultar ferramentas.
- Não executar chamadas a provedores/LLMs externos pagos nem trocar/ativar um modelo pago sem autorização explícita do usuário para o serviço/modelo.
- Testes de desenvolvimento usam provedores simulados.
- Não executar envios reais a leads durante validação. Não alterar credenciais, limites ou integrações em produção.

## Review Focus

- Contato de filial ou identidade homônima não deve tornar-se contato principal confirmado da empresa errada.
- Atualização antiga não deve sobrescrever edição manual concorrente nem recuperar lead excluído.
- Números genéricos não comprovam WhatsApp; dados públicos não comprovam consentimento.
- Trocar rapidamente lead/conta com formulário ou carregamento pendente não pode misturar dados nem gravar no destino anterior.
- Nomes longos e perfis sem tipo/nota/contato não devem recriar painéis vazios dominando o celular ou esconder ações acessíveis.

---

### Task 1: Preservar dados comerciais na importação e na API do CRM

**Files:**
- Modify: `backend/src/modules/radar/crm-delivery.ts`, `backend/src/modules/radar/repository.ts`, `backend/src/modules/crm/repository.ts`, `backend/src/modules/crm/routes.ts`.
- Create: `backend/src/modules/crm/lead-commercial-profile.ts`, `backend/src/db/migrations/0253_crm_lead_commercial_profile.sql` (confirmar próximo número antes de criar).
- Modify: `frontend/src/types/crm.ts`, `frontend/src/services/crmService.ts`.
- Test: `backend/tests/radar-crm-delivery.test.ts`, `backend/tests/integration/radar-crm-delivery.test.ts`, `backend/tests/integration/radar-commercial-audience.test.ts`.
- Create test: `backend/tests/integration/crm-lead-commercial-profile.test.ts`.

**Interfaces:**
- Consumes: `projectRadarCommercialFacts(payload)`, `projectRadarCompanyFacts(payload,title)`, verificações existentes de associação e direitos de entrega.
- Produces: `LeadCommercialProfile` com empresa/localização, site, contatos tipados, redes e pesquisa comercial permitida; `projectLeadCommercialProfile(value: unknown): LeadCommercialProfile` como allowlist aninhada.
- Dados básicos são propriedades explícitas de `CrmLead`: `websiteUrl`, `whatsappPhone`, `city`, `state`, `address`, `cnpj`; detalhe comercial usa `commercialProfile` tipado. Atualização valida URLs/valores e respeita o mesmo escopo do lead.

- [x] **Step 1: Escrever regressões dos dados perdidos e da audiência.** Fixture com site, CNPJ, cidade, UF, endereço, dois e-mails, telefone, WhatsApp e rede confirmados; afirmar preservação no importador e GET direto. Injetar chaves internas em todos os níveis e afirmar ausência para operador/admin da conta/membro. Empresa chamada “Brave Alimentos” mantém o nome comercial. Contatos pendentes ou de identidade conflitante não viram principais.
- [x] **Step 2: Executar os testes e confirmar falha por ausência dos campos.** `npm --prefix backend run test -- tests/radar-crm-delivery.test.ts` e testes de integração focados, com PostgreSQL descartável.
- [x] **Step 3: Implementar migração, projeção, mapeamento e escrita tipada nos dois caminhos de importação.** Preservar múltiplos contatos, não inferir WhatsApp nem consentimento, e não reutilizar pontuação do Radar no modelo de qualificação. Incluir edição dos campos básicos no contrato.
- [x] **Step 4: Reexecutar testes, incluindo quatro papéis e tentativa com IDs de outra conta.** Validar instalação limpa e banco atualizado da versão 0252.
- [x] **Step 5: Commit.** `feat(crm): preserve commercial lead data from Radar`.

### Task 2: Recuperar lacunas dos leads já importados

**Files:**
- Create: `backend/src/modules/radar/crm-reconciliation.ts`, `backend/tests/radar-crm-reconciliation.test.ts`, `backend/tests/integration/radar-crm-reconciliation.test.ts`.
- Modify: `backend/src/modules/radar/routes.ts`, `frontend/src/services/radarService.ts`.
- Create: `frontend/src/components/crm/LeadRadarReconciliation.tsx` e teste correspondente.

**Interfaces:**
- Consumes: `LeadCommercialProfile`, vínculo persistido candidato/oportunidade–lead, pesquisas já salvas e verificações de licença/escopo da Task 1.
- Produces: `previewRadarLeadReconciliation(pool,user,{leadId})` com propostas `{field,currentValue,incomingValue,decision}` e motivos comerciais; `applyRadarLeadReconciliation(pool,user,{leadId,previewRevision,requestId})` com resultado idempotente e resumo auditável. Aplicação padrão preenche somente lacunas.

- [x] **Step 1: Escrever testes de preenchimento de lacuna e preservação.** `websiteUrl` vazio recebe site salvo; cidade manual permanece; segundo apply não muda nada; WhatsApp pendente, lead excluído, outra conta e licença incompatível são recusados. Alteração manual após prévia impede aplicação obsoleta.
- [x] **Step 2: Executar regressões e confirmar falha antes da implementação.** `npm --prefix backend run test -- tests/radar-crm-reconciliation.test.ts`.
- [x] **Step 3: Implementar prévia/aplicação transacional com revisão e auditoria e controle contextual na ficha.** Não acionar pesquisa, fornecedores, reenvios, reativação de lead ou mudança de etapa/nota/consentimento. Preparar reconciliação dos existentes sem executá-la em produção nesta etapa.
- [x] **Step 4: Verificar HTTP direto nos quatro papéis e preservação de dados manuais/concorrentes.** Provar que provedores simulados não são chamados por esse fluxo.
- [x] **Step 5: Commit.** `feat(crm): reconcile saved Radar data without overwriting edits`.

### Task 3: Concluir operações reais da ficha

**Files:**
- Create: `frontend/src/components/crm/LeadActivityComposer.tsx`, `frontend/src/components/crm/LeadEmailComposer.tsx`, `frontend/src/hooks/useLeadOperations.ts` e respectivos testes.
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`, `frontend/src/components/crm/Lead360Panel.tsx`, `frontend/src/components/crm/LeadConversationPanel.tsx`, `frontend/src/components/crm/LeadTaskPanel.tsx`.
- Modify: `backend/src/modules/crm/routes.ts`, `backend/src/modules/crm/repository.ts`, reutilizando `backend/src/modules/email-delivery/service.ts` e controles existentes.
- Create tests: `backend/tests/crm-lead-actions.test.ts`, `backend/tests/integration/crm-lead-actions.test.ts`.

**Interfaces:**
- Consumes: operações atuais de interações, tarefas, atendimento, propostas, fechamento e entrega de e-mail.
- Produces: `LeadAction = 'note' | 'email' | 'whatsapp' | 'call' | 'task' | 'meeting' | 'proposal'`; `useLeadOperations({lead,organizationId,onChanged})` fornece estado de composição, abertura, validação, gravação e erro por ação. Nenhuma ação habilitada sem handler.
- Reunião persiste agendamento/atividade no CRM e eventual arquivo de calendário; integração externa não existente permanece explicitamente ausente. Chamada abre discagem e possui registro separado de resultado.

- [x] **Step 1: Escrever regressões dos cliques inertes.** Nota abre editor e persiste; Tarefa abre formulário antes de gravar; Reunião agenda e aparece no calendário/atividades; E-mail abre destinatário e informa remetente indisponível; WhatsApp navega para conversa correta; Proposta abre o fluxo comercial.
- [x] **Step 2: Rodar regressões e confirmar falhas atuais.** `npm --prefix frontend run test -- src/components/crm/CrmWorkspace.test.tsx` e testes dos novos compositores.
- [x] **Step 3: Vincular ações aos módulos reais e concluir os contratos faltantes.** E-mail exige envio explícito, idempotência, estado de fila/entrega e política existente; testes usam provedor simulado. Incluir busy/erro, atualização de histórico/lista/indicadores, validação de dados e descarte de respostas assíncronas do lead anterior. Sem falsa mensagem de envio ou convite concluído.
- [x] **Step 4: Executar integração de persistência e falhas.** Duplicação de clique, rejeição de provedor, falta de permissão/integração, exclusão concorrente e troca de conta/lead. Verificar que registrar e-mail enviado não pontua como resposta recebida e que abrir discador não registra chamada concluída.
- [x] **Step 5: Commit.** `feat(crm): connect lead actions to persisted workflows`.

### Task 4: Integrar o layout e validar a experiência completa

**Files:**
- Modify: `frontend/src/components/crm/LeadDeleteDialog.tsx`, `frontend/src/components/crm/LeadProfileSummary.tsx`, `frontend/src/components/crm/scoring/LeadScoreSummary.tsx`, `frontend/src/components/crm/LeadDetailPanel.tsx`, `frontend/src/components/crm/Lead360Panel.tsx`, `frontend/src/components/crm/CrmWorkspace.tsx`.
- Modify: `frontend/src/components/growth-workspace/Record360Layout.tsx`, `frontend/src/components/growth-workspace/RecordIdentityPanel.tsx`, `frontend/src/components/growth-workspace/RecordAssociationsPanel.tsx`, `frontend/src/components/growth-workspace/RecordTabs.tsx` somente quando a alteração genérica preservar os demais consumidores; preferir componente específico quando necessário.
- Create: `frontend/src/components/crm/LeadContactDetails.tsx`, `frontend/src/components/crm/LeadWorkspaceLayout.tsx` e testes de interação.

**Interfaces:**
- Consumes: perfil comercial, prévia de reconciliação e operações das Tasks 1–3; perfil personalizado e qualificação existentes.
- Produces: uma ficha sem dupla navegação, identidade compacta, contatos/campos integrados, nota/temperatura contextual e ícone de exclusão acessível. Associações usam vínculos reais e destinos válidos.

- [x] **Step 1: Escrever testes de estrutura e comportamento.** Um único conjunto de abas operacionais; ícone `Excluir <nome>` dispara a mesma confirmação recuperável; campos e explicação da nota continuam acessíveis; cabeçalho não contém dois cartões de largura total antes do trabalho. Cobrir lead sem tipo/contato/nota, nome longo e acesso somente leitura.
- [x] **Step 2: Confirmar falhas nas regressões atuais.** Testes focados `CrmWorkspace`, `LeadQualification` e novas interações da ficha.
- [x] **Step 3: Implementar composição proposta na spec.** Manter componentes e tokens do projeto; contatos/site/redes clicáveis com protocolo seguro, edição contextual, abas e formulários ligados às operações reais. Não remover campos por decisão unilateral.
- [x] **Step 4: Validar em navegador com dados locais.** Fluxo: importar fixture Radar → abrir ficha → conferir dados → editar campo → registrar nota/tarefa/reunião → compor e-mail simulado → abrir conversa/proposta → conferir histórico e pontuação → excluir/recuperar fixture. Desktop 1440×900 e celular 390×844; conferir primeira tela, teclado, nomes longos, sobreposição, mensagens de erro e console. Guardar imagens fora do repositório.
- [x] **Step 5: Rodar testes apropriados e builds.** Suítes focadas de ambos os pacotes, integrações PostgreSQL e `npm --prefix backend run build` / `npm --prefix frontend run build`. Ampliar regressões conforme áreas efetivamente alteradas; não mascarar falhas legadas de lint.
- [x] **Step 6: Commit.** `refactor(crm): integrate lead workspace and compact actions`.

## Handoff

Revisar o desenho e o escopo antes da implementação. A execução pode permanecer nesta conversa, conforme a preferência anterior do usuário. Sem migração, envio real, reconciliação de registros ou deploy de produção nesta fase de planejamento. Após implementar, apresentar evidência visual e comportamento testado antes da etapa de publicação.

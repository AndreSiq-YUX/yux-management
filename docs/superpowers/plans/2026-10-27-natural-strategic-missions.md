# Conversa estratégica natural e fundamentada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fazer Missões entregar orientação estratégica útil desde o primeiro pedido amplo, com conteúdo governado real, hipóteses claras, perguntas seletivas e informações operacionais corretas.

**Architecture:** A resposta humana permanece livre e contextual, com metadados estruturados para propostas/aprovações. O Harness recebe os trechos aprovados dentro do orçamento existente; normalizadores corrigem apenas questões operacionais, preservando a consultoria. Habilitação comercial, integração de ações e conexão são fatos distintos. A interface mantém a conversa como principal e apresenta pendências de execução de forma contextual.

**Tech Stack:** Python/Harness, Fastify/TypeScript/Postgres, React, pytest e Vitest.

**Spec:** Pedido do usuário neste chat em 27/10/2026: orientação de marketing/estratégia fluida, exemplos e hipóteses baseados no Harness/Black Book, sem roteiro de formulário nem perguntas sobre configuração que o sistema deve consultar. Regras permanentes em `AGENTS.md`.

## Global Constraints

- Não alterar modelo, teto de tokens, credenciais, permissões, módulos ou aprovações. Nova inferência paga requer autorização própria; usar mocks e replay local durante desenvolvimento.
- Não remover esquema/validações de ações, proteção entre contas, governança/publicação de conhecimento ou separação de audiência do Radar.
- Conhecimento estratégico e ferramentas são gerais; dados e estratégia da empresa permanecem privados da conta.
- Não inventar visita a sites, pesquisa, números de mercado, produtos, fonte, conexão, autorização ou execução. Hipóteses e recomendações são permitidas e identificadas.
- Preservar todo o trabalho existente de Radar, Projetos e WhatsApp.
- Usar a autorização de correção/publicação existente para a implantação do código; não criar campanhas nem alterar conexões reais.

## Evidência inicial

- `enforce_account_availability` substitui `reply` inteiro quando encontra uma questão técnica; isso elimina a consultoria.
- `_authorized_record` conserva o conteúdo governado em `content`, mas `_strategy_item_text` escolhe `concept` e envia apenas o título, sem o corpo do card.
- O orçamento da busca produz um texto limitado, mas o item original conserva conteúdo integral: o trecho enviado ao Harness precisa obedecer ao recorte efetivamente aprovado pelo orçamento.
- A interface renderiza perguntas e lacunas duplicadas como cartões, inclusive de etapas antigas.
- Conta piloto: Radar, CRM, WhatsApp IA e automações habilitados; sem registros próprios em `channel_connections`/`email_provider_connections`; e-mail central ativo, com remetente e credencial. Não confundir ausência de conexão própria com ausência do serviço central, nem WhatsApp IA com permissão para enfileirar templates via Missões.

## Review Focus

- Conteúdo governado substantivo chega ao prompt; o limite de contexto continua respeitado, sem vazamento de outra conta ou conteúdo não publicado.
- Uma frase técnica incorreta não apaga os parágrafos estratégicos nem converte consentimento/escolhas de negócio em fatos do sistema.
- Discussão consultiva pode prosseguir sem ID de campanha, quantidade, conexão ou aprovação de envio; execução continua validada pelos mecanismos atuais.
- E-mail e WhatsApp usam suas fontes reais e distinguem serviço central, conexão da conta e capacidade de ação; falha de consulta permanece desconhecida.
- Perguntas antigas/lacunas repetidas não dominam a interface; aprovação de plano/brief continua explícita e acessível.

### Task 1: Conteúdo governado no Harness

**Files:** `retrieval.py`, `harness.py`, testes de recuperação/Harness/conversa.
**Interfaces:** Acrescentar `context_excerpt` aos resultados internos recortados pela busca; `_strategy_item_text` usa esse trecho para itens governados e mantém compatibilidade dos cards antigos. Não ampliar o orçamento existente.

- [x] RED: card publicado contendo título e regra estratégica; provar corpo ausente do prompt atual. Cobrir recorte, regras dos cards legados e fontes privadas/publicadas.
- [x] GREEN: transportar somente o trecho autorizado pelo orçamento; preservar conteúdo/proveniência para hashes e verificação.
- [x] Verificar testes focados, suíte runtime e registrar evidências.

### Task 2: Consultoria primeiro e correção operacional localizada

**Files:** `workflow.py`, novo `mission_conversation_prompt.py` se necessário, `mission_account_availability.py`, testes de conversa/disponibilidade/golden.
**Interfaces:** `reply` continua Markdown livre; perguntas/lacunas são metadados opcionais. Contrato orienta diagnóstico, prioridades, exemplos, hipóteses e próximos passos antes das poucas perguntas necessárias. Guardião não altera aprovações/capacidades.

- [ ] RED: resposta estratégica ampla + pergunta técnica indevida; preservar análise, remover apenas a pergunta, não criar bloqueio consultivo nem pedir configuração ao cliente.
- [ ] RED: afirmação errada de disponibilidade, escolha de negócio legítima, status desconhecido, conta divergente, consentimento e proposta executável bloqueada.
- [ ] GREEN: correção por trecho e metadados coerentes; não substituir a resposta inteira. Não exigir pré-requisitos de execução para desenvolver estratégia.
- [ ] Verificar prompts simulados para representante, oficina e agência, sem introduzir roteiro específico de cliente.

### Task 3: Disponibilidade operacional fiel às fontes

**Files:** `backend/src/modules/action-engine/context-builder.ts`, `mission-account-availability.ts` e novo resolvedor interno de conexões se necessário; testes unitários/integrados.
**Interfaces:** Preservar `enabled`/`planningAvailable` e as permissões reais; explicitar seu significado para o Harness. Consultar `email_provider_connections` para e-mail e `channel_connections` para WhatsApp, distinguindo disponibilidade central e conexão própria sem divulgar fornecedores/segredos.

- [ ] RED: e-mail conectado em sua tabela própria, serviço central configurado sem conexão própria, WhatsApp ativo/inativo, falha de consulta e isolamento por organização.
- [ ] GREEN: snapshot seguro e tipado, consultado a cada turno; nenhum novo direito/capacidade é concedido.
- [ ] Verificar Admin YUX, operador, admin da conta e membro, HTTP direto e isolamento; não expor detalhes internos do Radar.

### Task 4: Conversa principal e validação integrada

**Files:** `MissionConversationThread.tsx`, testes da interface e runbook de Missões.
**Interfaces:** Preservar callbacks de resposta/aprovação; perguntas atuais em apresentação leve, histórico não acionável, lacunas duplicadas removidas da apresentação e pendências técnicas com ação de configuração adequada, sem pergunta de habilitação ao cliente.

- [ ] RED/GREEN: conteúdo estratégico permanece principal; perguntas/lacunas não duplicam; etapas antigas não apresentam ações ativas; brief/planos mantêm aprovação.
- [ ] Executar testes/builds apropriados, replay local completo sem provedor pago e revisão independente única.
- [ ] Integrar/preservar main, implantar a correção autorizada e verificar saúde/contexto sem inferência paga.
- [ ] Preparar uma demonstração real somente depois de código pronto, mediante autorização específica de consumo; não alterar histórico da conversa original silenciosamente.

# CRM Record Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Permitir tipos de cliente por CRM, com campos comuns e específicos, preenchidos na criação e edição do lead.

**Architecture:** Reutilizar `crm_custom_field_definitions` e `lead_custom_field_values`; adicionar tipos de ficha vinculados à instância e seleção no lead. API dedicada valida permissões, escopo e valores; criar lead e perfil na mesma transação. Preservar valores ao trocar tipo ou arquivar definições.

**Tech Stack:** PostgreSQL, Fastify, Zod, React, Vitest, Playwright.

**Spec:** Solicitação do usuário nesta conversa em 2026-10-29: cada cliente configura tipos como cozinhas industriais, mercados e hotéis, com campos correspondentes por lead.

## Global Constraints

- Isolar configurações e dados por organização e instância CRM.
- Respeitar `allow_client_field_customization`, limite de campos e papéis administrativos.
- Não alterar dados existentes nem aplicar migrações em produção sem fluxo de entrega disponível.
- Suportar texto, texto longo, número, data, seleção e sim/não; obrigatoriedade e arquivamento.
- Troca de tipo preserva dados dos outros tipos, mas apenas campos aplicáveis são exibidos/validados.

## Review Focus

- Campos de outro cliente/tipo são rejeitados pelo servidor.
- Zero e falso são respostas válidas para campos obrigatórios.
- Troca de tipo preserva respostas antigas.
- Leads anteriores continuam sem tipo e aceitam campos comuns.
- Falha ao salvar perfil durante criação desfaz a criação do lead.

### Task 1: Persistência e API

**Files:** migration `0179_crm_record_types.sql`; `backend/src/modules/crm/record-profile.ts`; CRM routes/repository; `backend/tests/crm-record-profile.test.ts`.

**Interfaces:** `registerRecordProfileRoutes(app, authenticate)`, `saveLeadProfile(db,user,leadId,input)`, `validateProfileValues(definitions,values)`; GET `/crm/record-profile/configuration`; POST/PATCH `/crm/record-types`, `/crm/custom-fields`; GET/PUT `/crm/leads/:id/profile`.

- [x] Escrever e executar testes de tipos, obrigatoriedade, escopo e acesso antes da implementação.
- [x] Adicionar migração aditiva e endpoints autenticados com transações.
- [x] Integrar perfil opcional à criação atômica de lead e executar testes backend.

### Task 2: Configuração e preenchimento

**Files:** `frontend/src/types/crmRecordProfile.ts`; service; componentes `CrmRecordConfiguration`, `LeadProfileFields`, `LeadProfilePanel`; `CrmWorkspace.tsx`; configuração pelo botão Tipos e campos no cockpit.

**Interfaces:** service `getConfiguration(crmInstanceId)`, CRUD de tipos/campos, `getProfile(leadId)`, `saveProfile(leadId,input)`; campos reutilizados na criação e edição.

- [x] Implementar gestão de tipos e campos com opções, obrigatoriedade e arquivamento.
- [x] Selecionar tipo na criação e na ficha, renderizar campos aplicáveis e salvar valores.
- [x] Testar troca de tipo, controles numéricos/booleanos e erros de carregamento/salvamento.

### Task 3: Validação e documentação

**Files:** testes backend/frontend; documentação CRM.

- [x] Rodar testes focados e type-check de ambos os projetos.
- [x] Validar fluxo renderizado desktop/mobile com Playwright (Browser plugin não disponível).
- [x] Registrar comportamento, preservação de dados e migração necessária; revisar diff sem tocar alterações preexistentes.


## Publicação em produção — 2026-10-29

- Base de publicação: main `1c18c6968998bc12c39438e16621115afe30b836`, em checkout isolado.
- Integração preserva o formulário atual LeadCreateDialog, vocabulário do cliente, atalhos e layouts responsivos; os campos foram conectados às variantes interna e portal.
- Validação: 1.664 testes backend, 1.291 frontend e 2 integrações PostgreSQL passaram; compilações, orçamento de bundle e inventário de migrations passaram.
- Teste de navegador: configurar tipos/campos, criar lead com zero/falso, trocar tipo, salvar, recarregar e restaurar respostas; desktop e celular sem overflow.
- Lint dos arquivos alterados passou. O lint global mantém um aviso preexistente em RadarResearchAttention.tsx que excede sua entrada do baseline; nenhuma supressão foi adicionada.
- Migration 0179_crm_record_types já aplicada no banco de produção, com checksum 66755a16b97a7334cea1c65ed8a4afc768f5bf363e17ee205f048149db3c3d1e.
- Alterações de outros trabalhos no diretório original não fazem parte desta publicação.

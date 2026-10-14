# Radar — contatos de fontes oficiais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar contatos de terceiros do dossiê da empresa pesquisada e recuperar canais públicos úteis antes de autorizar pesquisa em lote.

**Architecture:** Restringir coleta e projeção de contatos ao domínio associado e aos perfis públicos comprovadamente vinculados por esse domínio. Preservar páginas de terceiros como evidências históricas, sem promovê-las a canais da empresa. Corrigir extração e retomada com testes antes de publicar, implantar e validar a Embrare em produção.

**Tech Stack:** TypeScript, Vitest, PostgreSQL, BullMQ, Dokploy; roteamento de IA existente.

**Spec:** Solicitação nesta conversa de 14/10/2026: implementar e implantar a correção da seleção de contatos; repetir o teste da Embrare; iniciar o lote das empresas existentes somente se o teste for confiável.

## Global Constraints

- Não remover funcionalidades, histórico, limites, licenciamento, governança ou controles de segurança.
- Não escolher outro modelo ou contratar serviços pagos; usar apenas o roteamento autorizado no Admin.
- Não enviar mensagens, formulários nem aprovar oportunidades no CRM.
- Não fixar regras para uma empresa, cidade ou segmento.
- A autorização TLS existente é restrita ao domínio, pesquisa e prazo registrados; não estender silenciosamente.
- Preservar alterações de outros trabalhos; usar o checkout isolado existente do Radar.

## Review Focus

1. Associação setorial menciona a empresa, mas seus contatos não pertencem à empresa.
2. Dossiê salvo sem HTML não pode reintroduzir contatos de terceiros na retomada.
3. Sem identidade resolvida, canais candidatos continuam pendentes, nunca confirmados por suposição.
4. Perfis oficiais podem publicar contatos úteis; perfis de terceiros e links de compartilhamento não são canais oficiais.
5. Formulário de fornecedores é canal público válido, mas login, newsletter e recrutamento não devem ser confundidos com ele.

---

### Task 1: Isolar canais pela identidade associada

**Files:**
- Modify: `backend/src/modules/radar/research-service.ts`
- Test: `backend/tests/radar-research-service.test.ts`
- Test: `backend/tests/radar-research-persistence.test.ts`
- Test: `backend/tests/integration/radar-research-journey.test.ts`

**Interfaces:**
- Consumes: `runRadarResearchPipeline(identity, configuration, saved, dependencies)`; `currentDossierProjection(output, currentRevision?, dossierRevision?)`.
- Produces: mesmo contrato de dossiê, com contatos da identidade associada, histórico preservado e ausência de promoção indevida de fontes externas.

- [ ] Adicionar testes sintéticos com página de associação que menciona a empresa e domínio oficial confirmado: `expect(result.contacts.some(c => c.sourceUrl.includes('association.example'))).toBe(false)` e `expect(result.pages.some(p => p.url.includes('association.example'))).toBe(true)`.
- [ ] Cobrir retomada com contatos antigos sem HTML, projeção de leitura, isolamento de redes sociais e preservação de canais pendentes quando não existe domínio confirmado.
- [ ] Executar os testes novos e confirmar falha antes de alterar produção.
- [ ] Aplicar a mesma regra de vínculo na coleta de contatos, seleção de perfis, reaproveitamento de canais salvos e projeção de leitura; manter canais de grupo com escopo de grupo e fontes históricas intactas.
- [ ] Executar os testes unitários e a jornada SQL, confirmando que dossiê e projeção de cadastro/CRM não vazam contatos de terceiros.
- [ ] Revisar e criar commit da correção isolada.

### Task 2: Recuperar canais públicos e evitar gasto de profundidade em terceiros

**Files:**
- Modify: `backend/src/modules/radar/contact-evidence.ts`
- Modify: `backend/src/modules/radar/site-evidence.ts`
- Modify: `backend/src/modules/radar/research-service.ts`
- Test: `backend/tests/radar-contact-evidence.test.ts`
- Test: `backend/tests/radar-site-evidence.test.ts`
- Test: `backend/tests/radar-research-service.test.ts`

**Interfaces:**
- Consumes: `extractRadarContacts(page, association?, context?)`, `collectRadarSiteEvidence(url, policy, dependencies)` e páginas/perfis associados da Task 1.
- Produces: canais públicos com URL, finalidade e data de observação, sem inventar e-mail, WhatsApp ou contato atendido; nenhuma submissão de formulário.

- [ ] Investigar o HTML público e os checkpoints autorizados para reproduzir a ausência do formulário/contatos em fixture reduzida; distinguir ausência na fonte de erro de extração.
- [ ] Criar testes que exijam `contact_form` de fornecedores quando realmente publicado, preservem exclusão de login/newsletter/recrutamento e validem links de contato sem texto visível.
- [ ] Criar teste de limite de páginas e redirecionamentos duplicados; o mesmo destino não deve consumir múltiplas vagas e fontes não associadas não devem acionar leitura de perfis de terceiros.
- [ ] Confirmar falhas, corrigir somente os caminhos reproduzidos, preservando limites configurados e leitura pública segura.
- [ ] Executar testes de coleta, contatos, perfis públicos, pesquisa e persistência; revisar e criar commit.

### Task 3: Publicar, implantar e testar a jornada real

**Files:**
- Update: este plano com resultados verificáveis; nenhum segredo ou conteúdo completo de páginas.

**Interfaces:**
- Consumes: correções testadas das Tasks 1–2, branch `main`, campanha existente e serviços normais de autorização/fila.
- Produces: implantação confirmada, teste real da Embrare e decisão explícita sobre lote.

- [ ] Executar `npm test` e `npm run build` em `backend`; executar integração PostgreSQL com configuração local existente, sem chamadas pagas nos testes automatizados.
- [ ] Revisar diff e publicar os commits em `main` sem sobrescrever trabalho alheio; confirmar a versão implantada e saúde dos serviços no Dokploy.
- [ ] Retomar/reavaliar a Embrare por serviços normais, sem repetir buscas concluídas desnecessariamente; solicitar autorização específica se a exceção TLS estiver vencida ou não cobrir a execução.
- [ ] Verificar no painel: site oficial no cadastro, redes oficiais, formulário de fornecedores quando extraível, contatos diretamente evidenciados, ausência de ABERC/Serasa como canais da empresa e limitações verdadeiras.
- [ ] Se houver falha, registrar a causa e não iniciar lote; se o teste passar, executar pesquisa aprofundada das empresas já coletadas, respeitar filas/orçamentos e acompanhar concluídas, parciais e bloqueadas.
- [ ] Entregar status real, versão implantada, contagens do lote quando executado e evidência visual.

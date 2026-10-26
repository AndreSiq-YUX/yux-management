# Radar: municípios locais e configuração segura — Implementation Plan

> **For agentic workers:** usar superpowers:executing-plans, com execução direta conforme autorização e método já escolhidos pelo usuário. Passos em TDD; sem subagentes.

**Goal:** Remover a dependência online que pausou o lote, simplificar cidades e comprovar que ferramentas/custos são exclusivos do Admin YUX.

**Architecture:** Catálogo IBGE gerado como módulo TypeScript somente no backend, índice por UF/nome e erros tipados de preparação. Preservar os adaptadores de transporte, recibos e consentimentos existentes. Frontend mantém payload canônico de cidades e role gate global; não cria novo fluxo.

**Tech Stack:** TypeScript, Node, React, Vitest, PostgreSQL isolado, Playwright disponível no projeto.

**Spec:** `docs/superpowers/specs/2026-10-26-radar-municipalities-client-ux.md`.

## Global Constraints

- Sem consultas pagas, alteração de orçamento/cota, reclassificação de legado incerto ou retomada automática de produção.
- Só `yux_admin` recebe ferramentas/modelos/custos; preservar quatro papéis e isolamento entre organizações.
- Manter todas as funcionalidades, dados e filtros; sem dependências novas ou desativação de TLS.
- Base `80526f03bf4a6cb13e222e7c8f5bb40faf6551da`; preservar os dois documentos não rastreados do experimento e trabalho de outras frentes.

## Review Focus

- Cidade homônima/acentuada/UF não selecionada: Task 1 e 2 testam correspondência e ambiguidade sem ampliar região.
- Timeout após envio não é falha grátis: Task 1 e 3 distinguem os dois casos.
- Reserva liberada duas vezes/concorrência: Task 3 usa Postgres real e entrega repetida.
- Trocar UF ou abrir rascunho não deve reassociar cidades antigas em silêncio: Task 2 testa payload/correção explícita.
- Conta-admin/operador não são Admin YUX: Task 2/3 verificam renderização e HTTP direto.

### Task 1: Catálogo local e preparação cadastral sem rede auxiliar

**Files:** criar `backend/scripts/update-radar-municipalities.mjs`, `backend/src/modules/radar/municipalities.ts`, `backend/src/modules/radar/data/municipalities.generated.ts`, `backend/tests/radar-municipalities.test.ts`; modificar `cnpjaClient.ts` e `backend/tests/radar-cnpja-client.test.ts`.

**Interfaces:** `resolveRadarMunicipalityCode(city:string,state?:string):number`; `CnpjaPreparationError` com `billingOutcome:'not_billed'`, `requestStarted:false` e mensagem-código segura. HTTP e falhas depois do envio não recebem essa prova.

- [x] Escrever testes: Bauru/SP→3506003, Marília/SP→3529005 sem acento; homônimos por UF; cidade inválida rejeita sem transporte; continuação não resolve cidade novamente; timeout do fornecedor continua incerto. Observar RED.
- [x] Implementar gerador com validação fail-closed e catálogo completo oficial; resolver pelo índice local e integrar ao cliente. Invalidar preparação antes de enviar qualquer credencial/request. Ajustar testes antigos cuja expectativa era a consulta auxiliar.
- [x] Executar testes focados, suite backend e build, comparar resultados e commitar o entregável.

### Task 2: Cidades e separação visual da configuração interna

**Files:** modificar `frontend/src/lib/radar/radarSearchConfiguration.ts`, `frontend/src/components/radar/RadarCampaignConfigurationForm.tsx`; testes de helper, formulário e Workspace.

**Interfaces:** `parseRadarCities(value:string,selectedStates:string[])` conserva retorno `{city,state}[]`; formatador de cidades existentes respeita UF única. `canConfigureProviders` continua vinculado apenas a `context.role.key==='yux_admin'` no Workspace.

- [x] Testar UF única com nomes simples, várias UFs com sufixos, estado não selecionado, mudança de seleção e submit real; controles/custos ausentes com flag administrativa falsa e presentes somente após abrir seção Admin quando verdadeira. Observar RED das melhorias.
- [x] Implementar herança segura de UF, labels/ajuda dinâmicos e seções técnicas recolhidas; preservar edição administrativa e padrão YUX.
- [x] Executar suite frontend, type-check/build; verificar renderização/submit em navegador local sem rede paga. Commit do entregável.

### Task 3: Cobrança, retomada e confidencialidade ponta a ponta

**Files:** `backend/src/modules/radar/adaptive-capture.ts`, `capture-discovery.ts` e adaptador legado apenas onde necessário; `backend/tests/integration/radar-adaptive-capture.test.ts`, `radar-commercial-audience.test.ts`; mensagens comerciais/admin existentes se necessário.

**Interfaces:** prova `billingOutcome:'not_billed'` libera custo/cota uma vez, mantendo histórico. `radarAdaptiveContinuations` e `authorizeRadarAdaptiveContinuations` continuam exigindo confirmação fresca para legado incerto; nenhum restart automático.

- [x] Reproduzir falha local tipada: página rejeitada com código específico, reserva de cota/custo liberada uma vez; timeout real mantém incerteza. Testar consentimento da mesma operação de 40 e isolamento HTTP dos quatro perfis. Observar RED onde houver defeito.
- [x] Implementar somente os pontos que os testes demonstrarem incorretos; conservar campos originais e impedir repetição de efeitos pagos.
- [x] Suites completas e builds; testes Postgres isolado; revisão inteira do diff em passe separado, sem subagentes conforme preferência do usuário. Registrar limites da prova local.
- [ ] Publicar a correção na main após testes, conforme autorização atual; verificar commit remoto/deploy se acessível. Não executar pesquisa paga ou apagar legado incerto como parte da publicação.

## Self-review

As três tarefas compartilham apenas o erro tipado de preparação (Task 1→3); a herança de UF é frontend, sem relaxar o schema backend. O catálogo não vai ao bundle cliente. Configurações técnicas já estavam role-gated: o objetivo não é afirmar vazamento inexistente, mas separar visualmente e provar as fronteiras. O orçamento removido não é reintroduzido. Esta especificação detalha o escopo que o usuário acabou de autorizar; não reinicia a fase de aprovação do mesmo desenho.

## Evidência de execução — 26/10/2026

- Catálogo oficial: 5.571 municípios/27 UFs, gerado e validado fora do fluxo pago; a consulta de descoberta usa o código local.
- Backend: 1.540 testes aprovados/126 opcionais ignorados; frontend: 1.237 aprovados; builds e orçamento de bundle aprovados.
- Postgres local descartável: 51 testes de integração aprovados, incluindo HTTP com quatro perfis, isolamento de organizações, falha antes do envio, resposta salva, timeout após envio e retomada explícita da mesma operação de 40.
- Revisão do autor em passe separado, sem revisão independente/subagentes conforme preferência do usuário. Identificou janela entre registro da rejeição e liberação da reserva: teste com falha real de escrita reproduziu o problema, depois passou com ambas as escritas na mesma transação. Nenhuma chamada de rede fica nessa transação.
- Playwright com Chrome local (Browser plugin not available: skill de Browser ausente): salvamento HTTP e recarga reais, desktop e celular, quatro perfis, sem erro JavaScript ou rolagem horizontal. Dados e serviços de teste isolados; nenhuma chamada paga ou mudança de limite de produção.
- O teste local de retomada preserva o recibo incerto original. Não autoriza nem executa uma nova tentativa paga no lote real; essa confirmação permanece no fluxo existente.

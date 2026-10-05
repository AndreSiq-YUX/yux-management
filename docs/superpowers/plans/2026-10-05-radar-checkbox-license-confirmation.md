# Confirmação das permissões do Radar por checkbox

**Objetivo:** a confirmação do administrador deve ser suficiente para salvar as permissões CNPJá/Brave, sem exigir referência textual de contrato ou reenviar uma credencial já cadastrada.

**Escopo:** não ativar fontes, aprovar custos, trocar chaves ou executar consultas pagas. Preservar confirmação explícita, autenticação e demais controles operacionais.

## Implementação e verificação

- [x] Adicionar regressões em `frontend/src/components/platform/admin/ProviderConnectionEditor.test.tsx`, `backend/tests/radar-licensed-brave.test.ts` e `backend/tests/radar-b2b-delivery.test.ts`: confirmações sem referência, credencial preservada, recusa sem confirmação e compatibilidade com referências antigas.
- [x] Remover campos/validações de referência no `ProviderConnectionEditor.tsx`; manter as flags derivadas dos checkboxes e a chave já cadastrada.
- [x] Remover exigência textual em `backend/src/modules/radar/licensed-brave.ts` e `backend/src/modules/radar/b2b-delivery.ts`, sem remover as confirmações explícitas.
- [x] Executar testes, builds e verificação da interface isolada, sem consultar provedores reais.
- [x] Revisar o diff e preparar a publicação em `main` conforme autorização vigente; produção exige deploy.

## Evidências locais

- Backend: 790 testes aprovados; frontend: 609 testes aprovados. A primeira execução geral concorrente teve três timeouts; a reexecução do backend com quatro workers e timeout de 15 segundos passou integralmente.
- Builds de backend e frontend aprovados; lint sem regressão frente ao baseline existente (558 erros/26 avisos contra 560/27).
- Interface real do editor validada em harness local por Playwright/Chrome, desktop 1280×960 e mobile 390×844: marcar → salvar → sucesso sem referência/API key; desmarcar → revogação. Sem erros de console e sem consultas a provedores.
- Browser plugin not available; usado Playwright já instalado com Chrome disponível, sem instalar dependências. Harness e screenshots temporários ficam fora do repositório. A validação isolada não equivale a deploy em produção.

**Critério de aceite:** marcar a permissão e salvar funciona sem preencher contrato/referência ou API key; desmarcar continua revogando a permissão correspondente.

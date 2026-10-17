# Radar: retomada após consulta rejeitada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a paginação, permitir retomada segura após rejeição comprovada e explicar o bloqueio sem perder empresas ou repetir consultas incertas.

**Architecture:** O adaptador envia somente o token na continuação e preserva todos os registros da página. A tentativa fica vinculada ao lote no recibo; rejeições HTTP de validação são persistidas antes de liberar a pendência. A recuperação de tentativas antigas exige evidência inequívoca e ocorre somente na retomada explícita.

**Tech Stack:** TypeScript, PostgreSQL, React, Vitest.

**Spec:** Pedido “corrija”, após diagnóstico da campanha: rejeição `request validation failed`, lote de 20 sem novas empresas, 40 resultados anteriores preservados.

## Global Constraints

- Sem consultas pagas, alterações de limites, credenciais ou deploy.
- Preservar empresas, cursores, auditoria, contadores e recibos existentes.
- Somente `yux_admin` recebe diagnósticos e ferramentas internas; clientes recebem DTO comercial.
- Timeout, resposta perdida e falha de persistência continuam bloqueados contra repetição automática.

## Review Focus

- Continuação de página com quantidade restante menor que a página: preservar excedentes para admissão/overflow.
- Rejeição conhecida versus resposta perdida: somente rejeição comprovada libera a pendência.
- Lote antigo sem vínculo explícito: recuperar apenas uma única tentativa de validação rejeitada, sem resultados ou ambiguidade.
- Retomadas concorrentes: manter bloqueio de campanha/lote e idempotência por requestId.
- Contas e revisões distintas: nunca associar recibos de outro escopo.

### Task 1: Paginação e identificação de rejeição

**Files:** `backend/src/modules/radar/cnpjaClient.ts`, `backend/tests/radar-cnpja-client.test.ts`.

**Interfaces:** `searchCnpjaAdvancedPage(input)` mantém retorno; erro tipado distingue rejeição HTTP 400/422 de falha incerta.

- [x] Escrever testes: token sem limit/filtros; primeira página preserva limit/filtros; continuação não trunca registros; rejeição tipada versus rede.
- [x] Executar os testes e comprovar falha antes da correção.
- [x] Corrigir construção da URL, preservação da página e classificação do erro.
- [x] Executar testes e compilação.

### Task 2: Recibo e recuperação segura

**Files:** `backend/src/modules/radar/repository.ts`, `backend/src/modules/radar/capture-dispatch.ts`, novo `backend/src/modules/radar/capture-recovery.ts`; testes de descoberta/retomada com PostgreSQL isolado.

**Interfaces:** `recoverRejectedRadarCaptureDiscovery(client, operation)` retorna boolean; exige transação e bloqueios da campanha e operação.

- [x] Testar rejeição conhecida, timeout, falha de gravação, tentativa antiga inequívoca, tentativa ambígua e isolamento.
- [x] Executar testes e comprovar falha.
- [x] Vincular tentativa ao lote; persistir rejeição e liberar pendência atomicamente, sem apagar consumo ou cursor.
- [x] Na retomada explícita, recuperar recibo comprovado; manter falhas incertas bloqueadas.
- [x] Executar testes reais de PostgreSQL, incluindo retomada repetida/concomitante.

### Task 3: Mensagens e entrega

**Files:** `frontend/src/lib/radar/radarResearchMessages.ts`, respectivos testes e testes de `RadarCaptureProgress`.

**Interfaces:** `radarResearchMessage(code)` mantém assinatura e não altera a projeção comercial.

- [x] Testar mensagens distintas para rejeição, resposta incerta e indisponibilidade.
- [x] Corrigir textos sem nomes de provedores nos novos avisos.
- [x] Rodar suítes de regressão e builds; validar renderização com dados simulados, sem serviços pagos.
- [x] Revisar diff, registrar resultados neste plano e publicar em `main` sem deploy.

## Validação da implementação

- TDD: regressões reproduzidas antes das correções (paginação, rejeição/recuperação, lease concorrente e mensagens).
- Adaptador: 12 testes aprovados. PostgreSQL isolado: 35 testes de captura aprovados, incluindo 16 cenários de recuperação.
- Validação final após integrar as atualizações de `main` e corrigir o achado da revisão: backend 1.118 aprovados, nenhum ignorado, com PostgreSQL local explícito; frontend 721 aprovados.
- Compilação backend e build/budget frontend aprovados.
- Chrome conectado, ambiente local `127.0.0.1:4174`/API `4182`: criar lote de uma empresa → rejeição HTTP 422 simulada → mensagem específica → Retomar → mesma operação, uma retomada, duas tentativas → descoberta/aprofundamento → parcial sem bloqueios por ausência deliberada de IA real no fixture. Recarregamento preservou resultado e empresa anterior. Sem erro de aplicação ou overlay; somente avisos preexistentes de migração do React Router. Viewport desktop, sem validação móvel específica.
- Jornada repetível: `YUX_RADAR_QA_REJECT_DISCOVERY=true` no servidor local `backend/tests/journeys/start-radar-capture-server.ts`; comportamento padrão do fixture permanece inalterado.
- Nenhuma chamada externa paga, alteração de limites/credenciais ou implantação em produção.
- Revisão independente encontrou uma janela de interrupção entre gravar rejeição e bloquear o lote. Regressão reproduzida e corrigida: pausa, motivo e recibo agora são persistidos atomicamente; redelivery não refaz a descoberta antes da retomada explícita. Nenhum achado crítico ou menor pendente.
- Atualizações pré-existentes de `main` (`0a665d1`) foram preservadas por merge sem conflitos, com novas suítes/builds aprovados no conjunto integrado.

## Investigação complementar — rejeição em 17/10 às 18:37:53

O histórico enviado pelo usuário confirma uma nova rejeição após a implantação. Isso não é apenas o aviso antigo ou ausência de clique. A causa específica da rejeição em produção ainda não foi determinada: o adaptador descartava `constraints`, campo oficial dos erros CNPJá que contém as razões de validação.

Correção complementar restrita ao diagnóstico: preservar mensagens/constraints textuais e o status HTTP, removendo chave de API e token antes de limitar o tamanho da mensagem. Não serializar corpo bruto, cabeçalhos, objetos desconhecidos ou valores aninhados. O texto usa o histórico técnico já exclusivo do Admin; projeções comerciais e permissões permanecem inalteradas. A leitura de consulta CNPJ usada no teste de credenciais recebe o mesmo tratamento seguro.

Referência primária: [exceção do SDK oficial](https://github.com/cnpja/sdk-nodejs/blob/master/source/cnpja/cnpja.exception.ts) e [tratamento HTTP/paginação](https://github.com/cnpja/sdk-nodejs/blob/master/source/http/http.service.ts). A continuação apenas com token está de acordo com esse SDK; não reiniciar nem descartar o cursor sem confirmar o motivo real.

TDD: três regressões falharam antes do ajuste e passaram depois. Adaptador 15/15; três suítes direcionadas 41/41; suíte completa backend com PostgreSQL isolado 1.121/1.121, compilação aprovada. Nenhum frontend foi modificado. Sem chamadas pagas, mudanças de limites ou deploy. O problema operacional da captação continua pendente de obter a mensagem detalhada de uma execução com esse ajuste; registros antigos não permitem recuperar detalhes já descartados.

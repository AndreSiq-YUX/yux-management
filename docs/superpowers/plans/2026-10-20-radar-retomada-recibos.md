# Radar: recuperação efetiva do lote pausado

> Execução nativa e sequencial, preservando o método já escolhido. Usar executing-plans e TDD. Revisão final própria conforme a restrição de execução sequencial vigente; registrar essa limitação. Não redesenhar o Radar nem adicionar SDK/framework.

**Goal:** a autorização explícita do Admin deve produzir retomadas duráveis por empresa, com resultado individual observável, sem repetir recibos antigos ou deixar uma falha impedir todo o lote.

**Architecture:** manter a pesquisa e seus recibos. Unir autorização e registro da retomada numa transação curta por análise, com recuperação de autorização válida existente; usar o outbox atual. Respostas realmente cortadas não são completadas por adivinhação. A geração usa o limite já aprovado na rota, com resposta compacta; falha comprovada antes do provedor não vira cobrança incerta.

**Stack:** Fastify/TypeScript, PostgreSQL/RLS, runtime Python, React.

**Spec:** pedido do usuário e prints de 20/10: lote de 20, uma concluída, 12 insuficientes, sete bloqueadas; dois recibos recebidos/cortados e outros sem resposta; confirmação de nova tentativa falha com mensagem genérica. Regras permanentes de AGENTS.md e recuperação da especificação de 19/10 continuam vinculantes.

## Constraints e riscos

- Somente Admin global acessa recibos/modelos/custos. Validar tenant, campanha, revisão, candidato e recibo antes de qualquer mutação.
- Nenhuma chamada paga de desenvolvimento, troca de modelo, aumento de limites ou licença. Clique de retomada não transforma cobrança incerta em falha gratuita.
- Preservar recibos, empresas, coleta, histórico, v1 e orçamento. Não marcar como concluído um resultado sem evidência.
- A autorização exige reconhecimento explícito de possível cobrança anterior. Usar os modelos e limites configurados, nunca aumentá-los automaticamente.
- Navegador do usuário não tem Browser plugin disponível nesta sessão; validar a interface local com Playwright. Produção depende de acesso verificável, não de contornar a interrupção de segurança da navegação.

## Review focus

1. Queda entre aprovação e fila/reload: reutilizar autorização vigente e um pedido determinístico; transação parcial não deixa aprovação órfã.
2. Mistura de recibos inválidos, incertos, antigos e outra conta: escopo inválido falha antes de alterações; erro de uma empresa tem motivo e não bloqueia as válidas.
3. Mudança de rota após aprovação: autorização antiga não é consumida; novo aceite permite nova autorização na política atual, sem apagar a anterior.
4. Retorno cortado e falha antes de transporte: só JSON integral validado é recuperável; nenhum conserto de texto ou replay automático incerto.
5. Pedido aceito sem progresso visível: mostrar fila/execução/espera/finalização, atualizar acompanhamento e testar o worker real com banco isolado.

## Task 1 — Retomada administrativa durável

Files: analysis-retry-authorizations.ts, research-requests.ts, administrative-research.ts, routes.ts; integração radar-administrative-research.test.ts.

- [x] Testes RED: aprovação e pedido na mesma transação por item; falha de registro desfaz aprovação; reload reusa autorização e pedido; mudança de política exige nova autorização; sete itens mistos não param todos; quatro papéis/conta incorreta não mutam. Teste adicional confirma duas abas concorrentes gerando apenas uma autorização e um pedido por análise.
- [x] Implementar endpoint administrativo de retomada retornando resultado por recibo e IDs duráveis. Reutilizar funções existentes com transação recebida, sem rede sob lock. Outbox permanece responsável por despacho.
- [x] Testar pedido → worker → resposta salva → resumo do lote com transporte simulado e permissões reais.

## Task 2 — Resposta compacta e classificação correta

Files: runtime radar_qualification.py, radar_presence.py, radar_receipts.py; testes runtime correspondentes.

- [x] RED: limite da rota maior que o teto interno antigo é respeitado; resposta compacta sem inventar fatos; JSON integral validado continua recuperável mesmo com marcador de limite; JSON cortado continua inválido.
- [x] RED: falha comprovada antes do transporte termina rejected_before_provider, timeout enviado permanece uncertain e não é repetido.
- [x] Implementar mínimo, mantendo seleção de modelos/fallbacks e limites no Admin. Rodar toda a suíte runtime.

## Task 3 — Feedback e verificação completa

Files: RadarResearchOperationsPanel.tsx, radarService.ts, radarResearch.ts; testes do painel e jornadas locais.

- [x] RED: uma chamada administrativa registra autorização+retomada; estados e motivos por empresa visíveis; polling limitado enquanto há pedidos ativos; seleção antiga não bloqueia análises elegíveis.
- [x] Implementar mensagens úteis ao Admin, sem vazar dados técnicos ao cliente. Preservar ação gratuita de revalidação e confirmação explícita de custo.
- [x] Rodar suítes backend/frontend/runtime, PostgreSQL, tipos/build, interface local desktop/mobile.
- [ ] Publicar correção em main no escopo já autorizado e conferir autodeploy somente por acesso permitido. Não declarar lote real concluído sem observar isso.

Pre-flight: Task1 produz resposta por recibo/pedido consumida por Task3; Task2 não muda formato comercial e conserva recibos usados por Task1. Critérios de qualidade continuam independentes de andamento de fila. Benchmark, modelos e descoberta v2 novos não fazem parte desta correção.

## Evidências e revisão — 20/10/2026

- Causa reproduzida: a API real (`yux_api`) só lê os recibos protegidos, mas a autorização fazia `SELECT ... FOR UPDATE`, exigindo UPDATE e falhando por permissão. Removido o bloqueio indevido, sem conceder UPDATE; aprovação serializada pela campanha e consumo protegido pela função privada existente do runtime, que revalida recibo, escopo, política e execução antes da chamada.
- Aprovação e pedido durável agora são atômicos por análise. Recarga reutiliza os IDs já registrados; uma etapa desativada não cancela as demais. Nenhum recibo antigo é apagado ou transformado artificialmente em sucesso.
- Oito novos testes PostgreSQL: lote misto; falha com rollback por empresa; reuso após recarga e em duas abas concorrentes; troca de política; tenant e quatro papéis; HTTP com API restrita; worker restrito atualizando o lote original sem descoberta/replay. Suíte PostgreSQL Radar: **115 aprovados** antes do teste adicional de concorrência; arquivo final de retomada **8/8** e compilação aprovados.
- Backend geral: **1.288 aprovados**, 126 testes opt-in ignorados nesta execução (115 Radar exercitados separadamente com PostgreSQL). Compilação TypeScript aprovada.
- Runtime: **368 aprovados**, sete opcionais ignorados. Limite configurado respeitado; resposta compacta; JSON cortado continua rejeitado; JSON integral só recuperado após todas as validações; falha comprovada antes do transporte não vira cobrança incerta.
- Frontend final: **1.170 aprovados**, compilação e orçamento de bundle aprovados. Lint permanece dentro do baseline existente (547 erros/25 avisos, limite legado 560/27); não equivale a lint sem problemas.
- Navegador local: duas jornadas aprovadas, desktop 1.280px e celular 430px; consentimento explícito, registro visível e motivo individual de rota ausente. O navegador identificou um novo problema de carregamento sob StrictMode; regressão RED→GREEN adicionada (nove testes focados).
- Revisão própria e sequencial: permissões, transações, idempotência, escopo, outbox, limites autorizados, dados comerciais e renderização. Não houve revisão independente por subagente.
- O navegador do usuário voltou a ficar acessível durante a verificação final. Antes da publicação, Dokploy e Radar ainda mostravam a revisão 261b08a e as pendências anteriores. Publicação e confirmação da nova implantação ainda pendentes neste registro. Nenhuma chamada paga de desenvolvimento foi executada. Usuário autorizou explicitamente retomar as análises reais bloqueadas após o deploy com modelos/limites atuais, sem repetir descoberta nem ampliar orçamento. Resultado em produção será comunicado após observação, separadamente dos testes locais.

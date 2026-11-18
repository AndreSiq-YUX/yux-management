
# Piloto de agentes do YUX Hub

Base avaliada no plano, revisão 020308a de origin/main. A implantação local está na branch codex/agentes-yux-piloto. A configuração de execução do estrategista começa desativada por subconta.

## Operação em homologação

1. Abra **Admin → IA/LLM → Agentes e prompts**. Escolha o fluxo, a subconta e o contrato quando aplicável. Use uma mensagem sintética para o estrategista ou a conversa de missão. Para o supervisor, selecione uma missão existente nesse escopo e inspecione a primeira requisição de planejamento.
2. Expanda uma etapa para conferir modelo, contingências, mensagens, fontes e impressão digital. A comparação usa o adaptador do runtime com transporte simulado. A recuperação é lexical e resolve as permissões atuais da conta. As sínteses que dependem de especialistas recebem resultados simulados.
3. No estrategista, o comercial aprova para o piloto os modelos ativos do CRM que representam ofertas vendáveis. Cada oferta exige uma regra de preço base. O pacote técnico Crescimento YUX fica fora da seleção.
4. Para registrar a instrução candidata da síntese, informe a justificativa e publique para a subconta selecionada. O servidor repete a simulação e salva as impressões digitais das etapas. A lista de versões guarda autoria, data, operação e justificativa. Em caso de edições simultâneas, a segunda publicação precisa ser feita sobre a versão atualizada.
5. Após os aceites do plano, a configuração `STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS` no serviço de API permite ativar o estrategista somente para subcontas aprovadas. A primeira execução usa a publicação mais recente. Uma análise enfileirada mantém a instrução capturada e revalida o contrato, a oportunidade e o catálogo quando processada.
6. No chat do estrategista, inicie uma análise com a subconta e a oportunidade do CRM. Informe o orçamento e peça a recomendação em outro turno. O contexto recupera até oito mensagens anteriores do usuário, além do diagnóstico salvo. Uma recomendação pode ficar pendente por dados insuficientes.
7. Na ficha comercial do lead, revise a recomendação e use **Aprovar recomendação e criar rascunho**. Os itens e valores vêm das regras atuais do CRM da subconta comercial. Confirme que os modelos vendáveis e preços foram cadastrados nessa subconta. Uma mesma recomendação gera um rascunho. Catálogo alterado exige uma nova análise. O envio segue o fluxo de revisão da proposta.
8. Para reverter, restaure a configuração herdada ou uma versão anterior a partir do histórico. Retire a subconta da lista de ativação para voltar ao fluxo herdado nas novas análises. As propostas e o histórico de instruções mantêm sua origem.

## Contas e fontes a validar

| Piloto | Referência disponível | Evidência operacional pendente |
|---|---|---|
| Villeman e Massas | Auditoria histórica de 14/10/2026 registrou a organização `972e8163-81b7-4e3f-b964-777110b660b8` e o contrato `6675ead3-946c-4312-91b0-b482bbcd27e2`. [Diagnóstico do Radar](../superpowers/plans/2026-10-14-radar-creditos-diagnostico-retomada.md) | Confirmar contrato e estado atual. O representante revisa estratégia, portfólio, regiões, logística e materiais externos. Operações confirma os canais e capacidades disponíveis. |
| YUX Captação | Auditoria histórica registrou recuperação autorizada de conhecimento compartilhado. [Runbook do Radar](radar-action-engine-rollout.md) | Confirmar a subconta e o contrato usados na homologação. O comercial aprova as ofertas e seleciona a oportunidade. Operações confirma integrações e prontidão para missões de captação. |

A revisão de portfólio deve validar a contraprova entre contratos e subcontas. Com o contrato ausente, a conversa e o planejamento consideram o portfólio de produtos dependente de seleção de contrato. A metodologia, a estratégia publicada e a disponibilidade dos executores continuam usando as projeções e regras existentes.

## Evidências e limites da entrega local

- A comparação de versões cobre estrategista, diagnóstico e proposta. Também há prévia da conversa de missão e da primeira chamada do supervisor. A prévia do supervisor usa os dados atuais e o mesmo adaptador do planejamento, com transporte simulado. O identificador do snapshot é atribuído somente na execução real. As etapas condicionais dos especialistas ainda precisam de cenários próprios de inspeção.
- A síntese aceita análises completas e estruturas de fatos, restrições, alternativas e evidências. A inspeção compara a requisição efetiva em um caso congelado, antes do transporte. Fontes recuperadas para o perfil principal ficam naquele perfil. Especialistas de outros perfis usam os dados comerciais autorizados para análise.
- A integração local com PostgreSQL e geração simulada cobre publicação por conta, bloqueio de contrato fora de escopo, troca de conta na conversa, histórico de orçamento, reversão, duplo clique e mudança de preço.
- A estimativa comercial do workflow usa a especificação efetiva. No planejamento, uma reserva já liquidada retorna o registro consolidado em reprocessamentos. As medições de geração ficam no histórico interno de planejamento. Enquanto o custo em reais estiver pendente de conciliação, o orçamento mantém a estimativa reservada. Ainda faltam conciliação de créditos comerciais, tratamento de tentativas sem recibo, teto econômico validado, avaliação cega paga e observação comercial dos dois pilotos.
- O aceite permanece separado por subconta, fluxo e público. A preparação das fontes reais, a avaliação paga sob autorização explícita e as ondas de migração A8 e A9 seguem os critérios do plano original.

Para reproduzir a integração, aplique as migrações num banco local dedicado `yux_agent_pilot_test`, com os papéis de serviço do projeto. Execute `npm run test:integration -- strategy-agent-pilot` no backend com `YUX_AGENT_PILOT_TEST_DATABASE_URL` apontando para esse banco. Os testes `test_presales_instruction_preview.py`, `test_mission_supervisor.py` e `test_customer_context.py` exercitam a composição e a recuperação do runtime sem geração externa.

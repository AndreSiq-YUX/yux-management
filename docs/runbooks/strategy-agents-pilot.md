
# Piloto de agentes do YUX Hub

Base avaliada no plano, revisão 020308a de origin/main. A implantação local está na branch codex/agentes-yux-piloto. A configuração de execução do estrategista começa desativada por subconta.

## Operação em homologação

1. Abra **Admin → IA/LLM → Agentes e prompts**. Escolha o fluxo, a subconta e o contrato quando aplicável. Use uma mensagem sintética para o estrategista ou a conversa de missão. Para o supervisor, selecione uma missão existente nesse escopo e inspecione as requisições do planejamento, incluindo as etapas condicionais.
2. Expanda uma etapa para conferir modelo, contingências, mensagens, fontes e impressão digital. A comparação usa o adaptador do runtime com transporte simulado. A recuperação é lexical e resolve as permissões atuais da conta. As sínteses que dependem de especialistas recebem resultados simulados.
3. No estrategista, o comercial aprova para o piloto os modelos ativos do CRM que representam ofertas vendáveis. Cada oferta exige uma regra de preço base. O pacote técnico Crescimento YUX fica fora da seleção.
4. No estrategista, escolha a tarefa e simule um cenário para carregar as etapas. Selecione um especialista ou a síntese da tarefa e compare o ajuste com a configuração vigente. A opção de instrução-base da síntese continua disponível para toda a pré-venda. Informe a justificativa e publique para a subconta. O servidor repete a simulação, verifica que a etapa participou e guarda as impressões digitais, autoria, data e justificativa. Uma edição simultânea exige recarregar a versão mais recente.
5. Após os aceites do plano, a configuração `STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS` no serviço de API permite ativar o estrategista para subcontas aprovadas. Uma publicação por etapa aplica o ajuste à tarefa selecionada, depois das camadas protegidas e do papel do especialista. Uma análise enfileirada mantém a versão capturada e revalida o contrato, a oportunidade e o catálogo quando processada.
6. No chat do estrategista, inicie uma análise com a subconta e a oportunidade do CRM. Informe o orçamento e peça a recomendação em outro turno. O contexto recupera até oito mensagens anteriores do usuário, além do diagnóstico salvo. Uma recomendação pode ficar pendente por dados insuficientes.
7. Na ficha comercial do lead, revise a recomendação e use **Aprovar recomendação e criar rascunho**. Os itens e valores vêm das regras atuais do CRM da subconta comercial. Confirme que os modelos vendáveis e preços foram cadastrados nessa subconta. Uma mesma recomendação gera um rascunho. Catálogo alterado exige uma nova análise. O envio segue o fluxo de revisão da proposta.
8. Para reverter, restaure a configuração herdada ou uma versão anterior a partir do histórico. A restauração aplica a configuração inteira da subconta. Retire a subconta da lista de ativação para voltar ao fluxo herdado nas novas análises. As propostas e o histórico de instruções mantêm sua origem.

## Ajustes por etapa no Action Engine

Em **Agentes e prompts**, selecione a conversa de missão ou o planejamento. Na conversa, escolha o público. No planejamento, escolha a missão usada como cenário. Simule para listar as etapas editáveis, selecione uma delas e compare a candidata com a configuração vigente. O Admin YUX publica o ajuste com uma justificativa após a simulação da requisição ao provedor.

O histórico da conversa é separado entre usuário do portal e operador interno. O histórico do planejamento é próprio da subconta. A missão e o contrato selecionados fornecem o cenário e as permissões da simulação. O ajuste publicado vale para a etapa da subconta nesse fluxo. Etapas de planejamento do Radar ficam protegidas.

A migração 0267 deve ser aplicada antes da atualização dos serviços. Após os aceites, a configuração `ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS` indica as subcontas aprovadas, em lista separada por vírgula, para a execução no worker e a indicação de status na API. A lista inicia vazia. O turno ou planejamento conserva a versão registrada na primeira execução, inclusive ao reprocessar. Para reverter com operações em andamento, restaure a configuração herdada ou uma versão anterior, mantenha a subconta na lista até concluir os reprocessamentos e retire-a depois, se o piloto for encerrado.

## Regras de fontes dos pilotos

Em **Agentes e prompts**, selecione o fluxo, a subconta e o cenário. Na conversa de missão, selecione também o público. Classifique a metodologia publicada, a estratégia da subconta, os documentos da empresa e o portfólio de produtos. **Obrigatória** exige pelo menos um item autorizado no cenário e impede a geração quando falta contexto. **Opcional** usa os itens disponíveis. **Vedada** exclui a categoria do contexto do agente. Briefings confirmados e mensagens fornecidas pelo usuário são entradas da operação.

Use **Simular regras de fontes** para conferir o que entra na requisição e quais publicações faltam. Informe a justificativa e publique. A versão registrada inclui as regras e as instruções do fluxo. O histórico permite restaurar versões anteriores. O planejamento considera os documentos e a metodologia verificados na conversa vinculada, além da estratégia e do portfólio vigentes. As regras do Radar são protegidas.

Aplique a migração 0269 antes da atualização dos serviços. Atualize o runtime e os serviços do backend antes de liberar publicações no editor. A ativação segue as listas de subcontas do estrategista e do Action Engine. Quando uma nova regra veda uma categoria, a conversa recompõe o contexto a partir das mensagens do usuário e das fontes permitidas.

## Conciliação do estrategista

O chat do Admin mostra o custo em USD informado pelo provedor e os créditos comerciais lançados. O custo inclui recuperação vetorial e tentativas de geração. Quando faltar o custo de alguma tentativa, o total aparece como indisponível. A conciliação de créditos usa as unidades do fluxo, com uma unidade pela síntese e uma por especialista concluído sem falha na verificação.

Aplique a migração 0264 antes de usar a versão faturável do estrategista. Depois do aceite comercial, `STRATEGY_PRESALES_BILLABLE_CONTRACT_IDS` configura os contratos faturáveis no serviço que processa a fila, em lista separada por vírgula. A configuração começa vazia. O servidor valida cliente, subconta e contrato antes de reservar. A seleção explícita de cliente e contrato conserva o enquadramento faturável já usado pelo runtime.

O ID da resposta enfileirada identifica a operação. A reserva usa a especificação efetiva e é registrada antes do primeiro transporte. Uma execução concluída devolve a parcela não usada e gera um lançamento. Se o processamento falhar com uma chamada sem resposta confirmada, a reserva fica pendente de conciliação. Consulte `private.strategy_workflow_credit_holds` pelo ID da operação, com acesso autorizado ao banco, e valide o estado e os recibos antes de regularizar o saldo. Uma operação que já chamou o provedor rejeita reenvio com o mesmo ID. Um processamento interrompido antes da primeira chamada pode reassumir a reserva após cinco minutos com o mesmo ID e a mesma entrada.

## Conciliação da conversa de missão

A migração 0265 acrescenta suporte ao identificador de turno no runtime. O worker usa o ID da mensagem do usuário para os turnos que já eram atribuídos a um cliente e contrato. A política comercial continua de um crédito por resposta válida. A reserva é registrada antes da recuperação e da geração. O débito só é consolidado após a validação da resposta do runtime. O portal mantém o contrato de resposta existente.

Um reenvio com a mesma entrada pode recuperar a resposta concluída sem repetir a chamada ou a cobrança. O servidor confere público, subconta, contrato, conversa e capacidades. O worker revalida as referências antes de salvar a resposta. Um turno concorrente deixa o processamento com o worker que obteve a reserva. Falhas antes da primeira chamada liberam o crédito e permitem retomar o mesmo turno. Falhas com chamada sem resposta confirmada ficam para conciliação, com o custo ausente identificado no registro interno.

Nas subcontas habilitadas para o piloto, a medição cobre também a versão herdada e os turnos sem carteira. Nesses turnos, consulte `agent_context_snapshots` pelo identificador da execução e pelo campo `measurement` com valor `mission_turn_provider_attempts`. A primeira gravação antecede a chamada. Uma tentativa com `status` igual a `started` indica que falta uma resposta confirmada do provedor. A ausência do registro deixa o custo sem medição.

Aplique as migrações antes de iniciar os serviços atualizados em homologação. Deixe concluir os turnos em processamento na versão anterior antes de habilitar a execução do piloto. A prévia administrativa usa o caminho de simulação.

## Revogação de fontes em conversas de missão

A migração 0268 registra, em área privada, as referências que entraram em cada turno de missão. Nos turnos seguintes, o worker confere novamente as versões e as permissões. Se uma fonte perde autorização, o próximo turno recompõe o briefing a partir das mensagens do usuário e das fontes vigentes. A conversa pode então voltar a usar as respostas novas. As mensagens antigas continuam disponíveis para auditoria.

Aplique a migração antes de atualizar os serviços e atualize a API e o worker antes do runtime, para que o contrato aceite as referências privadas de entrada. Para turnos anteriores à migração, a verificação usa as referências que já estavam registradas nas respostas. Na homologação, revogue uma fonte sintética após o primeiro turno e confira o briefing recomposto, a recusa de uma resposta reaproveitada e o bloqueio do planejamento que ainda dependa da versão revogada.

## Contas e fontes a validar

| Piloto | Referência disponível | Evidência operacional pendente |
|---|---|---|
| Villeman e Massas | Auditoria histórica de 14/10/2026 registrou a organização `972e8163-81b7-4e3f-b964-777110b660b8` e o contrato `6675ead3-946c-4312-91b0-b482bbcd27e2`. [Diagnóstico do Radar](../superpowers/plans/2026-10-14-radar-creditos-diagnostico-retomada.md) | Confirmar contrato e estado atual. O representante revisa estratégia, portfólio, regiões, logística e materiais externos. Operações confirma os canais e capacidades disponíveis. |
| YUX Captação | Auditoria histórica registrou recuperação autorizada de conhecimento compartilhado. [Runbook do Radar](radar-action-engine-rollout.md) | Confirmar a subconta e o contrato usados na homologação. O comercial aprova as ofertas e seleciona a oportunidade. Operações confirma integrações e prontidão para missões de captação. |

A revisão deve testar dois contratos ativos na mesma subconta e duas subcontas distintas. Na conversa de missão, a seleção explícita do contrato determina os módulos elegíveis e a disponibilidade do CRM. No estrategista do piloto e na conversa de missão sem contrato selecionado, o contexto mantém a metodologia e a estratégia publicada da subconta e pede um contrato para consultar portfólio e documentos contratuais. A prévia mostra o escopo das fontes recuperadas e as lacunas de cadastro. O link **Gerenciar vínculos da metodologia** abre os controles existentes de publicação e vínculo por perfil, módulo e fluxo.

## Capacidade e prontidão no piloto

Use o [catálogo funcional](../yux-hub-catalogo-funcionalidades-capacidades.md) para descrever as opções. Na homologação, confira o contrato, a disponibilidade das capacidades e o resultado de cada etapa na subconta selecionada.

| Caminho | O que o código permite validar | Prontidão a confirmar na subconta |
|---|---|---|
| Pré-venda → proposta | A recomendação elegível importa para o CRM um rascunho com itens e preços vigentes. | Oportunidade no escopo, oferta aprovada, regra de preço e revisor comercial. |
| Missão → preparação do CRM | O pacote `crm_preparation` em modo Preparar inspeciona o CRM e pode salvar um funil, três modelos de e-mail e uma sequência em rascunho. | Perfil do cliente ideal e oferta confirmados. Contrato com Action Engine, CRM e Automações. A preparação aceita CRM em rascunho e dispensa conexão de envio. |
| Missão → publicação ou contato | Funil e nutrição tratam a publicação como etapa sujeita a aprovação. A evidência de envio só existe após confirmação da execução. | Módulo, executor e canal aptos na conta para o efeito solicitado. Conferir público, consentimento e aprovação antes de qualquer contato. |
| Missão → campanha | O pacote `campaign_launch` prepara a campanha e exige aprovação para ativação. | Contrato com Campanhas, Landing Pages e agente de campanhas. Confirmar oferta, público, conexão de mídia e orçamento permitido. |

## Evidências e limites da entrega local

- A comparação de versões cobre o estrategista, a conversa de missão por público e o planejamento. No planejamento, a prévia mostra o supervisor e os especialistas de funil, preparação do CRM e campanha conforme o pacote selecionado. As requisições usam os mesmos dados e adaptadores da execução, com transporte simulado. Os especialistas dependem de um plano válido e a tela sinaliza os requisitos ausentes e a rota indisponível. O identificador do snapshot é atribuído durante a execução real.
- A síntese aceita análises completas e estruturas de fatos, restrições, alternativas e evidências. A inspeção compara a requisição efetiva em um caso congelado, antes do transporte. Fontes recuperadas para o perfil principal ficam naquele perfil. Especialistas de outros perfis usam os dados comerciais autorizados para análise.
- A integração local com PostgreSQL e geração simulada cobre publicação por conta, bloqueio de contrato fora de escopo, troca de conta na conversa, histórico de orçamento, reversão, duplo clique e mudança de preço. A contraprova de pré-venda registra o adiamento por dados insuficientes e confirma a recusa de importação no CRM. Na representação sintética, o segundo turno muda a área de atuação e a retirada. O planejamento recebe o público revisado e mantém a oferta original.
- No planejamento, uma reserva já liquidada retorna o registro consolidado em reprocessamentos. As medições de geração ficam no histórico interno de planejamento. Enquanto o custo em reais estiver pendente de conciliação, o orçamento mantém a estimativa reservada. A conciliação comercial está exercitada no estrategista e nos turnos de missão faturáveis. Ainda faltam teto econômico validado, avaliação cega paga e observação comercial dos dois pilotos.
- O aceite permanece separado por subconta, fluxo e público. A preparação das fontes reais, a avaliação paga sob autorização explícita e as ondas de migração A8 e A9 seguem os critérios do plano original.

Para reproduzir a integração, aplique as migrações num banco local dedicado `yux_agent_pilot_test`, com os papéis de serviço do projeto. Execute `npm run test:integration -- strategy-agent-pilot` no backend com `YUX_AGENT_PILOT_TEST_DATABASE_URL` apontando para esse banco. Use a mesma variável no teste `test_workflow_credits_postgres.py` após a criação dos dados sintéticos pela integração do backend. Os testes `test_presales_instruction_preview.py`, `test_mission_supervisor.py` e `test_customer_context.py` exercitam a composição e a recuperação do runtime sem geração externa.

## Comparação cega e aceite dos pilotos

O lote reaproveita os 24 casos de Missões, com seus seis reservados, e acrescenta oito cenários sintéticos para cada piloto, com dois reservados em cada um. São 160 respostas previstas para a comparação entre configuração atual e candidata, com duas repetições por caso. Esta amostra tem um orçamento próprio, a definir antes da rodada paga.

No diretório do runtime, prepare o lote e confira a identidade das versões antes de capturar as respostas.

```powershell
python scripts/compare_agent_pilots.py template --output .\pilot-capture.json
python scripts/compare_agent_pilots.py attach-attempts --capture .\pilot-capture.json --runtime-receipts .\pilot-receipts.json --output .\pilot-metered.json
python scripts/compare_agent_pilots.py blind --capture .\pilot-metered.json --output .\pilot-blind.json
python scripts/compare_agent_pilots.py score --capture .\pilot-metered.json --review-a .\review-a.jsonl --review-b .\review-b.jsonl --output .\pilot-result.json
```

- Preencha a captura com as requisições e respostas das duas versões no ambiente aprovado. Registre em cada linha o identificador da execução em `traceId`, as impressões digitais das configurações por caminho, o contexto congelado, o modelo efetivo, as fontes autorizadas com suas versões e as referências recuperadas e citadas. Use `reviewContext` para fatos liberados aos avaliadores e `reviewExcerpt` para trechos de evidência com a mesma liberação. Quando o trecho não puder ser incluído, valide a referência no acervo com acesso autorizado. O comparador exige as mesmas entradas, fontes autorizadas e o mesmo modelo dentro de cada caso.
- O registro interno `agent_context_snapshots` permite conferir etapa, versão, modelo efetivo e impressão digital da requisição pelo identificador da execução. Nas missões do piloto, o registro também guarda a versão e a impressão digital das fontes recuperadas. Consulte os dados com acesso autorizado à subconta e ao contrato da rodada.
- Para importar tentativas, monte `pilot-receipts.json` como um objeto cujas chaves são os `traceId` da captura. Cada valor é uma lista de tentativas do runtime. Na pré-venda, consulte `generationUsage.providerAttempts` e o `runId` do estrategista. Nos turnos faturáveis de missão, consulte `attempts` na reserva privada vinculada ao `agent_run_id`. Nos demais turnos do piloto, consulte `attempts` no registro `mission_turn_provider_attempts`. Inclua falhas e contingências da mesma execução. Acrescente `costBrl` como texto decimal quando houver conciliação em reais. Use `null` para medição ausente e lista vazia quando o registro confirmar que nenhuma chamada ocorreu. O comparador confere os modelos das tentativas com a autorização. Em `outcome`, registre o aceite, o aceite na primeira revisão e a correção de preço ou escopo quando observados.
- Entregue o pacote cego a dois avaliadores distintos. Use a [rubrica](../../workers/marketing-studio-agent-runtime/evals/strategic-quality/rubric.md) para notas e justificativas. No lugar de `validReferences`, registre em `validCitationIndexes` as posições das citações verificadas na lista `citations`, começando em zero. Além dos seis critérios binários da rubrica, registre `commercialIntegrity`, `externalAudience` e `executionTruth` em `gates`. Uma diferença superior a um ponto em qualquer dimensão exige desempate documentado via `--adjudications`.
- Para a rodada paga, registre a autorização explícita, as combinações de serviço e modelo aprovadas e o teto em `authorization.approvalReference`, `authorization.routes` e `authorization.ceilingBrl`. A medição de qualidade usa a procedência `live` somente quando a geração e as revisões ocorreram. O comparador opera em arquivos locais e preserva o estado `not_evaluated` para capturas simuladas.
- Confira os três grupos separadamente. O relatório mantém o custo por diagnóstico aceito, proposta aprovada e missão aprovada pendente quando faltam medições ou aprovações. O comando de pontuação encerra com código 2 se a comparação ou o teto do lote não estiverem comprovados. A decisão de ativar exige também os aceites comercial e técnico e a observação supervisionada de cada piloto.

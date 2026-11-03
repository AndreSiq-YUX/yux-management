# Prioridade comercial configurável no CRM

## Objetivo e escopo

A equipe comercial deve conseguir distinguir o potencial de uma conta, a temperatura da negociação e a ordem em que vale trabalhar as oportunidades. A configuração pertence à instância de CRM e pode aplicar critérios a um tipo de lead. O perfil, o histórico e as permissões do CRM continuam sendo as fontes para avaliação.

A entrega abrange modelo de regras determinístico, configuração com prévia e publicação, sinais comerciais, recálculo por tempo, filas, explicação e criação opcional de tarefa interna. A configuração de Villeman e Massas será uma implantação posterior, com os próprios campos, pesos e faixas. O código e as migrations da plataforma não devem incluir marcas, segmentos, valores comerciais ou faixas daquela operação. Respostas automáticas de e-mail, análise semântica de mensagens, pontuações simultâneas por produto e treinamento com dados de vendas ficam fora desta entrega.

## Como calcular

### Potencial

- Um grupo de potencial representa um critério e tem um teto em pontos. Pode ter várias regras ordenadas que representam maneiras alternativas de medir o mesmo critério.
- Cada regra usa uma condição ou faixas numéricas sobre um campo do catálogo de pontuação. Reutilizar comparadores, tipos e validação de faixas existentes. Ampliar o catálogo para cidade e UF. Acesso a novos campos comerciais depende de projeção explícita e testes de audiência.
- Aplicar a primeira alternativa com valor conhecido e aplicável. Zero e falso são conhecidos. Um valor conhecido que satisfaz a regra com zero pontos impede o uso da alternativa seguinte. Intervalos usam mínimo inclusivo e máximo exclusivo. Campo ausente, arquivado, de outro tipo ou inválido para a regra é desconhecido.
- Somar os pontos dos grupos avaliados e dividir pelo total dos tetos desses grupos, em escala de 0 a 100. Arredondar uma vez. Com nenhum grupo avaliado, retornar potencial nulo. A cobertura é a soma dos tetos avaliados dividida pela soma dos tetos dos grupos aplicáveis. Regras e grupos de outro tipo ficam fora do denominador.
- O editor permite sinalizar uma alternativa como estimativa. A explicação informa o que foi usado e o que falta. Cobertura mede disponibilidade, enquanto a indicação de estimativa descreve a origem da nota. A primeira entrega usa essa indicação na configuração da regra e não certifica a veracidade de cada valor importado.

### Temperatura

- Usar ocorrências estruturadas com tipo, data real, canal, autor e vínculo comercial estável. Tipos iniciais de plataforma: `buyer_reply`, `quote_requested`, `meeting_booked`, `meeting_completed`, `purchase_window`, `not_interested`. Resposta vinculada de WhatsApp vem do evento existente. As demais ocorrências podem ser registradas pela equipe, com base na interação. `purchase_window` registra uma data prevista e usa faixas configuráveis de dias até a compra. Uma previsão vencida fica pendente de atualização. Tarefa concluída e mudança de etapa podem contar se configuradas como sinais operacionais, sem renovar a data do comprador.
- Um grupo de interesse tem teto em pontos e estratégia `max` ou `sumCapped`. Uma ocorrência canônica contribui uma vez por grupo, pelo maior peso compatível. Um sinal manual pode referenciar uma ocorrência existente para representar a mesma manifestação em outro canal. Solicitar seleção da referência na interface. Duplicação sem vínculo conhecido fica limitada pelo grupo. A V1 não deduz que duas mensagens descrevem a mesma intenção.
- Grupos e sinais podem ter janela de validade em dias inteiros. A expiração usa `occurredAt`. O limite é exclusivo. Um sinal posterior ao relógio de avaliação fica fora da conta. Se configurada, a inatividade usa apenas o último sinal relevante do comprador aceito pelo modelo. Sem sinal do comprador, a inatividade fica sem referência. Faixas de inatividade aplicam uma única penalidade. Penalidades por outros sinais têm teto próprio e são subtraídas após os grupos positivos. Limitar a temperatura a 0–100 e usar seus próprios limites para as faixas.
- Para impedir perda dobrada implícita, a publicação exige que o administrador veja separadamente contribuição expirada e penalidade de inatividade quando ambas estão configuradas. Regras de resposta automática, clique e abertura de e-mail ficam fora do catálogo inicial de temperatura.

### Prioridade

- Cada versão tem pesos inteiros para potencial e temperatura, com soma 100. `round((fit × fitWeight + temperature × temperatureWeight) / 100)` ordena dentro de cada fila. Nenhuma pontuação de prioridade é calculada com potencial nulo ou cobertura abaixo do mínimo configurado. O lead entra em **Qualificar dados**.
- A versão define cortes e rótulos ordenados de potencial e temperatura, a matriz completa entre faixas e a ordem das filas. Os rótulos da matriz são dados da instância. A ficha exibe faixa, fila, notas, cobertura, critérios e penalidades. Empates usam próxima ação vencendo primeiro e, por fim, ID estável.
- O CRM trata ganho, perda, exclusão, pedido expresso de não contato e impedimentos configuráveis antes do ranking. Pedido de não contato usa a fonte canônica de bloqueio vigente no CRM. Outros impedimentos são condições explícitas sobre campos conhecidos. Um dado ausente pode levar a qualificação, sem marcar a conta como desqualificada. A nota não é uma transição de etapa. Prazos operacionais e SLAs existentes continuam acessíveis na fila Hoje.

## Ciclo de vida e operação

- Um modelo de prioridade publicado por instância, com versões imutáveis. O administrador edita um rascunho com revisão, testa leads reais autorizados e revisa distribuição de filas, cobertura, exclusões e mudanças em relação à versão ativa. A publicação exige prévia concluída para a mesma revisão. Simular não grava notas, tarefas ou eventos comerciais.
- O cálculo novo funciona em paralelo aos modelos `weighted` e `sum`. A interface usa o resultado novo apenas na instância ativada. Cada ativação recebe um ID próprio, inclusive ao retornar a uma versão já usada. Leads ainda sem resultado da ativação atual aparecem como **Calculando**. A publicação inicia recálculo em lotes. A ativação inicial só produz notas e explicações, com efeitos opcionais desligados. Inventariar fluxos que usam score legado antes da ativação do piloto para evitar tarefas concorrentes.
- Mudança de cadastro, etapa, bloqueio, ficha ou dado comercial altera os insumos. Sinal registrado, corrigido ou expirado altera a temperatura. Recalcular só o necessário, a partir dos fatos atuais, sem somar deltas ao valor anterior. Uma correção mantém o registro anterior no histórico e o exclui da avaliação atual.
- Reaproveitar eventos históricos elegíveis por data e identidade comercial, dentro da janela de histórico da versão. Usar apenas a evidência que existir de fato. Dados históricos ausentes e respostas de e-mail sem integração não viram sinais inferidos. Na prévia, explicar o limite da janela.
- Uma tarefa interna automática pode ser habilitada separadamente após o piloto. Derivar a ação da transição de fila configurada e gravar uma única tarefa por transição confirmada. Revalidar escopo, bloqueio e versão na criação. Baseline e recálculo de publicação não criam tarefas. Alertas da V1 aparecem na fila/explicação como recomendações de ação. Envio externo e mudanças de etapa exigem seus próprios fluxos.
- Voltar à versão anterior ou desativar o modelo é mudança do apontador da instância, com auditoria. O modo anterior de CRM volta a fornecer as notas quando a prioridade está desativada. Retorno de versão passa por nova avaliação dos insumos e segue a mesma supressão de efeitos do baseline.

## Restrições técnicas

- Usar PostgreSQL nativo e migrations numeradas, transações, filas e componentes já presentes. Usar `crm_instance_id` e `organization_id` em todas as operações, com autorização de ficha e visibilidade de equipe aplicadas no servidor. Edição de configuração, publicação e habilitação de efeitos restritas ao Admin YUX e ao `client_admin` ativo da instância, com as verificações de acesso ao CRM. Demais papéis visualizam avaliações apenas nos leads que já podem consultar. Registro e revogação de sinais exigem permissão de edição do lead.
- Aplicar RLS com `FORCE ROW LEVEL SECURITY`, grants mínimos e verificação dos vínculos entre versão, instância, lead e sinal. A API fornece somente DTOs de negócio explicitamente permitidos. O cliente recebe rótulos, valores comerciais autorizados, datas e pontuação. A explicação não usa conteúdo bruto de mensagens, payload do Radar ou detalhes técnicos de provedores.
- Usar os serviços simulados em testes. Respeitar as regras de audiência e direitos do Radar em `AGENTS.md`. Reaproveitar dados comerciais já entregues à ficha, sem executar pesquisa, chamadas a serviços pagos ou importar pontuação do Radar.
- Separar merge, implantação do código, ativação por instância e habilitação de tarefas. Configuração de piloto e publicação em produção são etapas operacionais explícitas.

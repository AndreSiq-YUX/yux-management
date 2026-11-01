# CRM: ficha visível, destaque, qualificação e exclusão

## Objetivo e escopo

Evoluir os campos personalizados já publicados para que ajudem a consultar e priorizar leads. Pedido do usuário em 01/11/2026: dados fáceis de encontrar na ficha; campo configurável como destaque na lista e no Kanban; criação acessível de pontuação por campos comuns/personalizados, faixas numéricas e atividades; temperatura e ações por pontuação; exclusão simples de leads importados incorretamente. A pontuação do Radar é apenas referência conceitual, nunca fonte das notas do CRM.

## Comportamentos

1. A primeira visão ao abrir um lead mostra tipo de cliente e campos aplicáveis, com ação clara de editar. A aba de edição continua disponível. Campos comuns aparecem em todos os tipos; específicos somente no tipo correspondente. Valores de outros tipos continuam preservados no armazenamento, sem aparecer na ficha atual. Zero, falso e ausência são distintos.
2. Cada definição tem a opção **Exibir em destaque**. Os campos marcados, com rótulo e valor, aparecem abaixo do nome na lista e no Kanban, respeitando tipo, versão vigente, arquivamento e permissões. Não buscar uma ficha por card. Textos extensos não quebram o layout e podem ser consultados integralmente na ficha.
3. A página Pontuação de leads oferece **Configurar pontuação** mesmo sem modelo. Administradores autorizados criam regras escolhendo nomes legíveis de campos e ações. Membros consultam pontuação e explicação, sem editar regras. O servidor valida essas permissões.
4. Regras de perfil aceitam tipo de cliente, campos padrão comerciais e campos personalizados ativos do CRM. Campos numéricos permitem faixas com início inclusivo e fim exclusivo, incluindo primeira/última faixas abertas. Exemplo ilustrativo, não cadastrado automaticamente: refeições diárias abaixo de 500 = 10 pontos; de 500 a 999 = 20; a partir de 1000 = 30. As faixas de um campo não se sobrepõem. Pontos de campos diferentes podem somar.
5. Regras por estado não acumulam ao salvar a mesma ficha repetidamente: recalculam a contribuição vigente e substituem a anterior. Mudanças de tipo, valores ou regras removem contribuições que deixaram de valer. Configurações alteradas permitem recalcular leads existentes com prévia e resultado visível.
6. Novos modelos usam soma de contribuições de perfil e interesse, limitada a 0–100 na apresentação. Modelos ponderados existentes mantêm seu comportamento até alteração explícita. A ficha explica quais regras contribuíram e quais ações aumentaram/reduziram a nota.
7. Regras por atividade incluem tarefa concluída, mudança para etapa escolhida, interação registrada, e-mail aberto/clicado e resposta recebida por WhatsApp/e-mail quando há evento real associado ao lead. Conteúdo da resposta pode usar condição textual configurada (contém/não contém), sem interpretação por LLM. Origem sem sinal confiável aparece como indisponível, sem simular rastreamento. A mesma entrega/evento não pontua duas vezes; regras têm limite de contribuição para evitar inflação por repetição.
8. Temperatura calculada por limites editáveis: inicialmente frio <40, morno de 40 a 69, quente >=70. A nota não muda sozinha etapa, status comercial ou desqualificação. Ações sugeridas por faixa aparecem na ficha e reutilizam ações comerciais existentes; só executam após comando do usuário. Automações por limiar existentes continuam disponíveis, sem ativar novos disparos ou custos.
9. **Excluir lead** disponível na linha, no card e na ficha; seleção múltipla na lista para limpar importações. Confirmação identifica nomes/quantidade. Excluídos somem das consultas, indicadores e filas operacionais, sem virar perdido/rejeitado. Área **Leads excluídos** permite recuperar. Exclusão é lógica, com ator/data e auditoria; não destrói conversas, evidências ou contratos associados. Bloqueia novas tarefas, envios e pontuação enquanto excluído; recuperação não retoma envios automaticamente.

## Restrições

- Sem migração, deploy, chamadas pagas, envio de mensagens, alteração de credenciais ou exclusão de leads reais nesta etapa de desenvolvimento.
- Não importar nem reutilizar notas, fornecedores ou mecanismos técnicos do Radar. Dados novos expostos por DTO usam allowlists explícitas; nada de JSON bruto ou metadados técnicos em destaques/explicações.
- Validar Admin YUX, operador, administrador da conta e membro com chamadas HTTP diretas e isolamento entre organizações e instâncias CRM. Acesso a vendedor/gestor continua respeitando o escopo já previsto pelo CRM.
- Campos/definições e respostas existentes continuam íntegros. Nenhuma regra ilustrativa é ativada automaticamente.
- Seguir componentes, linguagem e layouts existentes; verificar desktop e celular. Implementação sem novos serviços externos.

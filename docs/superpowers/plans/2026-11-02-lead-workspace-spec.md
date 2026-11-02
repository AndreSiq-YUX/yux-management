# Ficha de lead integrada e dados comerciais do Radar

## Resultado esperado

A ficha deve permitir trabalhar o lead sem botões sem ação, informações duplicadas ou blocos que empurrem o conteúdo principal para fora da primeira tela. Manter os campos existentes, reorganizando sua apresentação. Aproveitar os dados comerciais já encontrados pelo Radar tanto nas próximas importações quanto nos leads já importados.

## Evidências do diagnóstico

- O print do usuário mostra duas caixas de largura total antes da ficha: dados do cliente e pontuação. `CrmWorkspace.tsx` monta essas caixas antes de `Lead360Panel`.
- `Lead360Panel.tsx` fornece ações sem `onClick` para Nota, WhatsApp, E-mail, Chamada e Reunião. Também há ações rápidas de nota, WhatsApp e proposta sem destino. A ação de tarefa chama a gravação antes de abrir/preencher o formulário.
- Há duas camadas de abas e conteúdo repetido entre Resumo/Sobre, histórico/atividades, tarefas e comercial/propostas.
- `buildRadarCrmLeadFacts` seleciona um telefone, mas não entrega um WhatsApp separado nem endereço/cidade/estado como dados da ficha. Site e contatos ficam dentro de `attribution_context`.
- `mapLead` no backend e o mapeamento legado do frontend não transportam cidade, estado ou `whatsapp_phone`, embora o tipo de frontend já preveja esses campos.
- A conversão antiga de oportunidade do Radar é outro caminho de entrada e precisa receber a mesma correção.

## Organização visual proposta

1. Cabeçalho compacto com nome, empresa, situação, temperatura e pontuação. Exclusão como ícone de lixeira discreto, com nome acessível, tooltip e a confirmação recuperável já existente. Sem linha inteira dedicada à exclusão.
2. Coluna de identidade com ações, contatos, site, redes e localização; campos personalizados integrados à ficha, com edição contextual. Campos vazios continuam acessíveis na edição sem dominar o primeiro quadro.
3. Área principal com uma única navegação: Visão geral, Atividades, Conversas, Comercial e Automações. Editar perfil é uma ação contextual; histórico e tarefas compartilham Atividades com filtros e formulários próprios.
4. Pontuação resumida junto à identidade. Explicação dos pontos e ações sugeridas em área expansível contextual, sem outra caixa de largura total.
5. Associações mostram vínculos reais e navegam para seus destinos. Estados sem vínculo são informativos e não simulam registros existentes.
6. Desktop de referência 1440×900 e celular 390×844. Nomes longos, e-mails, endereços e URLs devem quebrar ou truncar com acesso ao conteúdo completo, sem sobreposição. Ações principais disponíveis por teclado e toque.

## Comportamento das ações

| Ação | Resultado verificável |
| --- | --- |
| Nota | Abrir editor; salvar interação; mostrar no histórico imediatamente. |
| Tarefa | Abrir formulário com lead preenchido; validar título/prazo; salvar e aparecer na ficha, tarefas do CRM e próxima ação. |
| E-mail | Abrir composição com destinatário; mostrar capacidade de envio da conta; envio explícito pela infraestrutura existente, com estados de fila/entrega e histórico. Uma conta sem remetente configurado recebe orientação acionável. |
| WhatsApp | Abrir conversa vinculada no atendimento ou oferecer início manual pelo número confirmado. Não transformar telefone cadastral em WhatsApp verificado. |
| Chamada | Disponibilizar discagem pelo número e registro do resultado. Abrir discador não registra chamada concluída. |
| Reunião | Abrir agendamento com data/hora e vínculo ao lead, persistir acompanhamento e histórico; oferecer arquivo de calendário quando útil. Não afirmar convite ou sincronização externa que não ocorreu. |
| Proposta | Abrir fluxo comercial existente com o lead selecionado. |
| Ganho/perdido | Persistir resultado e atualizar ficha, lista, indicadores e histórico. |
| Pontuação | Mostrar motivos legíveis e abrir de fato o formulário da ação sugerida. Não executar ação automaticamente por atingir uma nota. |

Nenhuma ação habilitada termina silenciosamente. Falta de dado, permissão, integração ou módulo precisa de estado e orientação específicos. Preservar os módulos contratados e as permissões atuais; finalizar a interface não concede novas permissões de envio.

## Dados comerciais da ficha

- Empresa: nome, razão social, CNPJ cadastral e segmento/atividade quando disponíveis.
- Localização: endereço, cidade e UF.
- Presença: site institucional e redes sociais identificadas, com URLs utilizáveis e validadas.
- Contatos: e-mails, telefones e WhatsApp separados, mantendo multiplicidade, contato preferido, associação e origem pública útil.
- Pesquisa: perfil da empresa, segmentos atendidos, regiões, sinais de porte e evidências comerciais legíveis. Sem despejar objetos JSON na tela.
- Tipo de cliente e campos personalizados continuam configuráveis por conta/tipo. Não inferir valores como refeições diárias sem evidência e não criar campos personalizados automaticamente a partir de qualquer chave da pesquisa.

## Importação e recuperação dos leads existentes

Usar uma projeção comercial única para os dois caminhos de importação e para reconciliar registros existentes. Criar campos persistidos e contratos explícitos para dados básicos; manter detalhe de pesquisa em estrutura comercial tipada. Ausência de evidência permanece ausência de dado. Não inventar e-mail, site ou WhatsApp.

Para registros antigos, preparar prévia de reconciliação a partir das pesquisas salvas e dos vínculos persistidos com o Radar. Preencher apenas campos vazios; preservar alterações manuais, valores personalizados, etapa, nota, tipo, responsável, consentimentos e leads excluídos. Dados conflitantes exigem escolha explícita. Repetir a operação não duplica contatos nem histórico. Registrar resumo auditável de origem/alterações sem diagnósticos técnicos.

O processo revalida conta, identidade empresarial e direitos de entrega. Não dispara nova pesquisa nem chamadas pagas. Uma pesquisa mais recente não deve transferir contatos de outra empresa, dados pendentes de confirmação ou material cuja licença impeça entrega.

## Restrições globais

- Somente o papel global `yux_admin` pode receber/ver ferramentas, fornecedores, modelos, rotas LLM, licenças, custos internos e diagnósticos técnicos do Radar.
- Aplicar a separação no backend, por allowlists explícitas inclusive aninhadas, além da interface.
- CNPJ da empresa não é o fornecedor CNPJá; preserve o dado cadastral, não divulgue o mecanismo de coleta.
- Dados comerciais legítimos (inclusive nomes parecidos com fornecedores) não podem ser mutilados por substituição global de texto.
- Não remover obrigações de atribuição/licença para ocultar ferramentas.
- Não executar chamadas a provedores/LLMs externos pagos nem trocar/ativar um modelo pago sem autorização explícita do usuário para o serviço/modelo.
- Testes de desenvolvimento usam provedores simulados.
- Não executar envios reais a leads durante validação. Não alterar credenciais, limites ou integrações em produção.
- Publicação e execução de reconciliação em produção serão etapas próprias após a implementação estar verificável; a publicação anterior refere-se à versão anterior.

## Critérios de aceite

- Primeira tela exibe identidade, contatos e ações sem os dois painéis grandes anteriores.
- Cada ação da matriz é exercitada com resultado persistido ou orientação específica quando indisponível.
- Uma empresa de teste com site, redes, múltiplos contatos, WhatsApp e endereço mantém os dados do Radar até a ficha e sua edição.
- Reconciliação corrige lacunas antigas sem sobrescrever dados manuais ou duplicar informações.
- Contratos HTTP diretos cobrem Admin YUX, operador, administrador da conta e membro, com isolamento entre contas e ausência de campos internos aninhados.
- Verificação visual desktop/celular, console sem erros relevantes, testes de regressão e builds aprovados. Não declarar envio, convite externo ou sincronização sem prova do serviço correspondente.

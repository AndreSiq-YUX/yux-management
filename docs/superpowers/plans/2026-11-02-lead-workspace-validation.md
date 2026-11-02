# Validação da ficha de leads — 02/11/2026

Implementação local na branch `codex/lead-workspace`. Base `6e0890e`; implementação `dde0061`. Sem merge, push, deploy ou reconciliação em produção. Revisão independente concluída, com quatro correções verificadas por regressões e pela rodada completa de testes.

## Resultado

- Uma navegação para visão geral, atividades, conversas, comercial e automações.
- Contatos, site, redes, endereço e campos personalizados integrados; edição contextual.
- Pontuação e temperatura compactas, com explicação expansível e ações reais.
- Ícone discreto de exclusão, confirmação e recuperação.
- Importação comercial mais completa e recuperação explícita das lacunas dos leads antigos.
- Nota, tarefa, chamada e reunião persistidas no CRM; composição de e-mail com capacidade, política de envio e estados reais; conversa vinculada com resposta revisável; rascunho de proposta vinculado ao lead.

## Conferência no navegador

Chrome, conta de teste, API e PostgreSQL locais. Dimensões 1440×900 e 390×844.

| Fluxo | Evidência observada |
| --- | --- |
| Radar → ficha | Empresa sintética importada pelo serviço real de entrega; múltiplos e-mails, telefone, WhatsApp, site, rede, CNPJ e localização disponíveis. |
| Nota | Texto salvo e imediatamente exibido no histórico. |
| Reunião | Agendamento salvo e exibido em tarefas e histórico; sem alegação de convite externo. |
| Perfil | Refeições diárias alteradas de 3.000 para 3.500. |
| Edição e recuperação | Site esvaziado, cidade editada manualmente; prévia indicou preencher site/preservar cidade. Aplicação restaurou site e manteve a cidade revisada. |
| E-mail | Composição com destinatário, assunto e texto; envio bloqueado por ausência de autorização, com alternativa pelo aplicativo de e-mail. Fila/erro/sucesso exercitados com provedor simulado nos testes HTTP. |
| Conversa | Resposta revisada registrada na conversa de webchat correta, com estado “Na fila”; navegação para o atendimento e volta para a ficha corretas. |
| Proposta | Rascunho criado uma vez, aberto e editado, com escopo salvo; sem envio ou geração por IA durante a validação. |
| Tarefa | Botão Concluir persistiu conclusão e reduziu o contador. |
| Exclusão | Confirmação, exclusão recuperável e Desfazer; campos personalizados mantidos em 3.500. |
| Celular | Nome longo sem sobreposição; indicadores abaixo do nome; contatos/perfil expansíveis antes do trabalho; abertura da edição recolhe os dados e reposiciona a área. |
| Console | Aba final sem erros de execução. |

## Verificação automatizada

- Backend: 1.678 testes aprovados; 126 casos opcionais ignorados pelo comando padrão, sem afirmar que foram executados.
- Frontend: 1.315 testes aprovados em 246 arquivos.
- Integrações CRM em PostgreSQL: 20 casos aprovados em 6 arquivos, incluindo concorrência de edição e direitos do conversor legado.
- Integrações Radar em banco dedicado: 38 casos aprovados, inclusive audiência comercial e entrega ao CRM.
- Compilações de backend e frontend aprovadas; orçamento de tamanho do frontend aprovado.
- Inventário de migrações atualizado e manifesto verificado, mantendo o status bloqueado e as flags existentes.
- Lint: nenhuma regressão nos arquivos alterados. A verificação de baseline ainda reprova um aviso de atualização em desenvolvimento em `RadarResearchAttention.tsx`, arquivo não alterado nesta implementação. Contagem global reduzida de 560 para 544 erros e de 27 para 24 avisos; não se trata de lint global limpo.
- Nenhum fornecedor pago foi chamado; respostas de entrega foram simuladas e os efeitos visuais ocorreram somente na base local.

## Limites da entrega

- Publicação, migrations e recuperação de registros de produção são uma próxima etapa.
- Reunião é agenda/atividade do CRM, sem convite ou sincronização externa automática.
- Envio pelo CRM mantém consentimento, bloqueios, limites e configuração existentes.
- Propostas reutilizam o catálogo e o módulo existentes; um catálogo de produtos específico do representante comercial exige uma definição própria.
- A recuperação do Radar usa somente pesquisas salvas e pede confirmação da prévia; não pesquisa novamente nem dispara contato automático.

## Decisões tomadas e consequências

Lista completa das decisões registradas no diário da execução, na ordem em que foram tomadas:

1. **Banco e migrations existentes:** manter PostgreSQL e o executor numerado do projeto. Trocar por Supabase criaria um histórico de migrations incompatível; custo de erro: instalação/atualização inconsistente.
2. **Recuperação comercial pelo CRM:** apresentar dados comerciais permitidos, revalidando acesso e direitos; corrigir o gatilho antigo de organização que falhava em interações; usar integração real como prova principal. Custo de erro: manutenção de uma rota específica e risco de falhas de isolamento/gatilho, cobertos pelos testes.
3. **Envio e agenda honestos:** conservar a política de consentimento; oferecer aplicativo de e-mail quando indisponível; reunião apenas no CRM; descartar atualização visual de composição anterior. Custo: nenhuma promessa de convite externo nem liberação de envio sem autorização.
4. **Layout e dados relacionados específicos da ficha:** preservar os layouts compartilhados e substituir consultas genéricas que eram proibidas para o cliente. Custo: uma interface específica a manter.
5. **Recuperação exige leitura do Radar e acesso ao lead:** preencher o CRM não altera o Radar e não exige sua administração técnica. Custo de erro: autores do CRM poderiam preencher lacunas mais amplamente do que uma política futura mais restrita pretenda.
6. **Evento de e-mail compatível com seu índice:** corrigir a inferência da unicidade parcial, após reproduzir a falha real de entrega no banco. Custo de erro: duplicação de eventos de entrega; regressões simuladas cobrem falha/sucesso.
7. **Rascunho de proposta específico e idempotente:** reutilizar o repositório/catálogo existentes, sem registrar um rascunho como enviado. Custo: o catálogo YUX existente pode não representar produtos específicos de uma conta.
8. **Recuperação repetida sem mudanças:** registrar a solicitação na auditoria, sem atualizar o lead nem duplicar o histórico. Custo: a auditoria pode conter aplicações vazias inofensivas.
9. **Vínculo de atendimento explícito:** expor o identificador comercial do lead ligado à conversa e consultar seus dados por uma rota autorizada do CRM. Custo de erro: visibilidade do identificador de um lead já ligado à conversa; dados continuam dependendo de autorização própria.
10. **Atribuição antiga também passa por projeção:** manter campos comerciais/UTM conhecidos e retirar extensões técnicas das respostas, preservando o armazenamento. Custo: uma extensão não documentada de atribuição pode deixar de aparecer na resposta.
11. **Pesquisa estruturada na ficha (decisão inicial substituída na revisão):** a ocultação por origem poderia esconder notas manuais de um lead do Radar. A correção interpreta somente os blocos gerados antigos, preserva o texto manual de qualquer origem e apresenta suas observações contextualmente. O armazenamento original e a auditoria ficam intactos.
12. **Integração real para ações:** substituir um arquivo adicional de testes simulados por chamadas HTTP reais com PostgreSQL, cobrindo transação, duplicação, exclusão e estados de entrega. Custo: esses casos exigem o banco isolado de teste.

## Revisão independente

Revisão independente somente leitura, feita por um agente com contexto novo sobre os 71 arquivos do intervalo `6e0890e..dde0061`. Nenhum achado crítico ou menor; quatro achados importantes, todos corrigidos em uma única rodada:

1. Formulário antigo enviava todos os campos. Agora envia somente alterações, com comparação atômica dos valores anteriores no banco, distinguindo ausência histórica e remoção explícita; conflitos do mesmo campo retornam orientação sem gravar parcialmente.
2. Site apagado reaparecia por uma alternativa no perfil importado. Agora a remoção explícita é autoritativa e permanece ausente ao reabrir. A recuperação exige a ação explícita do usuário.
3. A origem Radar escondia o campo de notas. Agora notas manuais são preservadas e os blocos de pesquisa antigos são apresentados em texto comercial, também nas respostas HTTP, sem seus campos técnicos.
4. Conversor antigo não revalidava direitos de entrega. Agora os dois conversores e a recuperação compartilham a mesma verificação atual, inclusive proveniência salva, antes de gravar. O caminho autorizado também passou pelo banco real.

Cada regressão foi observada falhando e depois aprovada. As suítes completas, integrações e builds passaram após as correções. Não foi realizada uma segunda revisão independente; a prova das correções é a regressão e a rodada completa.

**Decisões finais sobre o que o revisor deixou fora do julgamento:**

13. Credenciais, filas e provedores reais de produção permanecem fora desta fase. O comportamento entregue mantém as políticas e informa indisponibilidade; testes usam simulações. Custo: diferenças de configuração em produção precisam de conferência na publicação autorizada.
14. O catálogo específico de produtos dos clientes não foi redesenhado. A entrega usa o catálogo de propostas existente, conforme a spec. Custo: produtos próprios do representante exigem uma definição/configuração posterior.

**Pequenos ajustes adiados:** nenhum adicional da revisão. O aviso de lint legado descrito acima permanece, sem esconder seu resultado.

Esta validação não publica a versão nem executa efeitos em produção.

## Imagens

- `ficha-desktop.png`: composição principal em desktop 1440×900.
- `ficha-desktop-final.png`: captura após as correções finais, na janela padrão.
- `ficha-mobile.png`: primeira tela em celular.
- `ficha-mobile-contatos.png`: dados de contato e perfil expandidos.
- `ficha-mobile-nome-longo.png`: caso de nome longo.
- `conversa-desktop.png`: resposta e contexto no atendimento.

# Validação da evolução do CRM

Implementação local na branch `codex/crm-qualification`, baseada em `5b82018`. Produção, credenciais e limites comerciais não foram alterados. As migrations 0250–0252 foram aplicadas somente a um PostgreSQL descartável em `127.0.0.1:55440`.

## Resultado

- Backend: **1.676 testes passaram**, 126 testes opcionais permaneceram ignorados pela configuração da suíte.
- Frontend: **1.297 testes passaram**. Após separar utilitários de componentes para Fast Refresh, os **29 testes** diretamente relacionados também passaram.
- Integração real PostgreSQL/HTTP: **10 cenários passaram**, com migrations desde a base e RLS nos papéis de serviço.
- Builds de produção do backend e frontend passaram, incluindo orçamento do bundle.
- Inventário de migrations verificado; manifesto permanece no estado de rollout que já existia. SHA do manifesto: `47e38148bcce801a4024844130aa94670d66208134df7c052d3d990d630451af`.

Comandos principais: `vitest run --maxWorkers=4` em cada pacote; `vitest run --config vitest.integration.config.ts --maxWorkers=1 tests/integration/crm-qualification.test.ts tests/integration/crm-record-profile.test.ts`; `npm run build` nos dois pacotes; `npm run verify:remediation-release` no backend.

## Percursos e regressões

Navegador Chrome local com Playwright: criar tipo/campo em destaque → criar lead com zero → consultar dados na primeira visão → editar para 1.000 → criar faixas → prévia e recálculo → conferir ranking e explicação de 30 pontos → viewport 390×844 → lista → excluir → recuperar. Nenhum erro de JavaScript ou falha nos endpoints da funcionalidade. O teste do navegador usou Playwright porque o plugin Browser não estava disponível nesta sessão.

Snapshots desktop e celular estão na pasta de artefatos desta conversa, em `crm-qualification-desktop.png` e `crm-qualification-mobile.png`. As sondagens de layout confirmaram que os elementos visíveis cabem no modal; a largura de rolagem adicional corresponde apenas ao texto `Close` visualmente oculto do componente de diálogo existente.

Os testes cobrem valores zero/falso, fronteiras 499/500/999/1000, faixas sobrepostas, troca de tipo preservando respostas, substituição da contribuição de perfil, deduplicação de mensagem/tarefa, limite de contribuição e seu recálculo depois de editar a regra, escopo de gestor, isolamento entre contas, quatro perfis de usuário, rollback de lote inválido, exclusão/recuperação e bloqueio de tarefas.

Um teste concorrente de PostgreSQL mantém o lock da exclusão enquanto outra conexão tenta adquirir um envio de WhatsApp: a aquisição espera, depois rejeita o lead excluído, sem criar tentativa de envio. Outro teste confirma que recuperar o lead não reativa execuções ou mensagens canceladas. Indicadores e busca operacional deixam de contar os excluídos. Um lead legado com nota 94 do Radar aparece com zero no modelo de qualificação até ter nota calculada por esse modelo.

## Revisão e decisões

Uma revisão independente do commit inicial encontrou seis problemas importantes: corrida de envio/exclusão, retomada de trabalhos antigos, prévia de gestor fora do escopo, recálculo de atividades editadas, paginação da lixeira após troca de conta e indicadores que ainda contavam excluídos. Todos foram corrigidos em uma única rodada com regressões reproduzidas antes das correções e depois aprovadas. Também foram corrigidas atualização assíncrona da nota, atualização do ranking e instruções de cálculo do modo soma. Não houve uma segunda rodada de revisão independente.

- Os modelos ponderados existentes são preservados até troca explícita para soma. Notas sem origem no modelo novo, inclusive as antigas do Radar, não são reaproveitadas. Custo: leads existentes precisam do recálculo depois de configurar as regras.
- Entregas 1–5 foram commitadas juntas porque compartilham migrations, transações e DTOs; testes planejados foram concentrados nas suítes de perfil, qualificação e integração para verificar o comportamento completo. Custo: o primeiro diff de revisão é maior.
- Respostas de WhatsApp exigem vínculo real ao lead. Respostas de e-mail são registradas manualmente; não há captura automática ou interpretação por LLM. Custo: a equipe precisa registrar a resposta de e-mail.
- Uma regra nova de atividade acompanha ocorrências a partir de sua criação. Alterações reavaliam as ocorrências acompanhadas pela própria regra, com contexto comercial limitado e sem reusar metadados de fornecedores. Custo: não há uma varredura automática de toda a atividade anterior à criação da regra.
- Uma entrega adquirida antes da exclusão pode terminar. Novas aquisições são bloqueadas e intenções pendentes/repetíveis ficam canceladas permanentemente. Custo: a exclusão não desfaz uma entrega já iniciada no provedor.
- A branch e o worktree foram preservados localmente, conforme o plano aprovado de entregar para revisão antes de produção. Não houve push, merge, PR ou deploy.

## Limites da validação

O fixture local continua apresentando falhas anteriores em `crm/conversation-query` (403/500, incluindo tabelas antigas sem `organization_id`), fora dos endpoints novos. Nenhum provedor pago foi chamado para validar a funcionalidade.

O lint global já possuía erros legados em `crmService.ts` e um fingerprint bloqueador em `RadarResearchAttention.tsx`. Não foram adicionadas supressões nem ampliada a baseline para acomodar esta entrega.

Envio real por provedores, migração/deploy de produção, desempenho com volume de produção e propagação de revogação em sessões reais continuam para uma etapa de rollout autorizada. A matriz de acesso HTTP e isolamento foi validada localmente.

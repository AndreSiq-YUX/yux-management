# Verificação da centralização de LLMs no Admin

Data: 2026-09-16. Implementação local na branch `codex/yux-remediation-integrated`.
Base: `37dfbb7d6cea13c97ae72a2f62b3711af289c9a5`.
Código final: `43a7342093d1e3ba7f9f9f95f434c6f622efeaab`.

## Resultado

Admin → IA/LLM (`/admin/ai`) concentra credenciais de provedores, todas as funções atuais de LLM, perfis de atendimento/WhatsApp e agentes de marketing. Cada rota aceita principal e fallbacks manuais ordenados, inclusive entre provedores. Há reservas globais distintas para texto e embeddings. A antiga aba de modelos do Strategy Engine encaminha à página central.

Rotas salvas, tiers, escopos, vínculos de perfis, regras comerciais, ferramentas e conhecimento importado foram preservados. Configurações legadas são exibidas com origem explícita, sem substituir escolhas salvas ou reativar rotas pausadas. Configurações/credenciais atualizadas são lidas na execução seguinte.

Precedência: override aplicável → sua cadeia manual → configuração geral da função e seus fallbacks → reserva global compatível. Modelos pagos não são escolhidos automaticamente; salvar uma rota ativa é uma escolha explícita do Admin. Negação de autorização não é contornada por fallback. Testar um modelo exige clicar e confirmar uma possível cobrança.

## Verificação

| Verificação | Resultado |
|---|---|
| Backend completo | 701 testes, 169 arquivos: passaram |
| Frontend completo | 584 testes, 140 arquivos: passaram |
| Runtime Python completo final | 244 passaram; 1 teste live opt-in ignorado |
| Tipos e compilação backend/frontend | Passaram |
| Orçamento de bundle frontend | Passou; redução de 84,21% |
| Manifesto de release | Passou; 74 migrações, última 0173 |
| Diff e staging dos arquivos próprios | Verificados; sem alterações alheias incluídas |

Não houve chamadas reais de LLM, consumo de créditos OpenRouter, migração em banco real, push ou deploy. Avisos preexistentes de Vite e normalização de finais de linha Windows não foram alterados. Uma execução intermediária concorrente teve timeout de 5s em teste de manifesto; a execução estável e o conjunto final passaram. O checksum foi atualizado após a alteração final da migração.

## Revisões e regressões

Revisão independente de especificação/qualidade encontrou três problemas: cadeia geral omitida após override, rota de texto por agente entrando em embeddings e teto legado de extração empresarial reduzido. Os três foram reproduzidos em RED, corrigidos e aprovados em nova revisão. A extração legada mantém 6500 tokens; limites explícitos do Admin permanecem respeitados.

Revisão independente final encontrou o contexto ausente no caminho em fila. O endpoint agora constrói o engine após validar o job e com organização/cliente/contrato correspondentes. Testes pela rota real de ingestão de evento → processamento em fila cobrem modelos gerais, overrides de organização/contrato, vetores compatíveis e ausência de chamadas de embeddings quando o override está pausado. RED: 4 falharam/2 passaram. GREEN focado: 43 passaram. Nova revisão do fix: aprovado, sem novos problemas ou observações pendentes.

Commits de implementação/revisão: `88ed765`, `2e283d0`, `8ce9714`, `64819d5`, `c1c1f87`, `43a7342`.

## Migração e publicação

A migração 0173 acrescenta `fallback_routes` sem excluir dados. Funções privadas e restritas ao runtime leem estado do provedor e envelope criptografado da mesma conexão selecionada, sem herdar indevidamente a chave de uma conexão antiga. A seleção respeita status antes de pedir o segredo e restaura o contexto do tenant.

Aplicar 0173 antes de iniciar o runtime atualizado. Comportamento em produção e migração real ainda precisam ser conferidos após a publicação. Trocar o modelo de embeddings exige reindexação explícita para manter cobertura semântica; índices anteriores permanecem intactos e não há reindexação paga automática.

Instruções de operação: [Administração central de LLMs](../operations/llm-routing-admin.md).

## Decisão registrada

Ruling: continuar na branch dedicada de correções existente, preservando o fluxo de trabalho e os arquivos alheios. Se a decisão precisar ser revista, as alterações estão isoladas em commits locais reversíveis; será necessário mover ou reverter esses commits.

Ruling: manter as notas temporárias desta execução após a limpeza ser recusada pela proteção do ambiente, sem tentar contorná-la. Custo potencial: as notas/diffs permanecem em disco; o relatório permanente e os commits não são afetados. Nenhum arquivo foi removido.

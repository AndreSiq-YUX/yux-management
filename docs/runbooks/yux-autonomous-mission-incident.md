# Runbook de incidente — Missões autônomas YUX

## Objetivo e escopo

Este runbook contém uma missão autônoma quando há gasto indevido, contato externo inesperado, provedor degradado, efeito externo com resultado desconhecido, violação de política ou suspeita de comprometimento. O Action Engine continua sendo o proprietário da intenção; automações e provedores são subprocessos contidos por ele.

## Ordem obrigatória de contenção

1. **Pausar a missão** no Centro de Controle de Autonomia. Registrar horário, operador e motivo.
2. **Revogar o grant ativo**. A revogação impede novas autorizações autônomas; não apaga efeitos já aceitos por provedores.
3. **Ativar o kill switch da capability e versão exatas** quando o risco não estiver restrito a uma única missão. Mudanças em escopo de organização, pack ou global exigem confirmação e autorização administrativa separadas.
4. **Conter o provedor**: pausar campanha/sequência, cancelar tarefa compensável ou bloquear o canal afetado. Não marcar um envio como desfeito.
5. **Reconciliar efeitos desconhecidos** consultando o provedor pela chave idempotente. Classificar cada efeito como criado, falhou ou requer revisão manual.
6. **Reverter custos reservados não consumidos** e preservar custos reais. Toda reversão referencia a reserva original.
7. **Liberar claims por último**, somente depois de confirmar que não existe mutação em trânsito, callback pendente ou reconciliação aberta.

## Janela residual pós-dispatch

Pausa, revogação e kill switch são checados no preflight imediatamente anterior à mutação. Uma chamada já aceita pelo provedor pode concluir durante a curta validade do lease de mutação. Essa janela residual não é tratada como rollback: o efeito deve aparecer no ledger externo e seguir para contenção/reconciliação. Nunca repetir uma chamada com resultado desconhecido sem consultar a chave idempotente no provedor.

## Critérios de severidade

- **SEV-1:** contato externo indevido, vazamento de segredo/PII, gasto fora do envelope ou mutação continuando após revogação confirmada.
- **SEV-2:** efeito externo desconhecido, duplicidade contida, provedor degradado com missão ativa ou consumo acima de 95%.
- **SEV-3:** bloqueio preventivo sem efeito externo, integração indisponível ou expiração normal de grant.

## Evidências mínimas

Registrar: `missionId`, organização, pack e versão, hash do plano/contexto/catálogo, grant e `envelopeHash`, capability e versão, action/run/attempt, lease, chave idempotente, IDs do provedor, custo reservado/real/revertido, contatos afetados, decisões, horários e operador. Não copiar tokens, credenciais, conteúdo integral de prompts ou PII para o registro do incidente.

## Retomada

A missão só pode ser retomada quando: todos os efeitos externos estiverem resolvidos; a origem estiver corrigida; o kill switch puder ser removido com revisão; readiness e golden missions estiverem aprovados; orçamento e consentimento continuarem válidos; e um novo grant versionado for solicitado e aprovado pelo hash exato. Grants revogados ou expirados não são reativados.

## Gatilhos objetivos de rollback

Interromper o rollout e retornar à etapa anterior se ocorrer qualquer um dos seguintes eventos: efeito não autorizado; duplicidade externa; violação cross-tenant; execução sem grant ativo; custo ou contato além do envelope; segredo em snapshot/trace; aprovação stale aceita; incapacidade de reconciliar resultado desconhecido; ou indisponibilidade do executor fora do SLO definido.

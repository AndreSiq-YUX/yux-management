# YUX Mission Safety Foundation — rollback e contenção

## Objetivo

Conter efeitos de Missões sem apagar evidências, custos ou estados externos incertos. Rollback de aplicação nunca significa “desfazer” e-mail, mensagem ou outra mutação irreversível já aceita por um provider.

## Gatilhos objetivos

| Gatilho | Ação imediata |
|---|---|
| Exposição entre tenants, segredo ou PII não redigida | Ativar kill switch global; interromper exportação de telemetria; iniciar incidente crítico. |
| Efeito não autorizado ou duplicado em uma capability | Desabilitar `capability@version`; pausar Missões afetadas; reconciliar outcomes desconhecidos. |
| Duas janelas consecutivas de 15 minutos fora do SLO de disponibilidade/latência | Suspender rollout e voltar para a versão anterior do serviço. |
| Drift de catálogo, fencing token obsoleto ou lease inválido recorrente | Pausar a Missão; preservar o blocker; exigir novo plano/aprovação quando aplicável. |

## Ordem de contenção

1. Parar trabalho novo no menor escopo seguro: capability, pack, organização ou global.
2. Conter efeitos pausáveis e compensar somente efeitos classificados como compensáveis.
3. Não repetir mutações com outcome desconhecido; executar reconciliação com o provider.
4. Preservar ledger de incidentes, external effects, custos, aprovações, hashes e manifests.
5. Revogar leases de mutação ainda não consumidos.
6. Liberar resource claims por último, depois de confirmar que nenhum worker antigo continuará executando.

## Rollback por release

- Aplicação: promover a última imagem conhecida como estável. Não reverter a migration `0130`; ela é aditiva e as tabelas de segurança devem permanecer disponíveis para investigação.
- Harness: voltar prompt/modelo somente após executar golden missions da versão alvo. Manter o contrato JSON Schema compatível.
- Pack: nunca editar versão publicada. Retirar a versão problemática de publicação e selecionar uma versão anterior pelo hash original.
- Banco: não excluir external effects, incidents, mutation leases, resource claims, usage entries ou manifests durante o incidente.

## Critérios para retomada

- Outcome de todos os efeitos `unknown` foi confirmado ou movido para revisão manual.
- Não há worker com fencing token anterior ao claim atual.
- A causa foi coberta por teste de regressão e golden mission.
- Duas janelas de 15 minutos atendem aos SLOs.
- Segurança/privacidade aprovou a retomada quando houve exposição de dados.

## Evidência obrigatória de promoção

Antes de promover modelo, prompt, pack ou catálogo, execute `python scripts/run_golden_missions.py` no runtime. A promoção exige 15/15 cenários sem falha de schema, nós protegidos, citações, política ou tenant boundary; score de domínio mínimo de 90%; e regressão mediana de custo/p95 de latência no máximo 20%. Exceção requer registro versionado com aprovador, justificativa e validade. O ensaio de rollback deve confirmar a ordem de contenção deste runbook.

## Risco residual documentado

Existe uma janela residual entre a validação final/consumo do lease e a aceitação do efeito pelo provider. O kill switch impede novo trabalho, mas não apaga um efeito já aceito. A resposta correta é contenção, reconciliação e ledger de incidente.

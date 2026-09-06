# Reconciliação segura do estado histórico da YUX

Este procedimento classifica registros antigos e aplica somente correções cuja origem, versão e ausência de efeito externo possam ser comprovadas. O banco PostgreSQL é a autoridade; a fila apenas agenda uma linha já validada.

## Barreiras obrigatórias

- Comece sempre com `--dry-run`. O comando não aplica alterações sem um arquivo de manifesto, o hash exato aprovado e um `--limit` explícito entre 1 e 20.
- Execute primeiro contra uma restauração recente e isolada do banco, ligada a um Redis isolado. Não reutilize Redis de produção no ensaio.
- Não edite o JSON gerado. Qualquer alteração invalida o hash do item ou do manifesto.
- Guarde o manifesto como dado operacional restrito. Ele omite conteúdo, mensagens, nomes, e-mails, telefones, prompts e erros livres, mas ainda contém identificadores internos.
- Não restaure um banco antigo sobre o atual, não apague filas e não remova registros para “limpar” o cenário. A reconciliação é incremental e deixa trilha.
- Missão cancelada, aprovação expirada, conversa aguardando usuário, mensagem antiga, job sem identidade suficiente e efeito externo desconhecido nunca são reabertos ou reenviados automaticamente.

## Classes e destinos

| Classe observada | Destino proposto | Aplicação automática |
| --- | --- | --- |
| Ingestão estratégica `uploaded`, sem documento e sem bytes | Solicitar novo envio no mesmo registro; o ID antigo permanece como origem | Sim; muda para falha recuperável e mantém o passo `upload` |
| Curadoria empresarial `queued`/`running` órfã, com fonte íntegra | Cancelar somente a execução órfã e agendar nova indexação com identidade estável | Sim, após conferir bytes/hash ou a origem manual/URL |
| Curadoria degradada ou falha sem origem comprovada | Revisão de negócio | Não |
| Execução de agente falha | Preservar o registro e revisar | Não |
| Conversa `awaiting_user` | Aguardar decisão do usuário | Não |
| Missão `cancelled` | Preservar cancelamento | Não |
| Efeito externo `unknown`, `reconciling` ou `manual_review` | Fluxo específico de reconciliação do provedor | Não; nunca repetir a chamada pelo job antigo |
| `generateLearning` antigo | Nova execução idempotente na fila de manutenção | Somente quando ainda existe missão terminal elegível sem memória |
| Checkpoint de campanha antigo | Nova execução identificada | Somente quando o job identifica a missão e ela continua ativa, autônoma e com concessão vigente |
| Outros jobs falhos, inclusive conversa antiga | Revisão de negócio | Não |

## 1. Ensaio no ambiente restaurado

1. Aplique as migrações na restauração, incluindo `0169_state_reconciliation_audit.sql`.
2. Configure `DATABASE_URL` (ou `MIGRATOR_DATABASE_URL`), `REDIS_URL`, `KNOWLEDGE_STORAGE_DIR` e `YUX_RECONCILIATION_OPERATOR` para o ambiente isolado.
3. Confirme que o armazenamento de documentos pertence à mesma restauração. Ausência, tamanho divergente ou SHA-256 divergente bloqueiam a retomada.
4. Gere um lote pequeno:

   ```powershell
   cd backend
   npx tsx scripts/reconcile-audit-state.ts --dry-run --limit 20 --output reconciliation-manifest.json
   ```

   O arquivo de saída deve ser novo; o comando recusa sobrescrever um manifesto existente.

5. Revise cada item. Os campos obrigatórios são `id`, `entityType`, `reason`, `currentState`, `proposedAction`, `expectedVersion`, `payloadHash` e `externalEffectRisk`.
6. Registre a aprovação operacional do `manifestHash` exibido pelo comando. Aprovar um resumo ou somente o nome do arquivo não é suficiente.
7. Aplique primeiro com limite menor que o manifesto:

   ```powershell
   npx tsx scripts/reconcile-audit-state.ts --apply --manifest reconciliation-manifest.json --approved-hash HASH_APROVADO --limit 5
   ```

8. Confira os destinos e motivos persistidos:

   ```sql
   SELECT entity_type, entity_id, proposed_action, status, result, applied_at
   FROM public.state_reconciliation_items
   WHERE manifest_hash = 'HASH_APROVADO'
   ORDER BY created_at, item_id;
   ```

9. Confira que estados protegidos continuaram iguais e que retomadas entraram uma única vez na fila. Para conhecimento, a execução órfã deve estar `cancelled` com `reconciliationManifestHash`; uma nova execução só nasce quando o worker consumir o job estável.
10. Execute novamente o mesmo comando `--apply`. O resultado esperado é `handled: 0` para os itens já concluídos e nenhum job adicional.
11. Processe o restante repetindo o mesmo manifesto e o mesmo hash. O comando pula itens concluídos antes de consumir o limite.

## 2. Critérios para liberar produção

A execução em produção só pode ser aprovada quando o relatório do ensaio apresentar:

- quantidade por classe antes e depois;
- destino e motivo para cada registro;
- zero reabertura de missão cancelada e zero reenvio de conversa/mensagem;
- zero chamada externa causada pela reconciliação genérica;
- IDs dos jobs novos e comprovação de identidade estável;
- divergências de versão marcadas como `skipped`, nunca forçadas;
- repetição do manifesto sem novo job, nova transição ou novo resultado;
- confirmação de que os checkpoints de aprendizado usam `approval.created_at` e que o SQL de campanha corrigido passou no mesmo build implantado.

## 3. Execução em produção

1. Abra a janela de mudança com responsável e hash do artefato implantado.
2. Gere um manifesto novo diretamente contra produção, ainda em `--dry-run` e com `--limit 20`.
3. Compare a contagem por classe com o ensaio e investigue qualquer classe inesperada antes de aprovar.
4. Aprove o hash exato e aplique inicialmente com `--limit 5`.
5. Observe banco, filas e provedores. Efeitos externos desconhecidos permanecem no fluxo próprio de reconciliação do provedor.
6. Complete o mesmo manifesto em lotes pequenos, validando os deltas entre lotes.
7. Gere um novo manifesto somente depois de concluir o anterior. Itens já tratados na mesma versão não reaparecem.

## Interrupção e compensação

- Interromper o processo não exige rollback global. Itens concluídos permanecem auditados; itens `pending` podem continuar com o mesmo manifesto.
- Se a fila ficar indisponível depois do cancelamento de uma curadoria órfã, o marcador no registro permite que a repetição do mesmo manifesto agende o mesmo `jobId` sem cancelar outra vez.
- Se o estado ou a versão mudou, o item termina `skipped`. Gere outro `--dry-run`; não altere `expectedVersion` manualmente.
- Um item `failed` exige investigação e novo manifesto. Não apague a linha de auditoria e não transforme seu status via SQL.
- Compensações de efeitos externos seguem a trilha e o reconciliador do provedor. Este comando nunca infere sucesso por ausência de erro e nunca dispara novamente um efeito de resultado desconhecido.

## Estado histórico de 05/09/2026

O inventário que motivou este procedimento incluía um PDF marcado como enviado sem documento, execuções de inteligência paradas desde 05/08, curadoria degradada, jobs falhos, conversa aguardando usuário e missão cancelada. Esse inventário é entrada de investigação, não autorização para alterar produção. A classificação efetiva deve sempre vir do manifesto gerado contra o estado atual.

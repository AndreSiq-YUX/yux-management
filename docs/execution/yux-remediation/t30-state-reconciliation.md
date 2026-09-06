# T30 — Reconciliação segura do estado histórico

Data da implementação e do ensaio: 2026-09-06. A tarefa entrega o mecanismo e a prova isolada; nenhuma reconciliação foi executada em produção.

## Resultado

O comando `backend/scripts/reconcile-audit-state.ts` começa em leitura, limita o lote a no máximo 20 e gera um manifesto com identidade do banco, corte temporal, hash global e hash individual. O modo de aplicação exige o arquivo intacto, o `manifestHash` aprovado e um limite explícito. Banco, versão e payload da fila são conferidos novamente imediatamente antes de agir.

O histórico fica em `state_reconciliation_manifests` e `state_reconciliation_items`. A identidade do manifesto e do item é imutável; resultados concluídos não podem ser reescritos e os dois registros recusam exclusão. Cada item persiste destino, motivo, estado observado, risco de efeito externo, resultado e horário.

## Tratamento por classe

- Upload antigo sem documento ou bytes: vira falha recuperável no mesmo registro, com o próprio ID como origem de recuperação. O fluxo corrigido recebe os novos bytes; nome de arquivo nunca é tratado como conteúdo.
- Curadoria `queued`/`running` órfã: somente retoma quando documento, fonte e versão continuam iguais. Arquivo exige bytes, tamanho e SHA-256 correspondentes; origem manual exige corpo persistido; URL exige origem persistida. A execução órfã é cancelada com marcador do manifesto e um job estável é agendado.
- Curadoria degradada, execução de agente falha, conversa aguardando usuário e missão cancelada: o estado de domínio permanece intacto e o destino é decisão humana.
- Efeito externo desconhecido: o manifesto aponta para o reconciliador específico do provedor; o comando genérico não repete a chamada.
- Learning antigo: somente ganha novo job quando ainda existe missão terminal elegível sem memória. O código atual consulta `approval.created_at`, removendo a causa histórica `approval.requested_at`.
- Checkpoint antigo: somente ganha novo job quando identifica a missão e ela continua ativa, autônoma e com concessão vigente. Jobs genéricos ou missões inelegíveis permanecem para revisão.
- Conversa ou mensagem antiga em fila: nunca é reenviada pelo simples fato de o job estar falho.

## Ensaio isolado

O teste de integração construiu uma fotografia histórica controlada com:

- dois uploads sem bytes, incluindo uma alteração concorrente após o manifesto;
- uma curadoria órfã com arquivo real e hash válido;
- uma execução de agente falha;
- uma conversa `awaiting_user`;
- uma missão `cancelled`;
- um job histórico de learning com candidato ainda elegível.

O primeiro lote tratou cinco itens e deixou o manifesto `partially_applied`. A continuação tratou o restante e encerrou como `applied`. O upload concorrente terminou `skipped`; o outro permaneceu recuperável. A curadoria recebeu um único job, o learning recebeu um único job e os três estados que exigiam decisão humana não mudaram. A terceira aplicação do mesmo manifesto retornou `handled: 0` e não criou job adicional. Um hash aprovado diferente e um manifesto adulterado foram recusados.

## Verificação

- Type-check e build do backend aprovados.
- 160 arquivos e 655 testes unitários/de contrato do backend aprovados localmente.
- O ambiente local não possui PostgreSQL/Redis de integração; a tentativa local foi recusada por conexão indisponível antes de executar o cenário.
- PostgreSQL e Redis isolados: cenário `reconciliation.test.ts` aprovado no job Backend integration do GitHub Actions.
- Aceite persistente: execução GitHub Actions `34057271273`, commits `b3be958` e `bf87441`. Backend, Backend integration, Frontend, Agent Runtime e as três imagens com SBOM concluíram com sucesso.

## Produção permanece bloqueada por procedimento

A fotografia de 05/09 foi usada para definir e ensaiar as classes, não como ordem de mutação. A recoleta atual, a comparação antes/depois e o primeiro lote real só podem ocorrer na janela operacional descrita no runbook, depois de ensaio com restauração recente e Redis isolado. Sem essa etapa e sem aprovação explícita do hash gerado contra produção, `--apply` não deve ser executado.

O retorno é por entidade e preserva a trilha: interromper deixa itens concluídos registrados e itens pendentes retomáveis com o mesmo manifesto. Não se limpa a fila inteira e não se restaura banco antigo sobre operações comerciais novas.

# Rollout de filas YUX

## Topologia inicial

| Classe | Fila | Concorrência por processo | Uso |
|---|---|---:|---|
| interactive | `yux-interactive` | 2 | eventos, entrada omnichannel, decisões e comandos com resposta humana |
| ingestion | `yux-ingestion` | 1 | descoberta de site, curadoria, embeddings e análise do Radar |
| external | `yux-external` | 2 | provedores, notificações e mutações externas |
| maintenance | `yux-maintenance` | 1 | retenção, métricas, expiração e schedulers |

O alvo de referência para a fila interativa é p95 de espera inferior a 5 segundos quando a ingestão está saturada. É uma meta de capacidade, não um timeout que descarta mensagens. As chamadas Jina têm deadline local inicial de 15 segundos e o job conserva seu deadline total do registro.

Os processadores externos e de ingestão serializam localmente trabalhos da mesma organização/provedor. Não aumentar réplicas nem concorrência acima dos valores desta tabela sem implantar e medir um limitador distribuído equivalente. O teste automatizado prova isolamento das filas e identidade estável; CPU e memória da VPS devem ser registradas no ensaio operacional antes de qualquer aumento.

## Transição sem produção dupla

1. Implantar a API que produz exclusivamente nas quatro filas novas.
2. Manter apenas o worker interativo com `YUX_DRAIN_LEGACY_QUEUE=true` para consumir `yux-jobs`; nenhum produtor novo escreve nessa fila.
3. Subir um worker para cada classe. Somente o worker de manutenção usa `YUX_SCHEDULER_ENABLED=true`.
4. Confirmar que `waiting`, `active`, `delayed` e `prioritized` da fila legada chegaram a zero durante uma janela completa do maior delay conhecido.
5. Desativar `YUX_DRAIN_LEGACY_QUEUE` e observar uma segunda janela antes de remover o consumidor legado.

Se for necessário retornar, a API pode voltar temporariamente ao release anterior e os consumidores das filas novas devem permanecer ativos até drená-las. Nunca produza a mesma identidade simultaneamente na fila antiga e na nova.

## Scheduler e reinício

Todos os processos tentam um advisory lock PostgreSQL de sessão, mas apenas o detentor inicia timers comerciais. Escalar workers não multiplica schedulers. Em encerramento normal o lock é liberado; em queda da conexão o PostgreSQL o libera automaticamente. IDs de janela e de intenção continuam estáveis após reinício.

## Evidência mínima do piloto

- espera e processamento por classe, separados;
- p50/p95/p99, profundidade e idade do item mais antigo;
- CPU e memória por worker;
- jobs terminais, stalled/reclaimed e efeitos em reconciliação;
- contagem da fila legada antes de desativar o dreno.

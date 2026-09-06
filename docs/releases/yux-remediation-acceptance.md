# T32 — Registro final de aceite da correção integrada

Atualizado em 2026-09-06. Estado: **bloqueado; nenhum piloto implantado**.

## Identidade preparada

- Branch candidata: `codex/yux-remediation-integrated`.
- Aceite técnico: commit `8d759a2cd1bb8ff92e1291865709ec4ecb4f6a29`.
- GitHub Actions: execução `34065960262`, oito jobs aprovados; J1–J7 técnicos
  passaram e a integração persistente passou 23 arquivos/33 testes.
- Preparação T32: commits `6e8191b` e `d066704`; execução `34067099016`
  aprovada nos oito jobs. O segundo commit adicionou uma única repetição para
  falha transitória do instalador de SBOM, mantendo a segunda falha bloqueante.
- Manifesto: `docs/releases/yux-remediation-manifest.json`, validado na CI.
- Release implantável: ainda sem commit final, digests, hash final do manifesto,
  backup restaurado ou organizações aprovadas.

## Gates de liberação

| Gate | Estado | Evidência presente | Falta para aceite |
| --- | --- | --- | --- |
| Backup restaurado | não executado | runbook e ativos obrigatórios definidos | restauração recente identificada e validada |
| Migrations verificadas | não executado no alvo | inventário de 70 arquivos e hash agregado na CI | histórico/checksums e logins mínimos no alvo |
| Matriz de tenants | não executada no piloto | regressão persistente técnica aprovada | repetir contra as imagens/DB do piloto |
| Contratos | não executado nas imagens publicadas | geração e testes técnicos aprovados | smoke entre digests implantados |
| Jornadas | parcial | sete jornadas técnicas aprovadas | IDs/efeitos completos J1–J6, sandbox e três sessões moderadas |
| Qualidade estratégica | bloqueado | infraestrutura T22 aprovada | orçamento OpenRouter autorizado e dois avaliadores cegos |
| Reconciliação histórica | ensaio isolado aprovado | mecanismo T30 e CI aprovados | `--dry-run` em restauração recente e, depois, janela aprovada |

## Registro operacional a preencher sem dados pessoais

| Campo | Valor |
| --- | --- |
| Commit da release | pendente |
| Digest backend | pendente |
| Digest frontend | pendente |
| Digest Agent Runtime | pendente |
| SHA-256 do manifesto final | pendente |
| Commit estável anterior | pendente |
| ID do backup e restauração | pendente |
| UUID do workspace interno | pendente |
| UUID da organização piloto | pendente |
| Janela de início/fim | pendente |
| Integrações sandbox selecionadas | pendente |
| Rotinas essenciais observadas | pendente |
| Decisão final e responsáveis | pendente |

## Critério de encerramento

T32 só muda para `aceita` depois de: versão identificável em todos os serviços;
todos os gates obrigatórios em `passed`; 24 horas e uma amostra de cada rotina
essencial; ausência de falha bloqueante; e resposta operacional conhecida para
cada alerta. Funcionalidade deliberadamente indisponível deve permanecer
desligada com sua alternativa registrada, sem ser apresentada como concluída.

Até lá, o manifesto permanece `blocked`, as organizações ficam vazias e as
flags de efeitos novos permanecem desligadas. Este registro não autoriza acesso
à produção, consumo pago ou contato externo.

# Radar adaptativo e Perplexity — verificação de entrega

Data: 20/10/2026. Revisão final sequencial pelo executor, sem revisão independente. Alterações no worktree isolado; checkout principal e suas alterações não relacionadas preservados.

## Resultado implementado

- OpenRouter Decisions com principal/reservas, protocolo próprio e calibração por modelo/versão, sem herdar chat.
- Perplexity Search e Agent com credencial própria, configuração exclusiva no Admin global, retenção/entrega autorizadas e desativados por padrão.
- Agent com um modelo por requisição, tentativas separadas, recibos brutos, recuperação gratuita e orçamento estimado acompanhado. Uma chamada em andamento pode superar a estimativa; o bloqueio impede novas chamadas. Gasto original USD não é zerado ao mudar o câmbio; conversões BRL preservam o snapshot.
- Descoberta adaptativa v2 com meta de empresas aderentes novas, fontes/quota independentes, páginas e excedentes preservados e admissão transacional. Aprofundamento em turnos duráveis; retomada recupera efeitos salvos, não repete cobranças incertas.
- Resultados comerciais sem ferramentas, custos ou diagnósticos internos; resumo inline e layout móvel. Exportação/CRM verificam direitos de origem, sem apagar obrigações de atribuição.

## Evidências locais

| Verificação | Resultado |
| --- | --- |
| Backend geral | 245 arquivos; 1.287 testes aprovados; 126 opt-in não executados nesta suíte |
| Frontend geral | 213 arquivos; 1.165 testes aprovados |
| Runtime Python | 362 aprovados; 7 opcionais não executados |
| PostgreSQL isolado | 19 arquivos; 108 aprovados; inclui worker restrito e percurso backend→HTTP runtime→banco |
| Navegador desktop/móvel | 18 jornadas aprovadas: 10 Admin Decisions/Agent e 8 comerciais nos quatro papéis |
| Builds/tipos/bundle | Aprovados |
| Lint comparativo | 547 erros/25 avisos; baseline 560/27. Dívida preexistente permanece |
| Migrações | Banco limpo e banco de pesquisa até 0227; manifesto de 124 arquivos verificado |

Os conjuntos se sobrepõem; não somar esses números como testes independentes. Provedores e filas externos foram simulados, sem consultas pagas. O cenário de worker encontrou 23 empresas, preservou três fora do perfil e concluiu 20 aderentes, com no máximo um novo efeito por turno. Isso valida coordenação/recuperação, não precisão de modelos reais ou saldo externo.

## Rulings e limites explícitos

1. Mantida a stack Fastify/Python/React; sem migração de SDK/framework. Adaptadores próprios continuam sendo mantidos pelo projeto.
2. Execução e revisão sequenciais conforme plano; ausência de revisor independente é uma limitação da verificação.
3. O usuário autorizou orçamento estimado monitorado para Agent, substituindo a exigência anterior de teto remoto garantido. Estimativa não é garantia financeira do provedor.
4. O catálogo geográfico é local/cacheado e parcial; não houve importação nacional IBGE. Ausência de cobertura não significa mercado esgotado. Fontes estaduais continuam disponíveis.
5. O comando técnico OSM legado foi preservado; a descoberta v2 usa paginação por snapshot/tipo/ID, mapeamento e idade configuráveis.
6. Identidade ambígua permanece para revisão. Não foi criado um executor geral de consulta fiscal paga por nome isolado.
7. Os 100 espaços do benchmark permanecem sem rótulos humanos reais. Gate estatístico de modelos **não avaliado**; não há ganho de precisão comprovado por fixtures. Calibração e piloto continuam separados da publicação.
8. Nenhuma fonte, chave, rota paga, pesquisa real ou contato foi ativado/executado. Configuração e piloto exigem ação/autorização próprias.
9. O usuário ordenou publicação em main sem exigir backup nesta implantação. Isso não comprova backup existente nem muda a política permanente. Migrações são aditivas; rollback deve preservar recibos e manter lotes v2 em espera com executor compatível.

## Operação após deploy

O primeiro deploy de `2d68352` falhou na compilação, antes de substituir os serviços: um teste importava estaticamente a fixture JSON pelo diretório pai do repositório, inexistente no layout Docker. O teste `docker-contract-build.test.ts` reproduziu o mesmo erro TypeScript; a fixture passou a ser lida em execução nos layouts de repositório/Docker, sem mudar código produtivo nem relaxar a compilação. A correção recebe novo commit e novo deploy; a primeira tentativa não deve ser registrada como implantação bem-sucedida.

Seguir [o runbook de configuração](../runbooks/radar-pesquisa-configuravel.md). Publicação, deploy, configuração e piloto são estados distintos. Conferir o novo commit no Dokploy e os controles realmente servidos antes de informar implantação concluída. O manifesto geral de remediação continua bloqueado para gates operacionais mais amplos; este relatório não os aprova por simulação.

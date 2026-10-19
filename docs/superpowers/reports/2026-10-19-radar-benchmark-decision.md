# Comparação de decisões do Radar

Decisão de escopo: **inconclusiva**. A rota atual permanece em produção; a preparação offline não comprova superioridade de Jev, Luna Decisions ou de uma nova fonte. Não habilitar descartes automáticos nem trocar modelos por este relatório.

## Estado da avaliação

O conjunto tem 100 vagas de coleta, todas pendentes de evidências e revisão humana. O planejamento mantém 60 casos para ajuste e 40 para validação, com 30 aderentes, 30 fora do perfil e 40 que exigem investigação. Positivos e descartes exigem segunda revisão independente; grupos empresariais não podem atravessar as partições. Nenhum resultado foi atribuído ao usuário ou a revisores fictícios.

A infraestrutura offline valida contexto textual limitado, respostas estruturadas, citações, distribuição de probabilidades, identidade do modelo, consumo informado e ausência de repetição automática. A confiança escrita pela rota chat não vira probabilidade calibrada. O exemplo de contrato guardado é documental da [API Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request), não uma resposta obtida pelo Radar.

## Medidas preparadas

O avaliador de descoberta separa links e menções de diretório, identidades verificadas, empresas aderentes novas, estabelecimentos do mesmo grupo, interseção e contribuição exclusiva de cada fonte. Mede contato útil, completude, latências e custo estimado em reais, preservando moeda e cotação. Custo ausente ou incerto não é tratado como gratuito. OSM sem snapshot é indisponibilidade, não ausência de empresas. Nenhuma fonte foi comparada em campo nesta etapa.

## Condições para decidir

Antes da integração de decisões em produção, concluir a revisão humana, congelar dados/contexto e autorizar os modelos exatos e o orçamento do ensaio. O comando de preparação recusa chamadas pagas enquanto o gate de dados e orçamento estiver incompleto. A execução real e o congelamento do relatório continuam pendentes.

Na validação, exigir nenhum falso descarte dos positivos confirmados, contato de terceiro, vazamento técnico ou repetição de efeito incerto. Em empate de qualidade e abstenção, manter a rota atual se não houver ganho de pelo menos 20% em custo total ou latência p95 sem regressão da outra medida. Melhorias relevantes de classificação podem justificar evolução após revisão do responsável pelo produto. Mesmo um resultado favorável não autoriza descarte automático e uma amostra pequena não prova erro zero no mercado.

As correções de recuperação A continuam independentes. A infraestrutura de roteamento B fica condicionada à comparação real; pesquisa adaptativa C poderá usar a decisão estruturada atual.

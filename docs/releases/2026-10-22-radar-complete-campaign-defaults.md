# Radar completo por padrão — entrega local

Data: 22/10/2026. Base: `81b839aa29db2ffad24378731bb8c9c00253225d`.
Branch: `codex/radar-same-lot-completion`. Execução direta e autorrevisão, sem revisão independente por subagentes.

## Alterações

- Novas campanhas recebem descoberta adaptativa, funil, pesquisa web, identificação, qualificação comercial, perfil, redes públicas, leitura e aprofundamento seletivo habilitados. Não há dependência da Villeman nem de um segmento fixo.
- Os defaults de criação são separados do parser de leitura/edição. Configurações explicitamente escolhidas pelo Admin são respeitadas; campanhas existentes não são reativadas ou migradas ao abrir a tela.
- Criação padrão e rápida por cidade usam o mesmo fluxo configurável. Recém-abertas começa com período de 30 dias, editável. Tipos legados existentes continuam suportados por compatibilidade.
- Duplicação cria cópia com etapas completas e sem herdar autoridade de calibração. Uma origem local legada gera cópia regional com a mesma cidade, preservando a original. Filtros e capacidade são mantidos, mas não resultados, recibos, cursores ou aprovações.
- G1/G5 começam em observação, não em descarte automático não calibrado. G0 determinístico e G3 efetivo permanecem ativos; investigação profunda é seletiva, não uma obrigação de comprar todas as ferramentas para toda empresa.
- O atalho local deixou de impor máximo fixo de 10 consultas/dia: usa a política do Admin. O botão adaptativo deixou de exigir CNPJá quando outra fonte elegível pode atender; o preflight continua validando disponibilidade real.
- [Guia funcional](../knowledge/radar-commercial-action-engine.md) e [referência técnica exclusiva de Admin](../radar-commercial-execution-reference.md) escritos e ligados aos documentos do Action Engine. Não foram ingeridos/publicados no conhecimento da IA e não registram capacidades executáveis.

## Capacidade e escopo dos limites

Não foi encontrado teto de produto de dez campanhas nem de cem empresas por campanha. Dez campanhas de cem empresas são possíveis em princípio, sujeitas a cobertura, tempo, saldo, configuração e orçamento; não constituem garantia de mil empresas aderentes ou de execução no mesmo dia.

- O teto global do Admin limita os valores configuráveis, não é um contador único de empresas de todos os clientes.
- A cota diária de uma fonte é somada por organização + fonte + data, abrangendo suas campanhas.
- O limite diário da campanha é atualmente verificado por campanha + fonte + data. O orçamento da campanha é cumulativo entre fontes/dias; reservas continuam relevantes.
- Carteira de IA pertence ao contrato. Conta/chave do fornecedor pode ser compartilhada entre organizações e seu saldo externo pode afetar a plataforma.
- Concorrência e filas compartilham infraestrutura. Não são um teto total do lote.

Entre limites fixos de profundidade, a janela de leitura de 110 segundos e o timeout de 8 segundos por requisição merecem atenção para sites lentos. É uma avaliação técnica, não um benchmark que prove ser o maior gargalo em todos os segmentos. Cortes de contexto/evidência também podem reduzir qualidade, mas não impõem um máximo de cem resultados. Inventário completo no [diagnóstico anterior](../audits/2026-10-22-radar-limits-action-engine.md).

## Verificação

Falhas observadas antes das correções: criação com etapas false; POST parcial preenchendo defaults legados antes do repositório; atalho usando tipo antigo; cópia herdando enforce sem calibração; máximo fixo 10; botão dependente da fonte cadastral. Regressões correspondentes passaram após a implementação.

- Backend completo: 1.483 aprovados, 126 ignorados opcionais; 273 arquivos aprovados e 5 ignorados. Após o ajuste final de tipagem do estado, build e os 12 testes de configuração passaram novamente.
- Frontend completo: 1.195 aprovados em 219 arquivos, com quatro workers. Uma execução concorrente anterior teve três timeouts em verificações globais de texto/cores; a repetição completa com concorrência limitada passou, sem alterar expectativas ou timeouts.
- HTTP/PostgreSQL isolado: 28 testes de audiência, criação e isolamento aprovados. Cobertura de Admin YUX, operador, Admin da conta e membro; nenhum fornecedor/fila real acionado na criação.
- PostgreSQL isolado: mais 71 testes de limites, capacidade e continuação aprovados. O banco descartável foi encerrado após a execução; nenhuma conexão de produção foi utilizada.
- Builds/type-checks de backend e frontend aprovados; orçamento de bundle frontend aprovado. `git diff --check` sem erros. Avisos existentes de Vite, React/act e pg não foram tratados como prova de falha funcional nem removidos desta entrega.

## O que não foi executado

Sem push, merge na main, deploy, novo lote real, chamadas pagas, ingestão/embeddings, alterações de cotas/créditos ou campanhas em produção. Não houve teste de carga de mil empresas nem verificação visual no navegador nesta entrega. Fontes, licenças, rotas e saldo de cada organização ainda precisam estar disponíveis: defaults completos não os substituem. Integração executável do Action Engine e evolução de leads/CRM pertencem à outra frente solicitada pelo usuário.

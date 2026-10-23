# Missões — recuperação de API e clareza da aprovação

**Goal:** Recuperar envios durante indisponibilidade temporária sem duplicar mensagens; conservar Projetos e esclarecer a decisão pendente.

**Architecture:** Partir de main integrado com `0f258c3` e `7cba84f`. Esperar prontidão real da API antes do frontend no Compose. Repetir somente o envio idempotente de mensagem, com o mesmo payload/UUID e tentativas limitadas. A apresentação do plano não altera seu conteúdo assinado nem aprova efeitos.

**Tech Stack:** Docker Compose, Node/Fastify, React/TypeScript, Vitest.

**Spec:** Solicitação do usuário e prints de 23/10/2026. Manter trabalho paralelo de Projetos e a base compartilhada do Harness.

## Restrições

- Não alterar o checkout primário ou arquivos locais de Projetos.
- Não executar pesquisa, contato, aprovação de plano ou nova chamada paga para testar.
- O 502 do print é evidência; a origem histórica exata não pode ser afirmada sem logs do container anterior.
- Preservar texto/UUID após falha, autorização, concorrência e idempotência.
- A homologação é registro de teste existente, sem execução de ações; não aprová-la nem apagá-la.

## Tarefas

1. [x] Comparar commits e integrar main por fast-forward; conferir versão em produção, conversa e missão.
2. [x] Testar e exigir API saudável antes de iniciar frontend, usando o endpoint de prontidão existente.
3. [x] Testar 502/503/504 e falha de conexão no envio idempotente: até quatro tentativas, esperas 1/2/4 s, UUID/payload constantes. Falhas definitivas de validação, permissão ou rollout não devem ser repetidas.
4. [x] Preservar rascunho após esgotar tentativas e apresentar mensagem em português para indisponibilidade temporária.
5. [x] Corrigir status de plano pendente; traduzir os dois efeitos do Radar já persistidos e explicar a aprovação específica da pesquisa, preservando o subject hash.
6. [x] Validar serviços/integração e interface no navegador com falhas simuladas; conferir regressões de Projetos, tipos e build.
7. [x] Atualizar main, publicar e conferir API saudável, estado da missão e manutenção das publicações comuns.
8. [x] Corrigir e validar a atualização periódica dos detalhes: não consultar abas ocultas, não sobrepor ciclos lentos, tratar falhas e reduzir a frequência enquanto aguarda decisão humana.

## Revisão

- Resposta perdida após commit não pode gerar outro UUID/mensagem/efeito.
- Um 403/409 ou gate desligado não pode sofrer repetição automática.
- Um serviço não pronto não pode liberar o frontend como se o backend já estivesse atendendo.
- Os rótulos comerciais não podem alterar a autorização assinada ou esconder uma pesquisa paga.
- A integração não pode descartar commits de Projetos nem tocar seu trabalho não commitado.

## Evidência após a primeira publicação

`0eadfe339d1e14665b7ab41978fd51143053347a` publicado em 23/10/2026. Dokploy confirmou a API saudável antes da partida do frontend. Prontidão interna e pública: 200. Migration 0239 de Projetos e módulo de validação presentes; guia comum do Radar recuperou oito fontes; heartbeats recentes das quatro classes de workers. A homologação manteve versão 14, uma aprovação de plano e zero ações. Tela real confirmou os rótulos comerciais e status corrigido.

A checagem no navegador revelou também rejeição não tratada da atualização periódica com 429. O detalhe fazia 12 consultas a cada cinco segundos mesmo aguardando decisão ou em aba oculta; várias abas aumentam a carga. Essa ocorrência é distinta do 502 histórico e motivou a tarefa 8. Não aumentar o limite global da API para encobrir o excesso de consultas.

Validação do complemento: quatro testes do ciclo de atualização (cadência, visibilidade, pausa, requisição lenta, falha/recuperação e limpeza) e teste no navegador com falha simulada seguida de recuperação para a próxima versão. A correção conserva os dados anteriores e não interfere em autorizações ou execução de ações.

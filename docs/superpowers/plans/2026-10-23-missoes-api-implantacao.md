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
7. [ ] Atualizar main, publicar e conferir API saudável, estado da missão e manutenção das publicações comuns.

## Revisão

- Resposta perdida após commit não pode gerar outro UUID/mensagem/efeito.
- Um 403/409 ou gate desligado não pode sofrer repetição automática.
- Um serviço não pronto não pode liberar o frontend como se o backend já estivesse atendendo.
- Os rótulos comerciais não podem alterar a autorização assinada ou esconder uma pesquisa paga.
- A integração não pode descartar commits de Projetos nem tocar seu trabalho não commitado.

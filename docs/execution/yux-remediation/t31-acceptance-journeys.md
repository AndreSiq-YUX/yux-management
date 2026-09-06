# T31 — Jornadas completas e experiência de uso

Data da implementação inicial: 2026-09-06.

Execução técnica persistente concluída: 2026-09-06, commit `8d759a2`, GitHub Actions `34065960262`.

## Resultado implementado

Foi criada uma suíte Playwright com sete cenários nomeados J1–J7. Ela sobe a aplicação sobre PostgreSQL e Redis isolados, usa a API real, processa filas com o worker real, confirma a saúde do runtime Python e publica conteúdo contra o provedor controlado usado nas integrações. Cada cenário anexa um registro JSON com checks, IDs sanitizados, horário e gates ainda ausentes.

A CI agora possui o job `Acceptance journeys`. O relatório HTML/JSON, traces, screenshots, vídeos e logs de falha são guardados no artefato `yux-acceptance-evidence`. A execução é serial para impedir concorrência acidental sobre as fixtures e não usa retry automático: uma falha parcial não é mascarada por repetir o cenário sobre estado já alterado.

## Escopo demonstrado

- J1: perfil e fonte persistidos, worker executado, documento indexado e refresh recuperado.
- J2: runtime Python saudável; item curado ligado a um documento PDF controlado, revisão, publicação imutável com hash e binding ativo.
- J3: tarefa canônica ligada ao lead, conclusão única com evidência/minutos e remoção da fila após refresh.
- J4: campanha Radar persistida no workspace interno YUX correto.
- J5: campanha, conteúdo e versão ligados; revisão e aprovação; intenção processada pelo worker; exatamente uma chamada ao provedor controlado e ID remoto persistido.
- J6: webhook Meta assinado, mensagem persistida, handoff, resolução e recuperação após refresh.
- J7: troca administrativa A/B sem contexto obsoleto e leitura/escrita cruzada negada ao membro de A.

## Estado honesto do aceite

J7 está completa no escopo automatizado. J1–J6 continuam parciais porque as etapas obrigatórias ainda não foram demonstradas em um único traço de ponta a ponta. As integrações isoladas existentes cobrem as partes faltantes como regressão, mas não são contabilizadas como jornada completa.

Também permanecem pendentes:

- repetição das integrações selecionadas em sandbox oficial;
- T22/OpenRouter, avaliação cega e teto de custo autorizado;
- três testes moderados com usuários representativos;
- ligação única de todos os IDs exigidos para J1–J6.

O protocolo, a matriz, os comandos e a planilha sanitizada dos participantes estão em `tests/journeys/yux-acceptance.md`. Nenhuma liberação total deve usar esta entrega como aprovação antecipada da T31.

## Verificação local

- Type-check, build e 657 testes do backend aprovados.
- Type-check, build, orçamento de bundle e 562 testes do frontend aprovados.
- Playwright descobriu exatamente sete cenários no projeto Chromium.
- O host local não possui Docker; por isso a execução persistente integral foi encaminhada ao runner isolado do GitHub Actions.

## Verificação persistente

A execução GitHub Actions `34065960262` terminou em `success` no commit `8d759a2`. Passaram os oito jobs: Backend, Backend integration, Frontend, Agent Runtime, três análises/SBOM de imagens e `Acceptance journeys`. O job de aceitação executou J1–J7 em série e encerrou com sete cenários aprovados.

As execuções anteriores foram preservadas e usadas como diagnóstico, sem retry sobre estado parcialmente alterado. Elas revelaram e levaram à correção de CORS para `PUT/PATCH/DELETE`, propagação do contexto RLS durante todo o ciclo assíncrono da requisição, comparação otimista de timestamps na precisão exposta pela API, atualização de publicação sem desmontar o diálogo e separação entre a prova de webhook/handoff manual e a resposta autônoma ainda não aceita.

Este sucesso fecha o gate técnico automatizado de T31, mas não muda o estado honesto das jornadas: J1–J6 ainda carregam os `remainingGates` descritos acima. Sandbox oficial, T22 paga/cega e os três testes moderados continuam obrigatórios antes do aceite integral e de qualquer liberação total.

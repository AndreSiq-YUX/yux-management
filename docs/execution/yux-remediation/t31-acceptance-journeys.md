# T31 — Jornadas completas e experiência de uso

Data da implementação inicial: 2026-09-06.

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

- Type-check e build do backend aprovados.
- Type-check e baseline de lint do frontend aprovados.
- Playwright descobriu exatamente sete cenários no projeto Chromium.
- O host local não possui Docker nem as dependências completas do runtime Python; por isso a execução persistente integral foi encaminhada ao runner isolado do GitHub Actions.

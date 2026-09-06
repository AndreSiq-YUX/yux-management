# T28 — Auditoria de dependências e imagens

Data da coleta: 2026-09-06. O inventário representa os locks e imagens candidatos do commit de T28; novas publicações de segurança exigem nova execução, mesmo sem alteração dos manifests.

## Resultado por alcance

| Escopo | Resultado | Tratamento |
| --- | --- | --- |
| Backend Node, produção e desenvolvimento | 0 vulnerabilidades conhecidas | Fastify e sanitize-html atualizados; fast-uri, nanoid e xmldom renovados no lock. |
| Frontend, dependências de produção | 0 high/critical; 2 moderate | Axios, TipTap, React Router 6 e transitivas atualizados sem mudança de contrato principal. |
| Frontend, ferramentas de desenvolvimento | 1 high; 3 moderate | O high está no servidor Vite de desenvolvimento e não entra na imagem Nginx de produção. O gate de produção usa `--omit=dev --audit-level=high`. |
| Runtime Python, produção | 0 vulnerabilidades conhecidas | `pip-audit 2.10.1` sobre `requirements.lock`. |
| Imagens finais | 0 high/critical no runtime; gate e SBOM CycloneDX na CI | As três imagens são construídas de bases fixadas por versão e digest, analisadas por Grype e recebem SBOM como artefato da execução. O aceite persistente é a execução `34054082691`. |

## Reprodutibilidade

- Node 22.23.2 é usado na CI e nas imagens. Duas instalações com `npm ci` produziram árvores idênticas no backend e frontend; duas compilações consecutivas produziram o mesmo conjunto de arquivos e hashes.
- Python 3.13 é a linha única e a CI fixa o patch 3.13.15. Produção, desenvolvimento e tooling possuem locks separados, com versões transitivas e hashes. Os locks foram gerados por `pip-tools 7.6.1`; instalação limpa com `--require-hashes`, `pip check` e 189 testes passou.
- As bases finais são `node:22.23.2-alpine`, `python:3.13.15-alpine3.24` e `nginx:1.30.4-alpine-slim`, sempre acompanhadas do digest OCI observado nesta coleta. OpenSSL e `libuuid` são fixados nas revisões corrigidas; npm/npx não permanecem no runtime Node.
- O gate de imagem conserva o relatório JSON e transforma cada high/critical em anotação com advisory, pacote, versão instalada e correção disponível. Assim, uma falha não perde a evidência necessária para tratamento.
- O frontend possui baseline de lint por arquivo, regra, mensagem e severidade. O gate recusa contagem total maior ou qualquer assinatura nova; atualizar a baseline é um comando explícito e separado.

## Riscos residuais e prazo

1. React Router 6.30.6 conserva dois avisos moderados. Um envolve hidratação SSR, que não existe neste frontend SPA; o outro envolve redirecionamento quando um destino não confiável chega a `Link`/`navigate`. Os fluxos de correção críticos usam mapa fechado e UUID validado. A correção publicada exige React Router 7 e será tratada em lote de migração com testes de navegação até 2026-09-30; `audit fix --force` permanece proibido.
2. Vite 5.4.21 conserva um high e dois moderates no servidor de desenvolvimento. Ele é dependência de desenvolvimento, escuta em localhost por padrão, só participa do build e não é copiado para a imagem final Nginx. A migração conjunta Vite 8/plugin React/configuração, que é breaking, deve ser concluída até 2026-09-30.
3. O baseline legado contém 560 erros e 27 avisos fora dos arquivos críticos já corrigidos. T28 impede aumento e não converte dívida antiga em aprovação. A redução deve ocorrer por área funcional, sem suppressions genéricas; cada baseline menor substitui a anterior.

## Comandos de renovação

```powershell
npm --prefix backend audit --omit=dev --json
npm --prefix frontend audit --omit=dev --json
py -3.13 -m piptools compile --generate-hashes --strip-extras --output-file requirements.lock requirements.txt
py -3.13 -m piptools compile --generate-hashes --strip-extras --output-file requirements-dev.lock requirements-dev.txt
py -3.13 -m piptools compile --allow-unsafe --generate-hashes --strip-extras --output-file requirements-tooling.lock requirements-tooling.txt
```

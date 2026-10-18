# Harness de capturas visuais do portal do cliente

Tira capturas de todas as telas do portal em 4 larguras, sem backend e sem runtime de agentes.
Todas as chamadas `/api/**` sao respondidas por fixtures de uma cliente ficticia
(**Clinica Sorriso Pleno**, usuaria **Mariana Costa**, papel `client_admin`, pacote **Growth Comercial**,
todos os modulos habilitados). Nenhuma chamada externa/paga e feita (ver `AGENTS.md`).

## Como rodar

```bash
cd frontend
npx playwright test -c playwright.visual.config.ts
```

- Usa o **Microsoft Edge do sistema** (`channel: 'msedge'`); nenhum navegador do Playwright e baixado.
- Sobe sozinho `npm run dev -- --host 127.0.0.1 --port 4180` com `VITE_API_BASE_URL=/api`
  (reaproveita o servidor se ja estiver rodando).
- Rodada completa: 34 rotas x 4 larguras (390x844, 768x1024, 1280x800, 1440x900) + `menu-open__390.png`.
  Leva alguns minutos (a primeira carga do Vite e mais lenta).

Filtros opcionais (variaveis de ambiente):

```bash
VISUAL_WIDTHS=1440,390 npx playwright test -c playwright.visual.config.ts     # so algumas larguras
VISUAL_ONLY=leads,financeiro npx playwright test -c playwright.visual.config.ts   # so rotas que contem o trecho
VISUAL_ONLY=portal ...                                                          # somente a home /portal
```

No Git Bash nao use valores comecando com `/` (o shell converte para caminho do Windows).
Rodadas filtradas gravam `unmatched-requests.partial.txt` e nao sobrescrevem `unmatched-requests.txt`;
o `report.json` e sobrescrito (use `VISUAL_REPORT_FILE=outro.json` para manter o anterior).

## Saidas (`frontend/test-results/visual/`, ignorado pelo git)

| Arquivo | Conteudo |
| --- | --- |
| `{slug}__{largura}.png` | captura de pagina inteira. Slug = rota sem `/` inicial e com `/` -> `-` (`/portal/comercial/leads` -> `portal-comercial-leads__1440.png`; `/portal` -> `portal__390.png`) |
| `menu-open__390.png` | menu mobile aberto (viewport 390) |
| `report.json` | por captura: `overflowPx` (`scrollWidth - innerWidth`, >0 = rolagem horizontal), `mainTextLength` (texto visivel; valores baixos indicam tela vazia), `alerts` (`role=alert` visiveis), `heading` (h1), `consoleErrors`, `pageErrors`, `finalUrl` (para detectar redirecionamentos) |
| `unmatched-requests.txt` | endpoints chamados pelo app **sem fixture** (metodo, caminho com ids normalizados e telas onde apareceram). Recebem `[]` (GET) ou `{}` com status 200 |

Resumo rapido do relatorio:

```bash
node -e "for (const e of require('./test-results/visual/report.json')) console.log(e.route, e.width, 'overflow', e.overflowPx, 'texto', e.mainTextLength, e.pageErrors.length ? 'ERROS' : '')"
```

## Como adicionar/ajustar fixtures

Tudo fica em `tests/visual/fixtures/`:

- `index.ts` — lista ordenada de rotas (a primeira que casar responde).
- `types.ts` — `MockRoute { method?, path: string | RegExp, respond(req) }`. O `path` nao inclui o prefixo `/api`;
  grupos da regex chegam em `req.params`; `req.query` e `req.body` estao disponiveis. Use `status(code, body)` para
  respostas com outro status.
- Arquivos por dominio: `platform.ts` (sessao, organizacao, contrato, papeis, modulos), `crm.ts`, `delivery.ts`
  (financeiro, projetos, aprovacoes, propostas, suporte, relatorios), `marketing.ts`, `landing.ts`, `company.ts`,
  `omnichannel.ts`, `operations.ts` (automacoes, tarefas, missoes).
- `query.ts` — "banco" em memoria para os data clients (`POST /dominio/query` e `/dominio/xxx-query`, `/rpc`).
  Registre linhas **em snake_case** com `registerTable('nome_da_tabela', rows)` (e `registerRpc`); filtros `eq/in/...`
  por colunas ausentes na linha sao ignorados.
- `ids.ts` / `time.ts` — ids deterministicos (`uid('lead', 3)`) e datas relativas a "agora" (`daysAgo`, `daysFromNow`)
  para que filtros de periodo sempre mostrem dados.

Passo a passo para cobrir uma tela nova:

1. Rode a tela (`VISUAL_ONLY=<trecho> VISUAL_WIDTHS=1440 npx playwright test -c playwright.visual.config.ts`) e abra
   `unmatched-requests.partial.txt` para ver quais endpoints faltam.
2. Descubra o formato em `src/services/*.ts` e `src/types/*` (alguns servicos devolvem camelCase pronto, outros
   mapeiam linhas snake_case; o backend em `backend/src/modules/*` e a referencia final).
3. Crie/edite o arquivo de dominio, exporte `MockRoute[]` e inclua em `index.ts`.
4. Rode de novo e confira o PNG e o `report.json`.

A tela de login (`/auth/login`) roda sem sessao (`/auth/me` responde 401 `not_authenticated`); as demais com sessao
`client_admin`.

# Radar: pesquisa configurável por campanha

O Radar não impõe setor, CNAE, produto ou região. Cozinhas industriais são um caso configurável, não um modo fixo do executor. O módulo pode ser contratado por cliente; neste fluxo, pesquisas pagas são iniciadas pelo Admin YUX, com contato manual e entrega por CSV.

## Configurar pelo painel

1. Como Admin, em Radar, o tipo **Pesquisa configurável — estados ou cidades** abre por padrão. Informe nome, segmento/público, oferta e produtos/serviços opcionais. O segmento é uma descrição: não vira silenciosamente um filtro. Defina nomes e CNAEs explicitamente. **Criação rápida local — uma cidade** preserva as campanhas locais e de empresas recém-abertas, com cidade obrigatória somente nesse modo.
2. Em **Abrangência geográfica**, escolha **Estados inteiros — um ou mais** e selecione as UFs entre as 27 disponíveis; nenhuma cidade é exigida. Para restringir por município, escolha **Cidades específicas — uma ou mais** e informe uma `Cidade/UF` por linha; nesse caso só essas cidades são consultadas, cada uma com paginação independente. Sua UF deve estar selecionada. Um lote não cobre automaticamente toda a UF: continue a paginação até a conclusão, respeitando os limites.
3. Configure nomes e exclusões, CNAEs opcionais principal ou principal/secundário, situação cadastral e período de abertura. Vírgulas separam alternativas nos nomes; palavras dentro de uma alternativa são enviadas juntas à CNPJá. Nenhum CNAE específico é injetado se o campo estiver vazio.
4. Habilite ou desabilite o aprofundamento Brave licenciado e a inspeção do site público. A descoberta persistente atual usa CNPJá; Serper/Brave transitórios continuam separados e não alimentam a lista persistente. Na consulta Brave, `{name}` é obrigatório; `{segment}` e `{terms}` são opcionais. Cidade/UF vão em campos separados. Chaves e direitos de retenção continuam em Admin → Integrações.
5. Defina expressões de qualificação: pelo menos uma, todas as obrigatórias, exclusões, CNAE obrigatório e tratamento de site não verificado. As regras são literais, ignoram acentos e exigem identidade do site comprovada por nome/razão social ou CNPJ observado. Não são uma análise semântica por LLM. Sem critérios positivos, a empresa fica para revisão humana.
6. Defina os termos de aderência à oferta separadamente da confirmação do público. Termos encontrados sinalizam aderência possível, não comprovam compra, orçamento, volume ou responsável.
7. Configure estabelecimentos por página CNPJá (1–10), páginas por região por lote (1–10), consultas totais por lote (1–100), empresas por lote de verificação (1–25), limite diário e orçamento. Limites das fontes/provedor continuam obrigatórios.
8. Selecione campos da lista de entrega. Isso controla as colunas do CSV; não inventa informação ausente. Identidade, localização, contatos públicos, site, Instagram, avaliações e proveniência são exportados quando disponíveis. Com o novo aprofundamento habilitado, a leitura inclui páginas públicas de contato, sobre/empresa e serviços, dentro do limite configurado. Não há navegação autenticada em redes sociais nem garantia de nomes de responsáveis.
9. **Criar pesquisa** e **Salvar configuração** apenas salvam os critérios. Não executam consultas nem iniciam contatos.

Abra uma campanha e use **Editar configuração** para modificar os valores. **Duplicar pesquisa** cria uma campanha independente, com configurações editáveis, sem copiar empresas, cursores, evidências ou aprovações.

## Execução e entrega

Em **Admin → Integrações**, as permissões são confirmadas pelos checkboxes: na CNPJá, **Confirmo permissão de entrega a cliente**; na Brave, **Confirmo licença de armazenamento dos resultados** e, para entrega, **O contrato também permite entregar a lista ao cliente**. Marque as permissões correspondentes e clique em **Salvar provedor**. Não é necessário informar referência de contrato ou reenviar uma API key já cadastrada. A confirmação é uma declaração do administrador sobre os direitos da credencial/plano, não uma verificação independente desses direitos. Desmarcar e salvar revoga a permissão. Ativação de fontes, custos e limites continuam controles separados.

Na mesma página, o painel **Fontes do Radar Comercial** centraliza ativação/desativação, custo estimado por consulta em R$ e limite diário por organização de CNPJá (pesquisa e consulta), Brave, Serper e OSM. Não é necessário abrir uma campanha ou o workspace interno. Fontes globais valem para as organizações com Radar liberado; registros específicos mostram o cliente e prevalecem sobre o global. Confirmar licença não ativa uma fonte. Brave/Serper precisam de custo definido antes de ativar; configure o valor do plano real, sem presumir gratuidade. **Salvar custo e limites** e **Ativar fonte** não executam consultas nem substituem chaves.

No workspace, os cartões mostram o estado e a pendência real (desativação ou custo). Para o Admin há o link **Configurar fontes no Admin**; **Atualizar estado das fontes** relê somente o catálogo, sem buscar empresas ou consumir créditos do provedor. Os controles duplicados do workspace interno foram removidos. Jina e fontes futuras não são ativadas pelo novo painel. A contratação do Radar e os direitos de retenção/entrega continuam obrigatórios para os usos correspondentes.

- **Buscar próxima página — região** retoma uma UF/município. **Buscar lote nas regiões configuradas** percorre regiões em rodízio, respeitando limites, orçamento e quotas. Regiões concluídas não ocupam o teto de consultas. Não há três UFs ou três páginas fixas.
- **Verificar lote configurado** aplica o número salvo na campanha. Brave só é consultada se habilitada, com licença/chave/fonte válidas e candidato sem site. O painel pede confirmação do consumo potencial antes de executar.
- Revise motivos, URLs, contatos e identidade. A inspeção respeita `robots.txt`, limites de rede/tempo/tamanho e bloqueia rede privada/redirecionamento externo. Site omitido, bloqueado ou inacessível não prova ausência de site.
- Correspondências Brave ambíguas exigem associação humana. Se não houver evidência suficiente, Admin pode confirmar manualmente com fonte pública e justificativa documentada. Campos não comprovados ficam vazios/desconhecidos.
- **Exportar lista verificada** inclui apenas aprovados da configuração atual e colunas selecionadas, respeitando direitos de entrega CNPJá/Brave. Distribuição/importação no CRM e contatos são manuais; não há sincronização nativa desta lista regional com funis CRM.

## Versões, histórico e deploy

Filtros, localidades, oferta, fontes e regras possuem versão. Alterá-los inicia nova paginação e invalida aprovações antigas. Empresas/evidências permanecem preservadas no banco. No modo antigo, registros da versão anterior ficam no histórico até nova descoberta. Com aprofundamento automático habilitado, candidatos existentes permanecem visíveis e podem ser pesquisados na revisão atual **sem refazer a descoberta CNPJá**. Apenas resultados reavaliados na revisão atual podem seguir para aprovação/entrega; aprovados não são reescritos silenciosamente. Jobs de revisão antiga são recusados. Para manter finalidades diferentes em paralelo, duplique a pesquisa.

Alterar apenas nome, orçamento, limite diário, lotes ou colunas de entrega não muda os critérios nem invalida aprovações.

O deploy inclui `0183_radar_candidate_research.sql`: cria histórico de pesquisas por candidato com isolamento por organização e a fonte **Brave Web Search — aprofundamento**, inicialmente desativada, custo zero e limite 10. Não altera credenciais, não ativa fontes e não executa pesquisas. Migrações anteriores já aplicadas permanecem intactas. Campanhas novas não possuem preset setorial/geográfico.

## Aprofundamento automático: configurar e usar

1. Em **Admin → Integrações → Brave**, reutilize a chave já cadastrada. Confirme retenção e, para busca web complementar, o checkbox específico de escopo de **busca web com retenção**. Não é exigida referência contratual. Confirme apenas direitos realmente disponíveis no plano. Salvar não consome consultas.
2. Em **Fontes do Radar Comercial**, configure custo real aprovado em R$ e limite da fonte web e/ou local escolhida; ative somente as fontes autorizadas. A confirmação de licença sozinha não ativa fontes. Fonte específica da organização prevalece sobre a global. Nenhuma ativação ou alteração de limites foi feita na implementação.
3. Na campanha, **Editar configuração → Aprofundamento automático**: habilite pesquisa, selecione busca local e/ou web, mantenha inspeção de site público se desejar leitura multipágina. Ajuste teto total de consultas por empresa (1–5, compartilhado entre os endpoints), páginas (1–10) e validade (1–30 dias). A configuração é genérica e não impõe segmento, cidade ou produto.
4. Opcionalmente, em **Admin → LLMs**, configure **Radar — qualificação de empresas pela oferta**, com modelo, provedor e fallbacks autorizados. Só depois habilite a qualificação semântica na campanha. Sem rota própria ativa, nenhum modelo global/legado é chamado silenciosamente para iniciar este caso. Uma rota própria pode usar seus fallbacks e o fallback global já autorizado. Nenhuma outra rota/função foi removida. A coleta de fatos funciona sem LLM.
5. No candidato, **Pesquisar e enriquecer automaticamente** não pede URL. Mostra confirmação de teto estimado de busca e aviso de créditos de IA, quando habilitada. O lote **Pesquisar e enriquecer lote existente** enfileira trabalhos individuais. Preserva candidatos anteriores inconclusivos e não chama novamente CNPJá. O teto do lote é conservador; quotas e orçamento são conferidos antes de cada chamada.
6. **Ver resultado e disponibilidade** mostra fila/etapa, site e associação, telefone cadastral separado, telefones/e-mails públicos, WhatsApp publicado, redes e contatos profissionais encontrados, fontes/data, sinais de atividade e pendências. **Atualizar disponibilidade da pesquisa** relê controles sem executar consulta. Erros distinguem fonte/custo/chave/licença/quota/campanha. **Corrigir associação / confirmação humana** é opcional, para ambiguidades.
7. Revise o dossiê e aprove os elegíveis antes de exportar. As colunas novas de entrega incluem contatos públicos, WhatsApp publicado, redes, sinais de atividade e fontes. Os direitos CNPJá/Brave existentes continuam obrigatórios. Não há mensagem, ligação, criação de lead ou automação de contato neste fluxo.

### Identidade, resultados parciais e retomada

Nome/cidade isolados não confirmam identidade. A associação exige CNPJ exato do estabelecimento sem conflito, ou nome/localidade mais endereço/telefone corroborado. Páginas de outra filial ou com múltiplos CNPJs ficam para conferência. Contatos incertos aparecem como pendentes e não entram silenciosamente nos campos confirmados da entrega. O número do cadastro não é substituído pelo telefone publicado.

HTTP 200, CNPJ ativo e copyright não provam funcionamento. Sinais datados de operação/encerramento conservam fonte e podem resultar em inconclusão ou conflito. WhatsApp é apenas um link publicado, não conta sondada nem consentimento. Ausência em buscas limitadas não prova inexistência de site. Páginas que exigem JavaScript, login, CAPTCHA ou que bloqueiam o leitor ficam com limitação explícita. A leitura pública aplica DNS fixado em IP público, restrição de redirecionamento, robots por caminho, tempo e tamanho máximos; não usa cookies nem sessões pessoais.

Pesquisas persistem em `radar_candidate_research_runs`, fatos confirmados em `radar_b2b_evidence` e resumo versionado no candidato. Respostas de busca concluídas e etapas salvas são reaproveitadas, inclusive após reiniciar o processo. Cliques concorrentes reutilizam o mesmo run. Chamadas reservadas com resposta incerta **não são repetidas automaticamente**, para evitar cobrança duplicada: deixam pendência. Falha de qualificação mantém contatos e fatos; habilitar/liberar uma fonte permite retomar candidatos antes inconclusivos. A pesquisa concluída é reutilizada dentro da validade; expirando, uma nova execução exige confirmação e continua sujeita aos limites.

### Verificação local desta entrega

Testes usam respostas simuladas, sem API/LLM pagos. A jornada com PostgreSQL 17 isolado aplicou as 80 migrações e validou persistência real com papel de worker, clique concorrente, releitura, revisão, exportação, bloqueio entre organizações e reaproveitamento sem nova chamada. O teste opt-in exige `YUX_RADAR_TEST_DATABASE_URL` em `127.0.0.1` e banco exclusivo `yux_radar_research_test`; não aponta para produção.

Suítes: 820 testes backend, 623 frontend, 275 runtime e 1 jornada PostgreSQL aprovados; 1 teste runtime já existente permaneceu ignorado. Builds/type-check e orçamento de bundle aprovados. Lint comparativo aprovado (558 erros/26 avisos existentes, baseline 560/27), sem modificar baseline e sem afirmar que o repositório está livre de avisos. Verificação: Vitest das suítes backend/frontend, pytest do runtime, `npm run build` em ambos os projetos, `npm run lint:baseline` no frontend e a jornada opt-in PostgreSQL.

Navegador: Chrome local, Vite, API interceptada, componentes reais; fallback Playwright porque o plugin de navegador não estava disponível. Fluxo verificado: fonte bloqueada → atualização de disponibilidade simulada → iniciar sem URL → resultado parcial com contatos/fonte → recarregar e consultar novamente, sem novo POST. Desktop 1440×1000 e celular 390×844, sem transbordamento horizontal.

| Checagem visual/interativa | Resultado |
| --- | --- |
| Página e rota corretas | Aprovado |
| Conteúdo visível, sem tela vazia | Aprovado |
| Sem sobreposição de erro | Aprovado |
| Interações de início, bloqueio e retomada | Aprovado com API simulada |
| Persistência após recarga | Aprovado na UI simulada e no banco real isolado |
| Console e layout desktop/mobile | Sem erros; sem corte horizontal |

Isso não comprova qualidade de uma busca real nem implantação em produção. Após deploy do usuário, falta configurar/autorizar fontes e eventual rota LLM e executar piloto pago de até **3 candidatos existentes**, com teto previamente informado e sem aumentar quotas por conta própria. Só ampliar depois de conferir identidades, contatos, cobertura, falsos vínculos e custo real.

Testes automatizados usam fornecedores simulados, sem API/LLM pagos. Eles não equivalem a deploy ou qualidade comercial comprovada. Após configurar fontes/limites, valide um lote pequeno autorizado no painel; não há promessa de cobertura total. Para impedir novas chamadas, desative a fonte. Uma chamada já iniciada pode ter sido cobrada; confira logs/créditos antes de repetir falhas.

## Teste da chave Brave

A requisição usa `search_lang=pt-br`, `ui_lang=pt-BR` e localização no formato cidade/país para o Brasil; a UF também acompanha o texto da consulta. O idioma genérico `pt` não pertence à enumeração da API e pode gerar HTTP 422. Se houver outro erro de validação, o teste informa os nomes dos parâmetros reconhecidos, sem mostrar chave, valores enviados ou mensagens arbitrárias do provedor. Testar a chave no painel consome uma consulta; os testes automatizados não consomem créditos.

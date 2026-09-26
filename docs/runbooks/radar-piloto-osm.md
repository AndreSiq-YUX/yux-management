# Radar — piloto interno de descoberta automática OSM

## Escopo

Este piloto descobre estabelecimentos do segmento **clínicas/consultórios médicos** em um município configurado na campanha. A busca usa um extrato OpenStreetMap (OSM) indexado localmente e a malha do IBGE; não usa CSV, Jina, Places, Overpass público, LLM nem API paga. Não dispara e-mail, WhatsApp ou ligação. A fonte nasce **desativada** e é operada apenas no Radar interno da YUX. Outros segmentos exigem mapeamento de etiquetas e teste próprios.

O OSM é uma fonte colaborativa incompleta. `website` ausente significa **site desconhecido**, não “empresa sem site”. Telefone e e-mail ausentes também não autorizam concluir que não existem. Um site informado pode ser confirmado pela verificação HTTP individual, mas falha/404 continua `unknown`. Antes de qualquer contato, permanece obrigatória a revisão humana e a verificação da base legal, preferência e permissão do canal.

## Fontes e atribuição

- Extrato regional: `https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf` e arquivo `.md5` correspondente, sob ODbL. Guardar o arquivo e o checksum fora do repositório.
- Malha municipal oficial: `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4113700?formato=application/vnd.geo+json&qualidade=maxima` para Londrina/PR. Para outra campanha, substituir pelo geocódigo IBGE exato da cidade.
- Identidade municipal oficial: `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/4113700`. Salvar o JSON junto à malha; o importador confere código, nome e UF para impedir que um arquivo de um município seja rotulado como outro.
- Mostrar **© OpenStreetMap contributors (ODbL)** junto aos candidatos e preservar URL do elemento, hash e timestamp do extrato. Antes de disponibilizar base derivada a clientes SaaS, revisar as obrigações de compartilhamento da ODbL.

## Carga administrativa

1. Confirmar espaço em disco, origem, data do extrato, termos e MD5. O arquivo regional tem centenas de MB e é processado em duas passagens; reservar memória e tempo no processo administrativo isolado. A API do Radar nunca baixa o PBF.
2. Baixar a malha GeoJSON, o JSON de identidade municipal do IBGE e o PBF para um volume temporário legível pelo processo administrativo. Não colocar os arquivos em Git nem em imagem Docker.
3. Executar a prévia sem banco (no desenvolvimento, usar `npx tsx scripts/import-radar-osm-extract.ts`; na imagem, `node dist/scripts/import-radar-osm-extract.js`):

```text
--dry-run --pbf /dados/sul-latest.osm.pbf --boundary /dados/londrina-ibge.geojson --locality /dados/londrina-ibge-localidade.json --municipality-code 4113700 --city Londrina --state PR --region-key sul --source-url https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf --boundary-source https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4113700
```

4. Confirmar que o checksum e a data no resultado correspondem ao extrato esperado. A data vem do cabeçalho PBF; arquivos com mais de 90 dias, sem timestamp ou sem estabelecimentos mapeados são recusados.
5. Aplicar a migration `0178_radar_osm_extract_pilot.sql` pelo fluxo normal de deploy e executar o mesmo comando **sem `--dry-run`**, com `MIGRATOR_DATABASE_URL` (ou `DATABASE_URL`) definido no processo administrativo. A carga cria um snapshot novo e troca o ativo somente após inserir todos os estabelecimentos numa transação; o snapshot anterior continua disponível como histórico.
6. Abrir a campanha no Radar. O administrador YUX ativa a fonte “Dados abertos OSM (índice local)” e confere a data/município. “Buscar automaticamente” retorna até o limite diário da campanha, máximo dez por execução. Cada resultado entra como candidato pendente de revisão.

Não executar a carga dentro da requisição HTTP. Não registrar credenciais nos logs ou no documento. O operador deve proteger e limpar os arquivos temporários pelo procedimento de retenção da infraestrutura.

## Verificação do piloto

- Confirmar que a rota de disponibilidade aponta o município e extrato corretos; sem snapshot ou com fonte desativada, a busca permanece bloqueada.
- Executar um lote de até dez candidatos. Conferir nomes, categoria, localização, URL do elemento OSM, data, atribuição e estado `site desconhecido`/`informado, não verificado`.
- Para candidatos com site informado, usar “Verificar site” individualmente. Registrar `verified_present`, `unknown` ou `blocked` e horário; não acessar URL privada e não converter 404/timeout em “sem site”.
- Repetir a busca e verificar que não reapresenta candidatos já vistos na campanha. Registrar quantos são únicos após revisão, quantos sites foram informados/confirmados, quantos contatos foram informados e quantos não têm dados suficientes para ação.
- Custo por chamada de API de busca: **US$ 0**; armazenamento, processamento, tráfego e manutenção do índice têm custo de infraestrutura separado.

## Operação e retorno seguro

Se aparecerem dados errados, fonte desatualizada, problemas de licença ou comportamento inesperado, desativar a fonte no Radar. Isso interrompe buscas novas sem apagar candidatos, oportunidades ou snapshots já registrados. Corrigir a origem e carregar novo extrato antes de reativar. O OSM não informa data de abertura da empresa; a campanha “recém-abertas” não deve usar esta fonte como prova de abertura recente.

## Evidência inicial (26/09/2026)

Prévia local, sem banco nem contatos, do extrato Sul com cabeçalho `2026-09-25T20:24:36Z` e município IBGE `4113700` usando malha de qualidade máxima: **88 elementos médicos** mapeados, sendo 14 com site informado, 53 com telefone informado e 7 com e-mail informado; 13 relações não suportadas foram ignoradas. O MD5 local `73d7e6133c9bfc6ec121ad14f16f9233` correspondeu ao `.md5` publicado pela Geofabrik. Elementos não equivalem automaticamente a empresas únicas e dados informados ainda não foram confirmados.

A migration e a importação completa foram validadas em banco PostgreSQL local isolado: snapshot `active`, 88 linhas de estabelecimentos, mesmas contagens de campos. Esse banco temporário foi removido após a conferência.

## Primeiro lote em produção (26/09/2026)

O deploy `3d20db6` terminou no Dokploy. O mesmo PBF com MD5 conferido foi carregado no banco de produção para Londrina/PR: snapshot `be6311d3-8c9a-4a0b-82c3-fa38852027eb`, 88 registros indexados e 13 relações ignoradas. A fonte foi ativada para o Radar interno YUX e a campanha existente “Teste primeira campanha de captação” gerou **10 candidatos pendentes de revisão**, sem importação para oportunidades ou envio de mensagens. O lote tinha 3 sites e 5 telefones informados, nenhum e-mail; custo de API da busca US$ 0. Run `29929d83-32f4-43fc-aacc-1d57754c38f0`, zero issues. Não repetir a busca no mesmo dia: o lote consumiu o limite diário de 10.

As três verificações individuais de site não confirmaram presença: duas retornaram `unknown/request_failed` e uma `blocked/private_or_reserved_address`. Foi identificado que a consulta DNS trazia IPv6 junto a IPv4, embora o verificador conecte apenas via IPv4 validado. O deploy corretivo `35a2699` restringiu a resolução a IPv4; a verificação antes bloqueada passou a `unknown/request_failed`, sem confirmar a presença do site. Respostas `unknown` não devem ser interpretadas como ausência de site. A curadoria dos 10 candidatos ainda está pendente.

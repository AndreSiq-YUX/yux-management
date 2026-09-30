# Radar: pesquisa configurável por campanha

O Radar não impõe setor, CNAE, produto ou região. Cozinhas industriais são um caso configurável, não um modo fixo do executor. O módulo continua interno à YUX, com contato manual e entrega por CSV neste fluxo.

## Configurar pelo painel

1. Como Admin, em Radar, clique em **Nova pesquisa configurável**. Informe nome, segmento/público, oferta e produtos/serviços opcionais. O segmento é uma descrição: não vira silenciosamente um filtro. Defina nomes e CNAEs explicitamente.
2. Selecione as UFs entre as 27 disponíveis. Sem cidades, a pesquisa abrange as UFs. Para restringir por município, informe uma `Cidade/UF` por linha; nesse caso só essas cidades são consultadas, cada uma com paginação independente. Sua UF deve estar selecionada.
3. Configure nomes e exclusões, CNAEs opcionais principal ou principal/secundário, situação cadastral e período de abertura. Vírgulas separam alternativas nos nomes; palavras dentro de uma alternativa são enviadas juntas à CNPJá. Nenhum CNAE específico é injetado se o campo estiver vazio.
4. Habilite ou desabilite o aprofundamento Brave licenciado e a inspeção do site público. A descoberta persistente atual usa CNPJá; Serper/Brave transitórios continuam separados e não alimentam a lista persistente. Na consulta Brave, `{name}` é obrigatório; `{segment}` e `{terms}` são opcionais. Cidade/UF vão em campos separados. Chaves e direitos de retenção continuam em Admin → Integrações.
5. Defina expressões de qualificação: pelo menos uma, todas as obrigatórias, exclusões, CNAE obrigatório e tratamento de site não verificado. As regras são literais, ignoram acentos e exigem identidade do site comprovada por nome/razão social ou CNPJ observado. Não são uma análise semântica por LLM. Sem critérios positivos, a empresa fica para revisão humana.
6. Defina os termos de aderência à oferta separadamente da confirmação do público. Termos encontrados sinalizam aderência possível, não comprovam compra, orçamento, volume ou responsável.
7. Configure estabelecimentos por página CNPJá (1–10), páginas por região por lote (1–10), consultas totais por lote (1–100), empresas por lote de verificação (1–25), limite diário e orçamento. Limites das fontes/provedor continuam obrigatórios.
8. Selecione campos da lista de entrega. Isso controla as colunas do CSV; não inventa informação ausente. Identidade, localização, contatos públicos, site, Instagram, avaliações e proveniência são exportados quando disponíveis. A inspeção atual lê a página inicial pública: não garante nomes de responsáveis nem navegação aprofundada em redes sociais.
9. **Criar pesquisa** e **Salvar configuração** apenas salvam os critérios. Não executam consultas nem iniciam contatos.

Abra uma campanha e use **Editar configuração** para modificar os valores. **Duplicar pesquisa** cria uma campanha independente, com configurações editáveis, sem copiar empresas, cursores, evidências ou aprovações.

## Execução e entrega

- **Buscar próxima página — região** retoma uma UF/município. **Buscar lote nas regiões configuradas** percorre regiões em rodízio, respeitando limites, orçamento e quotas. Regiões concluídas não ocupam o teto de consultas. Não há três UFs ou três páginas fixas.
- **Verificar lote configurado** aplica o número salvo na campanha. Brave só é consultada se habilitada, com licença/chave/fonte válidas e candidato sem site. O painel pede confirmação do consumo potencial antes de executar.
- Revise motivos, URLs, contatos e identidade. A inspeção respeita `robots.txt`, limites de rede/tempo/tamanho e bloqueia rede privada/redirecionamento externo. Site omitido, bloqueado ou inacessível não prova ausência de site.
- Correspondências Brave ambíguas exigem associação humana. Se não houver evidência suficiente, Admin pode confirmar manualmente com fonte pública e justificativa documentada. Campos não comprovados ficam vazios/desconhecidos.
- **Exportar lista verificada** inclui apenas aprovados da configuração atual e colunas selecionadas, respeitando direitos de entrega CNPJá/Brave. Distribuição/importação no CRM e contatos são manuais; não há sincronização nativa desta lista regional com funis CRM.

## Versões, histórico e deploy

Filtros, localidades, oferta, fontes e regras possuem versão. Alterá-los inicia nova paginação e invalida aprovações antigas. Empresas/evidências permanecem preservadas no banco. Registros da versão anterior não entram na lista atual nem podem ser aprovados por ela: execute nova descoberta e verificação. O painel informa quantos registros históricos foram preservados. Jobs antigos são recusados. Para manter finalidades diferentes em paralelo, duplique a pesquisa.

Alterar apenas nome, orçamento, limite diário, lotes ou colunas de entrega não muda os critérios nem invalida aprovações.

O deploy aplica `0181_radar_configurable_search.sql` depois de `0180`. A migração preserva os antigos critérios de cozinhas somente nas campanhas regionais existentes, agora editáveis. Campanhas novas não possuem preset setorial/geográfico. Migrations já executadas não foram modificadas.

Testes automatizados usam fornecedores simulados, sem API/LLM pagos. Eles não equivalem a deploy ou qualidade comercial comprovada. Após configurar fontes/limites, valide um lote pequeno autorizado no painel; não há promessa de cobertura total. Para impedir novas chamadas, desative a fonte. Uma chamada já iniciada pode ter sido cobrada; confira logs/créditos antes de repetir falhas.

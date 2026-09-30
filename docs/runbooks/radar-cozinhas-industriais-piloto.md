# Piloto do Radar: cozinhas industriais MG, SP e PR

## Objetivo e fronteira

Gerar uma lista de empresas reais para revisão e telefonemas **manuais** pela equipe do cliente. A campanha não envia WhatsApp, e-mail, proposta ou ligação. O Radar permanece restrito ao workspace interno YUX; a lista aprovada pode ser entregue em CSV, sujeito aos direitos de uso de cada fonte. A importação automática dessa campanha para o CRM geral fica desabilitada, pois o conversor antigo escolhe um funil/oferta genéricos e pressupõe e-mail. O CSV é o mecanismo de entrega/importação manual no CRM até existir um funil B2B específico.

## Pré-condições do Admin

1. Aplicar a migração `0180_radar_regional_b2b.sql` por meio do processo normal de deploy. Não executar consultas pagas apenas para verificar o deploy.
2. Em **Admin → Integrações**, manter a conexão CNPJá ativa com a chave já cadastrada. Conferir o plano e os créditos. Para entregar dados do CNPJá ao cliente, assinalar a permissão de entrega e registrar a referência dos termos/contrato; sem isso, a exportação fica bloqueada.
3. Para usar enriquecimento persistente pela Brave, substituir a chave padrão por uma chave **especificamente licenciada** para retenção. Na conexão Brave Place Search, assinalar retenção, informar a referência contratual e, se contratualmente permitido, assinalar entrega ao cliente. A chave padrão ou apenas uma chave válida não habilita retenção. Sem essas confirmações, a rota persistente recusa a operação. A pré-visualização transitória continua separada.
4. Em **Radar → Fontes da campanha**, configurar custo estimado real por consulta, limite diário e ativar CNPJá. Ativar Brave Place Search apenas depois de confirmar a licença, a chave e o orçamento. A API pode cobrar por chamada, inclusive quando nenhum candidato é confirmado.
5. Criar campanha **Regional B2B — cozinhas industriais** com MG, SP e PR, produtos ofertados e limite diário. CNAE `5620-1/01` principal ou secundário é uma pista de descoberta, não uma confirmação comercial.

## Execução controlada

1. Começar com **Buscar próximo lote** em uma UF. Uma página solicita até dez estabelecimentos. Conferir a quantidade, a situação cadastral, a cidade, o CNPJ e o custo/consumo na fonte. O cursor por UF permite continuar na página seguinte sem recomeçar. **Buscar em lote nos três estados** faz até três páginas por UF, em rodízio, respeitando a governança da fonte; usar apenas quando o piloto pequeno estiver aprovado.
2. Usar **Verificar até 10 empresas** ou os botões individuais. Se o registro não tiver site, a Brave licenciada tenta localizar uma correspondência única de nome e localidade; correspondências ambíguas ficam como sugestões separadas, sem contatos anexados, até o Admin conferir e associar explicitamente. Se houver site, a verificação lê a página pública com limites de rede, tempo e tamanho, consulta `robots.txt` e não segue redirecionamentos a outro domínio. Site ausente, inacessível ou bloqueado continua `desconhecido`/`bloqueado`, nunca “não tem site”.
3. Revisar atividade e adequação separadamente. Confirmação automática exige CNAE-alvo e evidência do site associado descrevendo operação industrial B2B. CNAE isolado fica para revisão. Uma empresa sem site pode ser **confirmada manualmente** somente por Admin, com URL pública e justificativa de ao menos 20 caracteres; método, fonte, data e revisor ficam registrados.
4. Verificar amostra dos confirmados e todos os duvidosos. Não inferir que compra massas, pães ou salgados só porque opera uma cozinha: a aderência fica `desconhecida` ou `possível` quando houver menção observável. Telefones/e-mails do site só entram como fatos do negócio quando a identidade do site é confirmada. Nomes de responsáveis não são inventados.
5. Aprovar apenas empresas cuja atividade tenha sido confirmada automaticamente ou documentada por revisão humana. **Exportar lista verificada** inclui somente aprovados e só funciona se as permissões de entrega da CNPJá e, quando houver fatos Brave, da Brave estiverem registradas. Entregar/importar o CSV no CRM para distribuir os telefonemas manuais. Registrar no CRM o resultado de cada ligação, opt-out e correções; não iniciar disparos automáticos.

## Medição antes de escalar

Registrar por UF: páginas consultadas, candidatos únicos, sites localizados, cozinhas confirmadas, aprovações humanas, falsos positivos encontrados na revisão, telefones válidos e custo total. Comparar uma amostra de empresas com e sem site e com CNAE principal/secundário. Não prometer cobertura total do mercado; a primeira descoberta é cadastral por CNAE e pode omitir empresas mal classificadas. Busca complementar por termos e municípios, páginas de contato, nomes de responsáveis, triagem por LLM e sincronização nativa com o CRM são evoluções separadas, ainda não validadas neste piloto.

## Pausa e falhas

- Para parar novas chamadas, desativar a fonte ou pausar a campanha. Lotes em curso já podem ter reservado uma consulta.
- Um erro do provedor não transforma registro em “não encontrado”; conferir credencial, créditos, limite e log da execução antes de tentar novamente.
- Se a licença Brave não cobrir retenção/entrega, manter a captura persistente desativada e não exportar fatos derivados dela.
- O teste automatizado usa respostas simuladas e não consome créditos. A validação com dados reais deve começar com um lote pequeno autorizado pelo Admin.

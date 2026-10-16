# Radar — operação direta e visão comercial do cliente

## Problemas verificados

- A quantidade do próximo lote está no `RadarCaptureDialog`, invisível até clicar em buscar. A página mantém duplicação, descoberta isolada, verificação de lote e paginação regional em blocos concorrentes.
- `RadarResearchMetrics` oculta custos pelo prop `showCosts`, mas recebe o objeto completo; `getRadarResearchMetrics` retorna custos/fontes a qualquer usuário com acesso ao Radar. O frontend também solicita fontes, disponibilidade e runs ao carregar usuários clientes.
- A configuração read-only usa o mesmo formulário técnico; detalhes e progresso reutilizam mensagens internas. Candidatos levam `normalizedPayload`, e dossiês levam dados operacionais misturados aos fatos comerciais. Não basta esconder rótulos.

## 1. Organização desejada

Manter o padrão visual YUX e a página dedicada existente. Não redesenhar o SaaS inteiro nem gerar imagens pagas. O ajuste principal é uma seção compacta, com controles nativos, sem alterar tokens ou componentes globais.

Na página de resultados, o Admin YUX vê:

Pesquisa da campanha
Novas empresas neste lote: [10]   [Pesquisar novas empresas]
A pesquisa encontra novas empresas e completa seus dados automaticamente.

- Quantidade editável diretamente nessa seção: inteiro de 1 a 1.000, padrão 10. Não exige editar/salvar a configuração da campanha e não abre outra janela para escolher a quantidade.
- Uma ação principal de pesquisa. Tanto na primeira execução quanto nas seguintes, o botão chama a operação completa existente, nunca descoberta isolada/página regional. A quantidade significa novas empresas únicas adicionais, não empresas aprovadas garantidas.
- Ao iniciar, a quantidade fica travada para o pedido. Falha de resposta mantém o mesmo UUID e valor, com **Tentar novamente sem duplicar**. Não aumentar quotas, habilitar fontes, alterar modelo ou repetir cobrança incerta.
- Lote em execução: mostrar **Pesquisando empresas…**, quantidade original e progresso; nenhum segundo início ou botão de pesquisa equivalente. Lote bloqueado: mostrar **Retomar pesquisa** nessa mesma área, mantendo a quantidade e o mesmo lote. Lote terminal: liberar o campo para o próximo lote, padrão 10 novamente. Ao trocar campanha, limpar rascunho/request pendente e ignorar respostas antigas.
- Acompanhar não exige botão separado na seção principal: manter atualização automática e estados verdadeiros; recuperação manual de erro é contextual.
- **Duplicar pesquisa** fica em **Ações da campanha**, no cabeçalho, com explicação de que cria campanha independente. Não compete com a pesquisa de novas empresas.
- Todos os comandos legados de descoberta isolada, verificação do lote existente, próxima página regional, disponibilidade e fontes ficam reunidos num único bloco **Operação técnica — Admin YUX**, fechado por padrão, após os resultados. Remover os blocos avançados concorrentes da área principal, sem remover suas funções.
- Completar dados de empresas selecionadas, revisão e envio ao CRM permanecem junto à lista e mantêm suas permissões. Não são ações de captar novas empresas.

## 2. Regra permanente de audiência

Somente `user.role === 'yux_admin'` acessa ferramentas, modelos/provedores, licenças, custos internos e diagnósticos técnicos. `client_admin`, `client_member` e `yux_operator` não são Admin do sistema para essa regra. Permissão `platform.manage`, administração da conta ou módulo contratado não substituem essa verificação.

Cliente vê resultados: identidade e dados cadastrais da empresa, localização, site, contatos, redes sociais, perfil comercial, aderência, porte com evidências, situação da pesquisa, pendências comerciais e histórico legível. CNPJ da empresa pesquisada é um dado cadastral permitido; **CNPJá** é um fornecedor interno que não deve ser divulgado.

Cliente não recebe nomes de fornecedores/ferramentas/modelos, tipos/IDs de fontes internas, chaves, licenças, recibos, tokens, custos, consultas por provedor, limites de fonte, cursor/página operacional, prompts, configuração técnica, payloads brutos ou stack/error de infraestrutura. Isso inclui tela, detalhes, histórico, mensagens, respostas HTTP e arquivos de entrega disponíveis ao cliente. Não adicionar cobrança por consumo: não há plano baseado em custo nesta entrega.

A regra será registrada em `AGENTS.md`, com escopo Radar, e no runbook. Visão técnica do Admin e dados/auditoria internos continuam preservados. Não apagar histórico nem modificar os mecanismos de licença/isolamento/aprovação existentes.

## 3. Fronteira de dados

- Aplicar projeção comercial no backend por lista explícita de campos permitidos; não entregar JSON interno e confiar em CSS/props. Níveis aninhados também devem ser projetados. Campos desconhecidos não passam automaticamente.
- Manter API técnica completa para `yux_admin`; endpoints exclusivamente técnicos retornam 403 aos demais, sem detalhes de provedor. Aplicar autorização de organização antes de projetar; projeção não substitui RLS/escopo.
- Campanhas comerciais fornecem público/oferta/abrangência/critérios comerciais, sem `sources`, rotas, orçamento, limites técnicos e configuração bruta. A página de configuração do cliente vira resumo comercial, não formulário técnico desabilitado.
- Métricas comerciais fornecem apenas empresas pesquisadas, identificadas, com contato útil e prontas para revisão; custos e agrupamentos por fonte permanecem exclusivos do Admin. O frontend não solicita endpoints técnicos para outros papéis.
- Dossiês comerciais fornecem fatos/conclusões já projetados pelo motor existente, contatos e URLs públicas verificáveis da empresa; não promover contatos incertos. Projeção de audiência não altera identificação, qualidade, consentimento ou situação de atividade.
- Pendências são classificadas em texto comercial: **Dados em pesquisa**, **Identificação pendente**, **Contato não encontrado** ou **Pesquisa aguardando a equipe responsável**, sem expor nomes internos. Diagnóstico detalhado permanece para o Admin. Mensagens livres operacionais antigas não são repassadas como justificativa comercial.
- Histórico comercial tem data, empresa, etapa/resultado legível. Não expor nomes de jobs/runs/provedor ou JSON bruto. Bloquear acesso direto a endpoints de catálogo/disponibilidade/piloto técnico por não Admin.
- Exportação/CRM: preservar campos úteis e direitos de entrega; não enviar `sourceType`, `provider`, recibos/configuração técnica nem observações operacionais a campos visíveis ao cliente. URLs públicas de evidência não são URLs internas de APIs de busca. Não remover atribuições/licenças obrigatórias silenciosamente: conteúdo cujo repasse exige divulgar atribuição incompatível com esta política não é entregue nessa visão; permanece no Admin com indicação de restrição.
- Não usar substituição global de palavras que corrompa nome de empresa ou texto do cliente (ex.: uma empresa chamada “Brave Transportes”). Classificação/allowlist separam conteúdo comercial de metadados internos.

## 4. Preservações e validação

Sem alterações de migrações, pesquisa/provedores, preços/limites, rotas LLM, credenciais, TLS, carteira de IA, permissões de iniciar pesquisas pagas, mensagens ou critérios comerciais. Não executar chamadas pagas nem deploy durante esta implementação. Publicar main somente após testes/revisão sob autorização vigente.

Testes devem exercitar os quatro papéis, respostas completas/nulas/históricas, chamadas diretas à API, navegação rápida e falha HTTP incerta. QA local desktop/mobile deve mostrar campo visível, um início, retomada sem redescoberta e cliente sem termos internos mesmo abrindo todos os detalhes/histórico. Provedores/fila simulados; limitações reais reportadas.

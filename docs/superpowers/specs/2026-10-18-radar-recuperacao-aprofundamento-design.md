# Radar: recuperar aprofundamento parcial sem repetir descoberta

## Objetivo

Permitir recuperar as etapas úteis ainda pendentes das empresas de um lote já descoberto, com motivos acionáveis e qualidade baseada em evidências. Uma pesquisa executada com resultado inconclusivo não equivale a falha operacional, nem a empresa aprovada.

## Evidências verificadas em produção (somente leitura)

- Lote de vinte empresas: vinte admitidas, dezenove itens classificados como bloqueados, um insuficiente e zero concluídos. A descoberta já terminou por atingir a quantidade.
- Os vinte trabalhos individuais terminaram como `partial`, na etapa `review`, sem `error_code` de execução. Dez possuem `source_limit_exceeded`; duas não têm páginas lidas. Essas contagens se sobrepõem às seguintes categorias.
- Dez aguardam identidade, quatro aguardam leitura pública e cinco aguardam análise de perfil/qualificação. Cinco dossiês têm identidade/contato suficientes para revisão segundo a configuração, mas isso não comprova aderência ou aprovação comercial.
- As cotas observadas estavam em 10/10 para busca local Brave, 50/50 para Google via Serper e 10/10 para Brave Web. Não houve alteração desses valores nem chamadas pagas nesta investigação.
- Há rejeições explícitas de afirmações/perfis não verificáveis e um `agent_runtime_422` cujo motivo detalhado foi perdido. A causa específica desse 422 ainda não foi demonstrada; não atribuí-lo a falta de créditos ou número de páginas sem reprodução.
- Há referências editoriais/diretórios tratados como domínios institucionais candidatos, gerando leituras e contatos irrelevantes. As confirmações de identidade por IA rejeitaram várias dessas associações corretamente.
- Dokploy registra implantação concluída de `0017e29` e a rota da política operacional está presente. O endpoint de saúde ainda anuncia um identificador anterior; essa divergência de metadados não prova, isoladamente, que o código anterior esteja executando.

## Comportamento desejado

1. Classificação do item deve distinguir: trabalho em andamento, pesquisa executada com dados insuficientes, resultado completo e impedimento operacional/efeito incerto. Falta de identidade e perfil comercial desconhecido permanecem visíveis e não se tornam aprovação automática.
   Um aviso incidental de quota ou rede social indisponível não invalida etapas obrigatórias já concluídas. A mesma limitação é impeditiva quando bloqueia uma etapa necessária ainda pendente; preservar essa distinção nos testes.
2. O motivo operacional deve ser extraído de erro estruturado, recibo ou limitação tipada. O Admin recebe o motivo específico e a etapa; o cliente recebe apenas explicação comercial segura. Texto livre de página/provedor nunca se torna erro HTTP bruto.
3. Ao retomar um lote cuja quantidade foi atingida, não chamar descoberta nem substituir candidatos, revisão, quantidade, histórico ou consumo. Cada empresa reaproveita seus checkpoints, consultas e recibos.
4. Falta de quota de busca não impede a leitura e análise autorizada de evidências já obtidas. A autorização comum continua verificando usuário, organização, contratação, campanha, revisão e aprovações; o serviço de cada efeito verifica sua própria fonte, orçamento e autorização imediatamente antes do efeito.
5. Pesquisa que precisa de novas consultas e não dispõe de quota permanece pausada de forma explícita, com indicação da limitação e caminho do Admin. Antes de novo lote, mostrar a capacidade disponível de aprofundamento e alertar quando o teto de empresas não é capacidade de concluir todo o lote. Não aumentar cotas automaticamente.
6. Respostas de IA só geram fatos quando sustentadas por evidência. Afirmação de perfil rejeitada fica em quarentena com motivo e não invalida automaticamente as demais afirmações verificáveis/qualificação independente. JSON inválido, referência inventada e conflito de identidade não são corrigidos por adivinhação ou relaxamento da validação.
7. Reprocessar resposta já obtida usa o recibo salvo. Falha após chamada paga ou recibo reservado/incerto não autoriza repetição; nova análise paga requer confirmação explícita, mantendo request/evidence identity e auditoria.
8. Referências editoriais/diretórios podem ser evidência contextual, mas não site oficial nem fonte de contatos da própria empresa. Preservar o histórico antigo separadamente, sem apagar evidências.
9. A barra representa trabalhos efetivamente finalizados; itens impedidos não a completam. A interface distingue dados incompletos de etapas não executadas e oferece uma ação contextual de recuperação.

## Restrições

- Somente `yux_admin` recebe fontes, ferramentas, modelos, custos, limites e diagnósticos técnicos; manter allowlists HTTP aninhadas e testes de isolamento entre contas.
- Não executar provedores/LLMs pagos, alterar modelos/chaves/cotas/orçamento de produção nem fazer deploy sem autorização específica. O desenvolvimento usa provedores simulados.
- Não apagar resultados, auditoria, recibos, overflow, revisões ou contadores. Não reenviar chamadas com resultado incerto.
- Não relaxar DNS fixado, bloqueio de redes privadas, TLS, robots, tamanho de resposta, leases ou contratos de transporte. Autorizações de certificado continuam específicas e temporárias.
- Manter o visual aprovado da YUX e o roteamento LLM existente do Admin. Não criar preset setorial/geográfico nem modificar CRM, missões, WhatsApp ou outros módulos.

## Aceitação

Regressão PostgreSQL com vinte empresas já admitidas, consultas concluídas e zero novas chamadas de descoberta; quota de busca esgotada ainda permite recuperar etapas sem novas buscas. Permissões/revisão/contratação revogadas continuam bloqueando. Dossiê inconclusivo é exibido como insuficiente, não concluído artificialmente. Falhas operacionais apontam causa/ação; nenhuma chamada incerta é repetida. Perfil parcialmente inválido não publica a afirmação inválida e conserva os fatos verificáveis. Frontend e HTTP preservam a separação Admin/cliente. Piloto real permanece uma etapa distinta de deploy e autorização financeira.

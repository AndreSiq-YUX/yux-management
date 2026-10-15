# Radar — novas empresas com pesquisa completa

## Pedido e problema confirmado

O usuário quer escolher quantas novas empresas buscar na mesma campanha e executar o percurso da descoberta ao aprofundamento final, sem uma segunda ação manual. Hoje `RadarWorkspace.runB2bBatch('discovery')` chama `/run-b2b-discovery`; `handleRadarRegionalDiscovery` somente descobre páginas CNPJá. `handleRadarRegionalVerification` e a pesquisa individual são operações separadas. O número 10 é o padrão de `batch.pageSize`, não uma quantidade escolhida no clique.

## Comportamento proposto para revisão

1. **Buscar mais empresas** abre uma janela com **Quantas novas empresas você quer pesquisar?**, quantidade inteira de 1 a 1.000, padrão 10. É uma quantidade adicional para esta operação, não alteração da campanha. A quantidade significa novas empresas únicas admitidas na campanha, não promessa de empresas aprovadas, qualificadas ou com todos os dados disponíveis.
2. Após confirmação, uma operação persistente executa descoberta, identificação da presença, leitura de páginas/canais, consolidação, sinais de atividade e qualificação/perfil/porte quando habilitados na campanha. Usa as fontes, modelos, finalidades, profundidade e critérios já configurados; não ativa opções pagas nem escolhe modelos automaticamente. Aprofundamento desativado ou indisponível deve ser explicado antes de iniciar, nunca virar silenciosamente uma execução só de descoberta.
3. As novas empresas desta operação seguem automaticamente para o pipeline individual existente. Não buscar o lote de candidatos mais antigos: somente os itens vinculados à operação. Duplicatas da campanha, registros aprovados e leads existentes não contam como novas empresas nem são reprocessados silenciosamente.
4. Reutilizar paginação por região e respeitar quotas, orçamento, limites de consultas/páginas e permissões. Encerrar a descoberta quando a quantidade adicional for atingida; se houver duplicatas, continuar apenas dentro dos limites autorizados. Não descartar resultados de uma página nem avançar o cursor perdendo excedentes: controlar a quantidade solicitada por página e persistir eventual excedente do provedor para admissão posterior, antes de novas chamadas.
5. Exibir total solicitado, novas empresas admitidas, em pesquisa, concluídas, com dados insuficientes e bloqueadas. Descobrir não significa concluir. Uma pesquisa executada até os limites pode terminar com dados insuficientes; indisponibilidade, quota, crédito, certificado pendente ou análise incerta impedem chamá-la de concluída com sucesso. Mostrar motivo e próxima ação.
6. Retomar conserva a operação, seus itens e os runs; não reinicia descoberta, não repete chamadas concluídas e não infere ausência de cobrança. Persistência não depende de manter a página aberta. Cliques/reenvios concorrentes com o mesmo request ID não criam duas operações ou duas pesquisas. Uma operação ativa por campanha/revisão; novas solicitações conflitantes retornam a operação existente, sem alterar sua quantidade.
7. A confirmação distingue teto estimado de descoberta CNPJá, teto de aprofundamento web/local e IA adicional segundo as rotas já autorizadas. Orçamento de buscas continua separado de IA. Se o teto/quantidade não puder ser atendido, informar execução parcial; não elevar limites automaticamente nem buscar indefinidamente para obter N empresas qualificadas.
8. Revisão/aprovação, entrega ao CRM/exportação e contato continuam separados e humanos. Preservar descoberta e verificação legadas em opções avançadas do Admin, com rótulos claros. A ação principal não deve exigir dois botões para o percurso completo.

## Limites de implementação e verificação

- Nenhuma chamada paga, alteração de modelo, credencial, licença, limites ou TLS de produção durante o desenvolvimento. Testes com provedores simulados.
- Preservar tenant, permissões atuais de pesquisa paga, revisões e dados/leads históricos. Mudança de configuração pausa a operação antiga antes de nova chamada; nunca mistura revisões.
- Usar jobs individuais e checkpoints existentes. Acrescentar estado durável/outbox restrito ao fluxo Radar para evitar perda entre a gravação e o enfileiramento; reconciliar apenas operações já autorizadas, sem iniciar novas captações.
- Publicar em main após testes e revisão conforme autorização anterior. Deploy/piloto pago continuam separados.

## Critérios de aceitação

Escolher 7 deve admitir no máximo 7 novas empresas na operação e encaminhar automaticamente as sete à pesquisa; duplicatas não consomem esse total. Recarregar ou fechar a página não interrompe o trabalho. Quota/IA indisponível deve mostrar operação parcial/pausada com retomada segura. Nenhum envio de mensagem, aprovação ou encaminhamento automático ao CRM. Fluxos antigos permanecem acessíveis.

## Ponto a confirmar

A quantidade é de **novas empresas únicas a pesquisar**, e não de empresas que obrigatoriamente terminem qualificadas/aprovadas. A segunda interpretação exigiria buscas adicionais de custo imprevisível e um objetivo comercial distinto.

# CRM de relacionamento: estado, decisões e próximos passos

Atualizado em 11/11/2026. Escopo: o fluxo de trabalho do cliente da plataforma com seus leads (Radar → CRM → contato por e-mail e WhatsApp → resposta → automação/IA). Piloto de referência: Villeman e Massas.

## 1. O que esta entrega resolve (branch `codex/crm-commercial-flow`)

| # | Ponto | Situação |
| --- | --- | --- |
| 1 | Produção "desatualizada" | **Não havia regressão.** Rotas e telas do último commit de CRM (03/11) respondem em produção. O `commit` do `/api/health` vem da variável manual `YUX_RELEASE_COMMIT` no Dokploy, que ficou em `7cba84f`. Ação: atualizar a variável a cada publicação (ou preenchê-la pelo pipeline). |
| 2 | E-mail comercial fora do `main` | Portado para o `main`, migration renumerada para `0261`. Unificado com o envio pela ficha que já existia: **um único caminho** (`/api/crm/leads/:id/email`), sempre com o remetente comercial aprovado da empresa (From + Reply-To). |
| 3 | Opt-in bloqueando prospecção | **Política de contato por organização** (Configurações → E-mails). Padrão: e-mail para o contato divulgado pela empresa **não exige opt-in**; WhatsApp mantém autorização (política da Meta). Toda mensagem comercial leva rodapé e cabeçalho `List-Unsubscribe` com descadastro em um clique. |
| 5 | Resposta do WhatsApp não voltava ao lead | A mensagem recebida agora encontra o contato/lead pelo telefone normalizado (inclui a equivalência do 9º dígito), grava a identidade do WhatsApp e cria o vínculo visível na ficha. Lead ambíguo (dois leads com o mesmo número) não é vinculado automaticamente. |
| 6 | Sequência não parava | Regra padrão **"Encerrar quando o lead responder"** por sequência (ligada por padrão). Resposta no WhatsApp move a inscrição para `manual` e cancela passos agendados. Descadastro também pausa. Desenho completo das regras na seção 2. |
| 8 | Ficha não enviava WhatsApp | Aba **Conversas** da ficha envia pelo número conectado: texto dentro da janela de 24h, modelo aprovado fora dela, com a política de contato aplicada. O link `wa.me` ficou como alternativa (sem registro). |
| 9 | Sem ações em massa | Seleção de até 100 leads na lista: mover etapa, inscrever em sequência, pausar sequências, excluir. Cada lead passa pelas mesmas regras de acesso do envio individual. |

Pendências desta entrega: resposta por **e-mail** ainda não é capturada (seção 3); o modo automático da IA continua desligado até o desenho da seção 4 ser implementado; a homologação final da Meta (vídeo) fica por último, como combinado.

## 2. Regras da sequência (funil de cadência)

Objetivo: o gestor configura e enxerga, em uma linha do tempo, o que acontece entre cada passo, sem precisar de fluxo genérico.

### Modelo de configuração

Cada passo tem quatro blocos, todos opcionais exceto a ação:

1. **Espera**: "aguardar N minutos/horas/dias" com opção *dias úteis* e *janela de envio* (ex.: seg–sex, 8h–18h, fuso da empresa). Fora da janela, o envio vai para a próxima abertura.
2. **Condição para executar**: só segue se *não respondeu* (padrão), *não abriu*, *abriu mas não respondeu*, *clicou*, *etapa do funil é X*, *tem WhatsApp autorizado*, *tem e-mail válido*. Se a condição falhar: pular o passo, ir para outro passo ou encerrar.
3. **Ação**: e-mail (modelo publicado), WhatsApp (modelo aprovado ou texto se dentro da janela), tarefa para o responsável (ligar, LinkedIn), mover etapa, notificar responsável, sugerir próxima ação pela IA.
4. **Alternativa de canal**: se o canal do passo estiver indisponível (sem autorização de WhatsApp, e-mail suprimido), usar outro canal ou criar tarefa, em vez de falhar em silêncio.

Regras de saída da sequência inteira (topo da tela, como "interruptores"): respondeu (já implementada), descadastrou (já implementada), mudou para etapa X, marcado ganho/perdido, reunião agendada, responsável assumiu manualmente.

### Visualização

Linha do tempo vertical, um cartão por passo, com a frase gerada a partir da configuração, por exemplo: *"Dia 0 · E-mail 'Apresentação' → espera 2 dias úteis → se não respondeu: WhatsApp 'primeiro_contato' (se autorizado; senão, tarefa: ligar) → espera 3 dias → se abriu e não respondeu: e-mail 'Caso de cliente'"*. Cada cartão mostra contadores reais (enviados, respondidos, pulados, bloqueados e o motivo). Simulação antes de ativar: escolher um lead e ver as datas previstas de cada passo.

### Implementação proposta

- `crm_sequence_steps.metadata.rules` (JSON versionado): `wait`, `when`, `otherwise`, `fallbackChannel`. A tabela já aceita `metadata`; não precisa de nova estrutura para começar.
- O agendador (`modules/crm/scheduler.ts`) avalia `when` no momento do vencimento, com os eventos já existentes (`email.opened`, `email.clicked`, `lead.response_received`, etapa atual) e grava o motivo de pulo/bloqueio na execução.
- Janela de envio por organização (reaproveitar o conceito de quiet hours de `prospecting_policies`).
- Testes de integração por regra (espera em dias úteis, condição falsa, alternativa de canal, saída por etapa).

Estimativa: 1 entrega para regras + agendador, 1 para a linha do tempo e simulação.

## 3. Respostas por e-mail: padrão de mercado e recomendação

### Como os CRMs fazem

- **Caixa conectada (padrão ouro)**: HubSpot, Pipedrive (sincronização em planos superiores), Apollo, Reply.io. O vendedor conecta Gmail/Microsoft 365 por OAuth (ou IMAP). O CRM envia pela própria caixa e lê a caixa de entrada. A resposta é ligada ao contato pelo identificador da mensagem original (cabeçalhos `In-Reply-To`/`References`) e pelo remetente. Resultado: entregabilidade de e-mail pessoal, histórico completo na ficha, sequência para na resposta. [HubSpot](https://knowledge.hubspot.com/connected-email/connect-your-inbox-to-hubspot) · [recursos que exigem caixa conectada](https://knowledge.hubspot.com/connected-email/what-features-are-supported-by-my-email-provider-and-require-a-connected-inbox) · [Pipedrive Smart BCC](https://intercom.help/pipedrive/en/articles/8425482-smart-bcc) · [Apollo](https://knowledge.apollo.io/hc/en-us/articles/4409237165837-Sequences-Overview) · [Reply.io](https://how.reply.io/behavior/reply-detection)
- **Endereço de cópia (BCC/encaminhamento)**: alternativa básica (HubSpot, Pipedrive "Smart BCC"). Depende de disciplina do usuário; não serve para automação. [HubSpot BCC](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address)
- **Resposta roteada por domínio (inbound parse)**: ferramentas que enviam por API (SendGrid, Postmark, Brevo, Mailgun) recebem a resposta num domínio com MX apontado para o provedor, que entrega o e-mail como JSON num webhook. [SendGrid](https://docs.sendgrid.com/for-developers/parsing-email/inbound-email) · [Postmark](https://postmarkapp.com/developer/user-guide/inbound/parse-an-email) · [Brevo](https://developers.brevo.com/docs/inbound-parse-webhooks.md)

O SMTP2GO é focado em envio; não encontramos recebimento/inbound parse documentado. Precisa confirmar com o suporte deles antes de descartar.

### Recomendação para a YUX

**Fase A (rápida, mantém o SMTP2GO no envio):** caixa de respostas dentro da plataforma.

- Cada e-mail comercial sai com `Reply-To` único (ex.: `r+<token>@respostas.comercial.yux.com.br`). O token identifica empresa, lead e mensagem.
- O subdomínio de respostas recebe por um serviço de entrada (opções: Postmark Inbound, Mailgun Routes, SendGrid Inbound Parse, ou Cloudflare Email Routing com Worker, se o DNS estiver na Cloudflare). Escolha depende de custo e de onde está o DNS: **decisão sua**, pois é serviço externo.
- Webhook `/api/webhooks/email-inbound` grava a resposta na ficha (aba E-mail, como conversa), dispara `lead.response_received` (para a sequência, sobe a prioridade, alimenta a IA) e **encaminha uma cópia** para a caixa comercial real da empresa, para quem preferir ler no próprio e-mail.
- A equipe responde pela ficha (sai pelo SMTP2GO com o mesmo identificador de conversa) ou pelo próprio e-mail. Neste caso a resposta só aparece no CRM se tiver a plataforma em cópia, o que leva à fase B.

**Fase B (padrão ouro, para quem quiser):** conectar Gmail/Microsoft 365 por OAuth, por usuário ou caixa compartilhada. Envio pela própria caixa e sincronização nos dois sentidos, com ligação pelos cabeçalhos da mensagem. Exige verificação de app no Google/Microsoft (escopos restritos de Gmail passam por avaliação de segurança), então demora mais e convém começar pela fase A.

## 4. Agente de WhatsApp autônomo

### O que existe

Recebimento, fila, chamada ao runtime de agentes, sugestão com aprovação, regras de marca, `handoff_events`, equipes, filas e regras de transferência (tabelas `omnichannel_teams`, `conversation_queues`, `handoff_rules`). O assistente é escolhido por empresa (prioriza SDR), não por número, e toda conversa nasce em modo assistido.

### Desenho proposto

**Perfil de agente** (um por objetivo; um número pode ter um agente padrão e a conversa pode trocar de agente):

- Objetivo e critério de sucesso (ex.: SDR: qualificar e agendar visita; Atendimento: tirar dúvidas e abrir pedido).
- Persona e tom, idioma, assinatura.
- Conhecimento permitido: estratégia publicada da empresa, portfólio/produtos, FAQ, tabela de preços (se autorizada), materiais anexáveis.
- Ações permitidas: responder, preencher campos do lead (com confirmação ou não), mover etapa, agendar reunião, enviar material, criar tarefa, transferir.
- Proibições: prometer prazo/preço/desconto fora da tabela, temas proibidos, dados sensíveis.
- Gatilhos de transferência (configuráveis): pedido explícito de pessoa, negociação de preço/condição, reclamação ou sentimento negativo, baixa confiança da IA, N mensagens sem avanço, palavras-chave, cliente estratégico, fora do horário (agente segura e avisa).
- Nível de autonomia: observar → sugerir (aprovação) → automático com limites (horário, máximo de mensagens por conversa, tipos de ação) → automático total. Evolução por agente, com histórico de qualidade.

O *system prompt* é **montado pela plataforma** a partir desses campos e das fontes publicadas, não escrito à mão. Assim cada conversa recebe exatamente o contexto daquele agente, daquele lead (dados do CRM, histórico, etapa) e daquela empresa.

**Como a transferência funciona no WhatsApp**: a conversa continua no **mesmo número da empresa**; o que muda é quem responde. Ao transferir: a IA para, a conversa vai para a fila/equipe definida e o responsável é avisado (notificação na plataforma, e opcionalmente uma mensagem no WhatsApp pessoal do vendedor ou e-mail com o link da conversa). O vendedor responde pela caixa de Atendimento (ou pela ficha do lead). Passar o número pessoal do vendedor ao cliente é possível (cartão de contato), mas a conversa sai do registro; deve ser opção explícita.

**Cadastro necessário**: para cada responsável, como ser avisado (WhatsApp pessoal, e-mail, só plataforma) e horário de atendimento; para cada equipe/fila, quem atende e o tempo máximo de espera antes de escalar.

**Implementação em etapas**: (1) perfil de agente por número + montagem do prompt + modo sugerir; (2) gatilhos e transferência com aviso ao responsável; (3) modo automático com limites, avaliações de qualidade e painel de conversas da IA; (4) ações (agendar, mover etapa, enviar material).

## 5. Action Engine: manter o conhecimento em dia

O Action Engine já tem as capacidades (`crm.sequence.enroll`, `email.message.queue`, `whatsapp.template.queue`, `omnichannel.message.draft`, `crm.task.create`). O conhecimento dele sobre o funcionamento real do CRM precisa acompanhar as mudanças. Regra: **ao final de cada entrega de CRM, e-mail ou WhatsApp**, atualizar:

1. `docs/yux-hub-catalogo-funcionalidades-capacidades.md`: o que o usuário pode fazer e os limites verificados.
2. `docs/crm-lead-management.md`: comportamento e regras.
3. Os manifestos/descrições das capabilities afetadas (`modules/action-engine/capabilities/*`) e as fontes de conhecimento publicadas para o Harness, com as regras desta entrega: política de contato, remetente comercial obrigatório, descadastro, parada por resposta, envio pela ficha, ações em massa e o vínculo automático de respostas do WhatsApp.

Ainda não atualizado para esta entrega: item 3 (capabilities e conhecimento publicado). Depende de decidir se o agente pode usar a política de contato da organização para enviar sem aprovação.

## 6. Villeman e Massas

Depois da publicação: aprovar o remetente comercial, revisar a política de contato (padrão já atende e-mail para contato divulgado), publicar os três modelos de e-mail, configurar a sequência (já existe pausada, com três passos) com "encerrar quando responder" ligado, inscrever os leads qualificados em massa e acompanhar respostas na ficha. WhatsApp entra quando o número da Villeman estiver conectado e o modelo de primeiro contato aprovado na Meta.

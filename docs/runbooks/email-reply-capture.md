# Captura de respostas de e-mail comercial

Serviço: **Cloudflare Email Routing + Email Worker** (gratuito; o DNS de `yux.com.br` já está na Cloudflare). O envio continua pelo SMTP2GO.

## Como funciona

1. Cada e-mail comercial (ficha do lead e sequências) sai com `Reply-To: r+<token>@respostas.yux.com.br`. O token identifica o envio, a empresa e o lead.
2. A Cloudflare recebe a resposta nesse subdomínio e entrega ao Worker `yux-email-inbound` (`workers/email-inbound`).
3. O Worker lê a mensagem e chama `POST https://hub.yux.com.br/api/webhooks/email-inbound`, assinado com HMAC-SHA256 (`x-yux-timestamp`, `x-yux-signature`, validade de 5 minutos).
4. A API grava a resposta na ficha (aba E-mail e histórico), encerra sequências com "Encerrar quando o lead responder", dispara `lead.response_received` (prioridade e IA) e envia uma cópia à caixa comercial da empresa, com `Reply-To` do próprio contato.
5. Respostas automáticas (ausência/férias) ficam registradas, mas não contam como resposta.
6. Endereço desconhecido ou API fora do ar: o Worker encaminha a mensagem a `FALLBACK_TO` (se configurado); nada se perde em silêncio.

Sem `EMAIL_REPLY_DOMAIN` na API e nos workers, nada muda: o `Reply-To` continua sendo a caixa comercial aprovada e o webhook responde 503.

## Configuração (uma vez)

**Atenção:** o e-mail principal `@yux.com.br` usa Spacemail (MX `mx1/mx2.spacemail.com`). Ativar o Email Routing **somente no subdomínio**. Se a Cloudflare pedir para remover ou substituir os MX do domínio principal, **cancelar**: isso derrubaria o e-mail da YUX. Antes de começar, exportar o DNS (DNS → Records → Export).

1. Gerar um segredo: `openssl rand -hex 32` (ou outro gerador seguro). Não colar em chat nem documentação.
2. Cloudflare → `yux.com.br` → Email → Email Routing → Settings → **Subdomains** → adicionar `respostas`. Conferir que apenas registros de `respostas.yux.com.br` foram criados (MX e TXT/SPF do subdomínio).
3. Email Routing → Settings → ativar **Subaddressing** (endereços `r+token@...`).
4. (Opcional, recomendado) Destination addresses → adicionar e verificar a caixa de operação da YUX que receberá mensagens não reconhecidas.
5. Publicar o Worker, no diretório `workers/email-inbound`:
   ```bash
   npm ci --legacy-peer-deps
   ```
   ```bash
   npx wrangler login
   ```
   ```bash
   npx wrangler secret put INBOUND_SECRET
   ```
   ```bash
   npx wrangler deploy
   ```
   Para usar o encaminhamento de segurança, descomentar `FALLBACK_TO` no `wrangler.toml` com o endereço verificado no passo 4 antes do deploy.
6. Email Routing → Routing rules → **Create address**: `r@respostas.yux.com.br` → ação **Send to a Worker** → `yux-email-inbound`.
7. Dokploy → variáveis do projeto: `EMAIL_REPLY_DOMAIN=respostas.yux.com.br` e `EMAIL_INBOUND_SECRET=<o mesmo segredo>`. Publicar novamente API e workers.

## Verificação

1. Na ficha de um lead de teste (e-mail controlado pela equipe), enviar um e-mail. No e-mail recebido, conferir que o "Responder" aponta para `r+...@respostas.yux.com.br`.
2. Responder com um texto curto. Em até 1 minuto: aba E-mail da ficha mostra a resposta; histórico mostra "E-mail recebido"; a caixa comercial da empresa recebe a cópia.
3. Responder pela ficha usando **Responder**: a mensagem chega no mesmo fio no e-mail do contato.
4. Cloudflare → Workers → `yux-email-inbound` → Logs: sem erros. Uma resposta para `r+inexistente@respostas.yux.com.br` deve ir ao `FALLBACK_TO` (ou ser recusada, sem fallback).

## Rollback

Remover `EMAIL_REPLY_DOMAIN` no Dokploy e publicar: novos e-mails voltam a responder direto para a caixa comercial. Manter a regra da Cloudflare ativa até as respostas a e-mails antigos pararem de chegar.

## Limites atuais

- Anexos: só nome e tamanho ficam no CRM; o arquivo chega na cópia enviada à caixa comercial.
- Resposta feita direto pelo e-mail da empresa (fora da plataforma) vai ao contato, mas não fica registrada no CRM. Para histórico completo, responder pela ficha. A sincronização de caixa Gmail/Microsoft 365 é a fase seguinte (`docs/crm-relacionamento-plano.md`, seção 3).

# Usuários da conta do cliente

Completar a página Empresa / Usuários e Equipe e oferecer a mesma gestão na ficha/edição do cliente. Reutilizar memberships, app_users, client_admin/client_member e o convite de definição de senha. Administradores gerenciam os módulos contratados; membros mantêm as permissões limitadas já existentes e não gerenciam usuários. A escolha técnica evita criar um sistema paralelo de autorização.

Exigir nome, e-mail e função; exibir situação e último login; editar função, desativar/reativar, reenviar convite ou redefinição. O convidado usa o e-mail informado e cria sua senha. A falha de envio preserva o cadastro e permite reenvio.

Autorizar cada operação no servidor pela organização e membership. Rejeitar contas internas, e-mails já cadastrados e alterações de contas compartilhadas entre organizações. Impedir alteração do próprio acesso e perda do último administrador ativo. Serializar alterações por organização, sincronizar app_users/membership, invalidar sessões ao mudar acesso e registrar auditoria. Não retornar tokens ou links secretos. Não alterar contato principal, contratos ou módulos. Sem novas dependências ou migrações. Testar isolamento, convites, limites e UI. Não enviar e-mails reais nos testes.

## Integração com a main atual

Preservar os controles existentes de pessoas, equipes e vagas comerciais do CRM na página Equipe, adicionando a gestão de acesso ao portal independentemente da contratação de CRM. Preservar o shell PortalPage e as rotas atuais.

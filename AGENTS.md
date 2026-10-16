# Regras permanentes do projeto

## Radar Comercial: audiência e confidencialidade

- Somente o papel global `yux_admin` pode receber/ver ferramentas, fornecedores, modelos, rotas LLM, licenças, custos internos e diagnósticos técnicos do Radar. `client_admin`, `client_member`, `yux_operator`, administração da conta e `platform.manage` não concedem essa visibilidade.
- Clientes recebem resultados comerciais: empresa/CNPJ cadastral, localização, site, contatos, perfil, aderência, porte, evidências públicas úteis e situação legível. CNPJ da empresa não é o fornecedor CNPJá; preserve o dado cadastral, não divulgue o mecanismo de coleta.
- Aplicar a separação no backend, por allowlists explícitas inclusive aninhadas, além da interface. Não expor JSON bruto, nomes/IDs de fonte, prompts, modelos, recibos, tokens, chaves, custos ou erros de infraestrutura em detalhes, histórico, respostas HTTP, exportações ou novas entregas ao CRM.
- Nenhum campo novo passa automaticamente ao cliente. Mudanças de DTO/interface exigem testes com Admin YUX, operador, Admin da conta e membro; incluir chamada HTTP direta e isolamento entre contas. Dados comerciais legítimos (inclusive nomes parecidos com fornecedores) não podem ser mutilados por substituição global de texto.
- Não remover obrigações de atribuição/licença para ocultar ferramentas: material com obrigação incompatível permanece restrito ao Admin até solução autorizada. Preservar histórico/auditoria e validar direitos de entrega.
- Não criar custos/cobrança por consumo visíveis ao cliente sem pedido explícito. Ferramentas antigas continuam disponíveis em área técnica do Admin; a operação principal deve ter quantidade visível e uma ação contextual de pesquisar/retomar.

## Serviços pagos externos

Não executar chamadas a provedores/LLMs externos pagos nem trocar/ativar um modelo pago sem autorização explícita do usuário para o serviço/modelo. Testes de desenvolvimento usam provedores simulados; publicar código não autoriza deploy, piloto pago ou mudança de credenciais/limites.

# E-mail comercial individual

- [x] Persistir a configuração por organização e revisar no Admin YUX. Validar o domínio gerenciado, exigir confirmação da caixa de resposta e invalidar a aprovação quando os dados mudarem.
- [x] Enfileirar um teste para a caixa aprovada e um envio para o endereço registrado no lead. Usar o outbox na mesma transação, impedir duplicação e bloquear supressões, alterações de identidade ou de destinatário antes do envio.
- [x] Expor o cadastro no Portal, a aprovação no Admin e o envio e histórico na ficha do lead.
- [x] Cobrir isolamento entre organizações, privilégios, seleção de From e Reply-To, e a compatibilidade com mensagens institucionais em testes automatizados.
- [ ] Provisionar o endereço e a caixa do piloto em produção e validar a entrega e a resposta.

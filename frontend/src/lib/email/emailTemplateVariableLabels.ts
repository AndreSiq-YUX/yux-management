/** Nomes amigáveis das variáveis de modelos de e-mail, para o cliente não digitar `{{...}}`. */
const VARIABLE_LABELS: Record<string, string> = {
  contact_name: 'Nome do contato',
  name: 'Nome',
  lead_name: 'Nome do lead',
  company_name: 'Nome da empresa',
  email: 'E-mail do contato',
  date: 'Data',
  time: 'Horário',
  unsubscribe_url: 'Link de descadastro',
  invite_url: 'Link de convite',
  reset_url: 'Link para redefinir a senha',
  proposal_url: 'Link da proposta',
}

/** Variáveis que o cliente pode inserir em qualquer modelo, na ordem em que aparecem nos botões. */
export const STANDARD_PORTAL_VARIABLES = ['contact_name', 'company_name', 'unsubscribe_url'] as const

export function emailVariableLabel(variable: string): string {
  const known = VARIABLE_LABELS[variable]
  if (known) return known
  const words = variable.replace(/_url$/, '_link').split('_').filter(Boolean)
  if (words.length === 0) return variable
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

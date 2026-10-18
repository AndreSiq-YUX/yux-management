/** Iniciais para avatares: duas letras (primeiro e último nome) ou as duas primeiras de um nome só. */
export function getInitials(name?: string | null) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Y'
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`
  return letters.toUpperCase()
}

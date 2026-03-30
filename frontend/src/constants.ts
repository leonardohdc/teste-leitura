/** Espelho das categorias permitidas no backend (strings exactas). */
export const ALLOWED_CATEGORIES = [
  'Jogos virtuais',
  'padaria',
  'mercado',
  'transferências pessoais',
  'livros',
  'credito',
  'investimentos',
] as const

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

export const UNCATEGORIZED = 'Não classificado'

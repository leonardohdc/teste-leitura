import { useCallback, useEffect, useState } from 'react'
import { getCategories, postCategory } from '../api'
import { DEFAULT_ALLOWED_CATEGORIES } from '../constants'

export function useAllowedCategories() {
  const [categories, setCategories] = useState<string[]>(() => [
    ...DEFAULT_ALLOWED_CATEGORIES,
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const c = await getCategories()
      setCategories(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar categorias')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addCategory = useCallback(async (name: string) => {
    setError(null)
    const next = await postCategory(name)
    setCategories(next)
  }, [])

  return { categories, loading, error, refresh, addCategory }
}

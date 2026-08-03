import { supabase } from '../lib/supabase'

const rowsCache = new Map<string, Promise<unknown[]>>()

export function clearSupabaseRowsCache(): void {
  rowsCache.clear()
}

export async function fetchAllRowsFromView<T extends Record<string, unknown>>(
  view: string,
  pageSize = 1000,
  selectColumns = '*',
): Promise<T[]> {
  const cacheKey = `${view}:${pageSize}:${selectColumns}`
  const cached = rowsCache.get(cacheKey)

  if (cached) {
    return cached as Promise<T[]>
  }

  const request = (async () => {
  const rows: T[] = []
  let from = 0

  while (true) {
    const query = await supabase
      .schema('despachos')
      .from(view)
      .select(selectColumns)
      .range(from, from + pageSize - 1)

    if (query.error) {
      throw query.error
    }

    const batch = (query.data ?? []) as unknown as T[]
    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
  })()

  rowsCache.set(cacheKey, request as Promise<unknown[]>)

  try {
    return await request
  } catch (error) {
    rowsCache.delete(cacheKey)
    throw error
  }
}
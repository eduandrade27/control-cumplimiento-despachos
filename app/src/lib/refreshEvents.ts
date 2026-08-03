type RefreshListener = () => void

const listeners = new Set<RefreshListener>()

export function subscribeToSupabaseRefresh(listener: RefreshListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function dispatchSupabaseRefresh(): void {
  listeners.forEach((listener) => listener())
}

import type { OperationalDashboardData, SupabaseErrorInfo } from '../types/operational'
import { fetchOperationalBaseData } from './operationalDataCache'

function toSupabaseError(error: unknown): SupabaseErrorInfo {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>

    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Error desconocido al consultar Operativo.',
  }
}

export async function fetchOperationalDashboardData(): Promise<OperationalDashboardData> {
  try {
    const baseData = await fetchOperationalBaseData()

    return {
      monthlyRows: baseData.monthlyRows,
      dailyRows: baseData.dailyRows,
      detailRows: baseData.detailRows,
      availableMonths: baseData.availableMonths,
    }
  } catch (error) {
    throw toSupabaseError(error)
  }
}

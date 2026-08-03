export type ModuleKey =
  | 'operativo'
  | 'comercial'
  | 'analisis_causas'
  | 'consulta'
  | 'historico'
  | 'validacion'
  | 'configuracion'

export interface NavigationItem {
  key: ModuleKey
  label: string
  path: string
  description: string
}

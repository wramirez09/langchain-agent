import { resolveStateId } from '@/app/agents/metaData/states'

export function resolveCmsStateId(stateName: string): number | null {
  return resolveStateId(stateName)
}

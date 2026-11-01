import { Badge } from '@/components/ui/badge'
import { temperatureLabels } from '@/types/crmQualification'
export function LeadTemperature({ temperature }: { temperature?: string }) {
  if (!temperature || !(temperature in temperatureLabels)) return null
  return (
    <Badge variant="secondary">
      {temperatureLabels[temperature as keyof typeof temperatureLabels]}
    </Badge>
  )
}

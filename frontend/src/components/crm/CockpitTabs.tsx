import { CalendarDays, Kanban, List, Target, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type CockpitTab = 'kanban' | 'list' | 'today' | 'calendar' | 'sources'

interface CockpitTabsProps {
  activeTab: CockpitTab
  onTabChange: (tab: CockpitTab) => void
}

const tabs: Array<{ key: CockpitTab; label: string; icon: typeof Kanban }> = [
  { key: 'kanban', label: 'Kanban', icon: Kanban },
  { key: 'list', label: 'Lista', icon: List },
  { key: 'today', label: 'Hoje', icon: Target },
  { key: 'calendar', label: 'Calendario', icon: CalendarDays },
  { key: 'sources', label: 'Fontes', icon: Workflow },
]

export function CockpitTabs({ activeTab, onTabChange }: CockpitTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-2">
      {tabs.map(item => {
        const Icon = item.icon
        return (
          <Button
            key={item.key}
            type="button"
            variant={activeTab === item.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange(item.key)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {item.label}
          </Button>
        )
      })}
    </div>
  )
}

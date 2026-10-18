import { CalendarDays, Kanban, List, Target, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type CockpitTab = 'kanban' | 'list' | 'today' | 'calendar' | 'sources'

interface CockpitTabsProps {
  activeTab: CockpitTab
  onTabChange: (tab: CockpitTab) => void
  /** `portal` acentua os rótulos em português do cliente. */
  profile?: 'internal' | 'portal'
}

const tabs: Array<{ key: CockpitTab; label: string; portalLabel: string; icon: typeof Kanban }> = [
  { key: 'kanban', label: 'Kanban', portalLabel: 'Kanban', icon: Kanban },
  { key: 'list', label: 'Lista', portalLabel: 'Lista', icon: List },
  { key: 'today', label: 'Hoje', portalLabel: 'Hoje', icon: Target },
  { key: 'calendar', label: 'Calendario', portalLabel: 'Calendário', icon: CalendarDays },
  { key: 'sources', label: 'Fontes', portalLabel: 'Origens', icon: Workflow },
]

/** Abas da visão de leads. Rolam na horizontal quando não cabem (celular). */
export function CockpitTabs({ activeTab, onTabChange, profile = 'internal' }: CockpitTabsProps) {
  return (
    <div
      role="group"
      aria-label="Visualização dos leads"
      className="flex gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-yx-line bg-yx-surface p-2 [scrollbar-width:thin]"
    >
      {tabs.map(item => {
        const Icon = item.icon
        return (
          <Button
            key={item.key}
            type="button"
            variant={activeTab === item.key ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={activeTab === item.key}
            className="min-h-10 shrink-0 sm:min-h-0"
            onClick={() => onTabChange(item.key)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {profile === 'portal' ? item.portalLabel : item.label}
          </Button>
        )
      })}
    </div>
  )
}

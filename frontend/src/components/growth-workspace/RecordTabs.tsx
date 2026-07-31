import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface RecordTabItem {
  key: string
  label: string
  content: ReactNode
  disabled?: boolean
}

interface RecordTabsProps {
  tabs: RecordTabItem[]
  defaultValue?: string
}

export function RecordTabs({ tabs, defaultValue }: RecordTabsProps) {
  const firstEnabled = tabs.find(tab => !tab.disabled)
  const activeDefault = defaultValue || firstEnabled?.key || tabs[0]?.key

  return (
    <Tabs defaultValue={activeDefault} className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
        {tabs.map(tab => (
          <TabsTrigger key={tab.key} value={tab.key} disabled={tab.disabled} className="text-xs">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(tab => (
        <TabsContent key={tab.key} value={tab.key} className="space-y-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

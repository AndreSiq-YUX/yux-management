import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AdminTeam {
  id: string
  name: string
  availabilityMode: string
  isActive: boolean
  members: Array<{ id: string; name: string; available: boolean }>
}

export interface AdminQueue {
  id: string
  name: string
  strategy: string
  teamName?: string
  isActive: boolean
}

interface TeamQueueManagerProps {
  teams: AdminTeam[]
  queues: AdminQueue[]
  onSaveTeam?: (teamId: string) => void
  onSaveQueue?: (queueId: string) => void
}

export function TeamQueueManager({ teams, queues, onSaveTeam, onSaveQueue }: TeamQueueManagerProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Equipes e filas</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-white">
          <header className="border-b px-3 py-2 text-sm font-medium">Equipes</header>
          <div className="divide-y">
            {teams.map(team => (
              <article key={team.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{team.name}</p>
                    <p className="text-xs text-gray-500">{team.availabilityMode} - {team.isActive ? 'ativa' : 'inativa'}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" title="Salvar equipe" onClick={() => onSaveTeam?.(team.id)}><Save className="mr-1 h-3 w-3" />Salvar</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-gray-600">
                  {team.members.map(member => <span key={member.id} className="rounded border px-2 py-1">{member.name} {member.available ? 'disponivel' : 'indisponivel'}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-white">
          <header className="border-b px-3 py-2 text-sm font-medium">Filas</header>
          <div className="divide-y">
            {queues.map(queue => (
              <article key={queue.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{queue.name}</p>
                    <p className="text-xs text-gray-500">{queue.strategy} - {queue.teamName || 'sem equipe'} - {queue.isActive ? 'ativa' : 'inativa'}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" title="Salvar fila" onClick={() => onSaveQueue?.(queue.id)}><Save className="mr-1 h-3 w-3" />Salvar</Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

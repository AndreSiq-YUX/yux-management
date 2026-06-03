import { CheckCircle2, FilePlus2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AdminKnowledgeState {
  drafts: Array<{ id: string; title: string; status: string }>
  publications: Array<{ id: string; title: string; bodySnapshot: string }>
}

interface KnowledgeManagerProps {
  organizationId: string
  knowledge: AdminKnowledgeState
  onCreateKnowledgeDraft?: (organizationId: string) => void
  onSubmitKnowledgeReview?: (entryId: string) => void
  onPublishKnowledge?: (entryId: string) => void
}

export function KnowledgeManager({
  organizationId,
  knowledge,
  onCreateKnowledgeDraft,
  onSubmitKnowledgeReview,
  onPublishKnowledge,
}: KnowledgeManagerProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Base de conhecimento</h2>
        <Button type="button" size="sm" title="Criar rascunho de conhecimento" onClick={() => onCreateKnowledgeDraft?.(organizationId)}><FilePlus2 className="mr-1 h-3 w-3" />Novo rascunho</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-white">
          <header className="border-b px-3 py-2 text-sm font-medium">Rascunhos e revisao</header>
          <div className="divide-y">
            {knowledge.drafts.map(entry => (
              <article key={entry.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div><p className="font-medium">{entry.title}</p><p className="text-xs text-gray-500">{entry.status}</p></div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" title="Enviar conhecimento para revisao" onClick={() => onSubmitKnowledgeReview?.(entry.id)}><Send className="mr-1 h-3 w-3" />Revisao</Button>
                  <Button type="button" size="sm" variant="outline" title="Publicar conhecimento" onClick={() => onPublishKnowledge?.(entry.id)}><CheckCircle2 className="mr-1 h-3 w-3" />Publicar</Button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-white">
          <header className="border-b px-3 py-2 text-sm font-medium">Historico publicado</header>
          <div className="divide-y">
            {knowledge.publications.map(publication => (
              <article key={publication.id} className="p-3 text-sm">
                <p className="font-medium">{publication.title}</p>
                <p className="mt-1 text-xs text-gray-600">{publication.bodySnapshot}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

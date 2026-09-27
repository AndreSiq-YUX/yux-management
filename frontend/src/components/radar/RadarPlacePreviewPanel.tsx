import type { RadarPlacePreview } from '@/types/radar'

export function RadarPlacePreviewPanel({ places, attribution }: { places: RadarPlacePreview[]; attribution: string }) {
  return (
    <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/40 p-3">
      <p className="text-sm font-semibold text-slate-900">Resultados da busca local — {attribution}</p>
      <p className="mt-1 text-xs text-slate-600">Esta é uma pré-visualização temporária. Os resultados não são salvos no Radar ou CRM e não iniciam contato.</p>
      {places.length === 0 && <p className="mt-3 text-sm text-slate-600">Nenhuma empresa retornada nesta consulta; isso não prova ausência de empresas na região.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {places.map((place, index) => (
          <div key={`${place.provider}-${index}`} className="rounded-md border bg-white p-3 text-sm">
            <p className="font-semibold text-slate-950">{place.name}</p>
            {place.address && <p className="mt-1 text-slate-600">{place.address}</p>}
            <p className="mt-1 text-slate-600">{place.websiteUrl
              ? <>Site informado, ainda não verificado: <a href={place.websiteUrl} target="_blank" rel="noreferrer" className="text-yux-700 underline">{place.websiteUrl}</a></>
              : 'Site não informado; situação desconhecida'}</p>
            {place.phone && <p className="mt-1 text-slate-600">Telefone: {place.phone}</p>}
            {place.email && <p className="mt-1 text-slate-600">E-mail: {place.email}</p>}
            {place.instagramUrl && <p className="mt-1 text-slate-600">Instagram: <a href={place.instagramUrl} target="_blank" rel="noreferrer" className="text-yux-700 underline">{place.instagramUrl}</a></p>}
            {place.rating !== undefined && <p className="mt-1 text-slate-600">Avaliação: {place.rating.toFixed(1)}{place.reviewCount !== undefined ? ` (${place.reviewCount} avaliações)` : ''}</p>}
            {place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-yux-700 underline">Ver na fonte</a>}
          </div>
        ))}
      </div>
    </div>
  )
}

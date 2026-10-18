import { cn } from '@/lib/utils'

export type SparklineTone = 'good' | 'bad' | 'flat'

export interface SparklineProps {
  values: number[]
  tone?: SparklineTone
  className?: string
}

const toneClass: Record<SparklineTone, string> = {
  good: 'text-yx-blue',
  bad: 'text-yx-crit',
  flat: 'text-yx-fg-3',
}

const WIDTH = 100
const HEIGHT = 34
const PAD_Y = 3

/** Calcula as coordenadas (x em 0–100, y em 0–34) de cada ponto. Exportado para testes. */
export function sparklinePoints(values: number[]): Array<[number, number]> {
  const finite = values.filter(v => Number.isFinite(v))
  if (finite.length < 2) return []
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min
  const usable = HEIGHT - PAD_Y * 2
  return finite.map((v, i) => {
    const x = (i / (finite.length - 1)) * WIDTH
    const y = range === 0 ? HEIGHT / 2 : PAD_Y + (1 - (v - min) / range) * usable
    return [Number(x.toFixed(2)), Number(y.toFixed(2))]
  })
}

/**
 * Mini-gráfico de linha em SVG (decorativo, `aria-hidden`). Não renderiza nada com menos de 2 valores.
 * O ponto final é um elemento HTML para não distorcer com `preserveAspectRatio="none"`.
 */
export function Sparkline({ values, tone = 'good', className }: SparklineProps) {
  const points = sparklinePoints(values)
  if (points.length < 2) return null

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`
  const [, lastY] = points[points.length - 1]

  return (
    <div aria-hidden="true" className={cn('relative mt-0.5 block h-[34px] w-full pr-[3px]', toneClass[tone], className)}>
      <div className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          focusable="false"
          className="block h-full w-full overflow-visible"
        >
          <path d={area} fill="currentColor" fillOpacity={0.1} stroke="none" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ vectorEffect: 'non-scaling-stroke' }}
          />
        </svg>
        <span
          className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
          style={{ left: '100%', top: `${(lastY / HEIGHT) * 100}%` }}
        />
      </div>
    </div>
  )
}

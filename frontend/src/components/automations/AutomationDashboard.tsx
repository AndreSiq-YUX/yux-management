import { Activity, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AutomationFlow } from '@/types/automation'

interface AutomationDashboardProps {
  flows: AutomationFlow[]
}

export function AutomationDashboard({ flows }: AutomationDashboardProps) {
  const metrics = useMemo(() => {
    const activeFlows = flows.filter(f => f.isEnabled).length
    const totalExecutions = flows.reduce((sum, f) => sum + f.executionRuns.length, 0)
    const successfulExecutions = flows.reduce(
      (sum, f) => sum + f.executionRuns.filter(r => r.status === 'completed').length,
      0,
    )
    const failedExecutions = flows.reduce(
      (sum, f) => sum + f.executionRuns.filter(r => r.status === 'failed').length,
      0,
    )
    const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0
    const lastError = flows.find(f => f.lastError)?.lastError

    return {
      activeFlows,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      lastError,
    }
  }, [flows])

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    flows.forEach(f => {
      counts[f.status] = (counts[f.status] || 0) + 1
    })
    return Object.entries(counts).map(([status, count]) => ({ status, count }))
  }, [flows])

  const executionsByFlow = useMemo(() => {
    return flows
      .filter(f => f.executionRuns.length > 0)
      .slice(0, 5)
      .map(f => ({
        name: f.name.length > 20 ? `${f.name.slice(0, 20)}...` : f.name,
        executions: f.executionRuns.length,
        success: f.executionRuns.filter(r => r.status === 'completed').length,
        failed: f.executionRuns.filter(r => r.status === 'failed').length,
      }))
  }, [flows])

  const COLORS = ['var(--yx-blue)', 'var(--yx-ok)', 'var(--yx-warn)', 'var(--yx-crit)', 'var(--yx-fg-3)']

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Fluxos ativos"
          value={metrics.activeFlows}
          icon={<Activity className="h-5 w-5 text-yx-blue" />}
          color="blue"
        />
        <MetricCard
          label="Execuções hoje"
          value={metrics.totalExecutions}
          icon={<TrendingUp className="h-5 w-5 text-yx-ok" />}
          color="green"
        />
        <MetricCard
          label="Taxa de sucesso"
          value={`${metrics.successRate}%`}
          icon={<CheckCircle className="h-5 w-5 text-yx-ok" />}
          color="emerald"
        />
        <MetricCard
          label="Último erro"
          value={metrics.lastError ? 'Sim' : 'Não'}
          icon={<AlertCircle className="h-5 w-5 text-yx-crit" />}
          color="red"
          subtitle={metrics.lastError}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-yx-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-yx-fg">Fluxos por status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={60}
                label={({ status, count }) => `${status}: ${count}`}
              >
                {statusData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-md border bg-yx-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-yx-fg">Top 5 fluxos por execuções</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={executionsByFlow}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="success" fill="var(--yx-ok)" name="Sucesso" />
              <Bar dataKey="failed" fill="var(--yx-crit)" name="Falha" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

function MetricCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'emerald' | 'red'
  subtitle?: string
}) {
  const colorClasses = {
    blue: 'bg-yx-blue-soft border-yx-line-strong',
    green: 'bg-yx-ok-soft border-yx-ok-line',
    emerald: 'bg-yx-ok-soft border-yx-ok-line',
    red: 'bg-yx-crit-soft border-yx-crit-line',
  }

  return (
    <div className={`rounded-md border p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-yx-fg-2">{label}</p>
          <p className="text-2xl font-bold text-yx-fg">{value}</p>
          {subtitle && <p className="text-xs text-yx-fg-3 truncate max-w-[200px]">{subtitle}</p>}
        </div>
        {icon}
      </div>
    </div>
  )
}

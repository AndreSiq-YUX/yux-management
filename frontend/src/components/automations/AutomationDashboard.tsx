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

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6b7280']

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Fluxos ativos"
          value={metrics.activeFlows}
          icon={<Activity className="h-5 w-5 text-blue-600" />}
          color="blue"
        />
        <MetricCard
          label="Execuções hoje"
          value={metrics.totalExecutions}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
          color="green"
        />
        <MetricCard
          label="Taxa de sucesso"
          value={`${metrics.successRate}%`}
          icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
          color="emerald"
        />
        <MetricCard
          label="Último erro"
          value={metrics.lastError ? 'Sim' : 'Não'}
          icon={<AlertCircle className="h-5 w-5 text-red-600" />}
          color="red"
          subtitle={metrics.lastError}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Fluxos por status</h3>
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

        <div className="rounded-md border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Top 5 fluxos por execuções</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={executionsByFlow}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="success" fill="#10b981" name="Sucesso" />
              <Bar dataKey="failed" fill="#ef4444" name="Falha" />
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
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    red: 'bg-red-50 border-red-200',
  }

  return (
    <div className={`rounded-md border p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 truncate max-w-[200px]">{subtitle}</p>}
        </div>
        {icon}
      </div>
    </div>
  )
}

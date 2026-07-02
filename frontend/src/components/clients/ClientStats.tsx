import { Users, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ClientStatsProps {
  stats: {
    totalClients: number;
    activeClients: number;
    totalRevenue: number;
    averageValue: number;
    newClientsThisMonth: number;
    conversionRate: number;
  };
  loading?: boolean;
}

export function ClientStats({ stats, loading = false }: ClientStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-7 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total de Clientes',
      value: stats.totalClients.toLocaleString(),
      subtitle: `${stats.activeClients} ativos`,
      icon: Users,
    },
    {
      title: 'Receita Total',
      value: formatCurrency(stats.totalRevenue),
      subtitle: `Media: ${formatCurrency(stats.averageValue)}`,
      icon: DollarSign,
    },
    {
      title: 'Novos Clientes',
      value: stats.newClientsThisMonth.toString(),
      subtitle: 'Este mes',
      icon: Calendar,
    },
    {
      title: 'Taxa de Conversao',
      value: `${stats.conversionRate.toFixed(1)}%`,
      subtitle: 'Lead para cliente',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {statCards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white p-5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {card.title}
              </p>
            </div>
            
            <p className="text-2xl font-semibold text-gray-900 mb-1">
              {card.value}
            </p>
            <p className="text-sm text-gray-500">
              {card.subtitle}
            </p>
          </div>
        );
      })}
    </div>
  );
}

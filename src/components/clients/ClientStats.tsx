import React from 'react';
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
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
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Receita Total',
      value: formatCurrency(stats.totalRevenue),
      subtitle: `Média: ${formatCurrency(stats.averageValue)}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Novos Clientes',
      value: stats.newClientsThisMonth.toString(),
      subtitle: 'Este mês',
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Taxa de Conversão',
      value: `${stats.conversionRate.toFixed(1)}%`,
      subtitle: 'Lead para cliente',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statCards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">
                {card.title}
              </p>
              <p className="text-2xl font-bold text-gray-900 mb-1">
                {card.value}
              </p>
              <p className="text-sm text-gray-500">
                {card.subtitle}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
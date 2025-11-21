'use client';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function StatCard({ title, value, subtitle, variant = 'default' }: StatCardProps) {
  const variantColors = {
    default: 'text-white',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="stat-card">
      <p className="text-zinc-400 text-sm">{title}</p>
      <p className={`text-3xl font-bold mt-1 ${variantColors[variant]}`}>{value}</p>
      {subtitle && <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: 'default' | 'green' | 'blue' | 'amber' | 'red'
}

const colorMap = {
  default: 'bg-card',
  green: 'bg-success/5 border-success/10',
  blue: 'bg-primary/5 border-primary/10',
  amber: 'bg-warning/5 border-warning/10',
  red: 'bg-destructive/5 border-destructive/10',
}

export function StatCard({ label, value, sub, color = 'default' }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  )
}

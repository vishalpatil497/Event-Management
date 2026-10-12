import type { LucideIcon } from 'lucide-react'

export default function StatCard({ label, value, change, icon: Icon, accent = 'blue' }: { label: string; value: string; change: string; icon: LucideIcon; accent?: string }) {
  return <div className="stat-card"><div className={`stat-icon ${accent}`}><Icon size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className="positive">+ {change}</small></div></div>
}


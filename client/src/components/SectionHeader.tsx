export default function SectionHeader({ title, description, action, onAction }: { title: string; description?: string; action?: string; onAction?: () => void }) {
  return <div className="section-header"><div><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action} <span>{'->'}</span></button>}</div>
}



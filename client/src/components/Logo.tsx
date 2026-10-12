import { Zap } from './Icons'

export default function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="logo"><span className="logo-mark"><Zap size={15} fill="currentColor" /></span>{!compact && <span>gatherly</span>}</div>
}

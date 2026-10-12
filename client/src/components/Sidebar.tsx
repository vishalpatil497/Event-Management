import { CalendarDays, Compass, HelpCircle, LayoutDashboard, Plus, Settings2, Ticket, Users, X } from './Icons'
import Logo from './Logo'

const userItems = [['Overview', LayoutDashboard], ['Discover', Compass], ['My bookings', Ticket], ['My events', CalendarDays]] as const
const adminItems = [['Overview', LayoutDashboard], ['Events', CalendarDays], ['Users', Users], ['Bookings', Ticket]] as const

export default function Sidebar({
  active,
  setActive,
  admin = false,
  onClose,
  onLogout,
  displayName = 'Member',
  initials = '--',
  bookingCount = 0,
}: {
  active: string
  setActive: (s: string) => void
  admin?: boolean
  onClose?: () => void
  onLogout?: () => void
  displayName?: string
  initials?: string
  bookingCount?: number
}) {
  const items = admin ? adminItems : userItems
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo />
        <button className="mobile-close" aria-label="Close navigation menu" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="workspace-label">{admin ? 'Workspace' : 'Your space'}</div>
      <nav>
        {items.map(([label, Icon]) => (
          <button className={active === label ? 'nav-item active' : 'nav-item'} key={label} onClick={() => setActive(label)}>
            <Icon size={17} />
            {label}
            {label === 'My bookings' && bookingCount > 0 && <span className="nav-count">{bookingCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-divider" />
      <div className="workspace-label">Manage</div>
      <nav>
        <button className="nav-item" onClick={() => setActive(admin ? 'Analytics' : 'Create event')}>
          <Plus size={17} />
          {admin ? 'Analytics' : 'Create event'}
        </button>
        <button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}>
          <Settings2 size={17} />
          Settings
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card" role="region" aria-label="Help centre">
          <span className="help-icon">
            <HelpCircle size={15} />
          </span>
          <div>
            <strong>Need a hand?</strong>
            <small>hello@gatherly.events</small>
          </div>
        </div>
        <button className="logout-button" onClick={onLogout}>
          Sign out
        </button>
        <div className="user-mini">
          <span className="avatar">{initials}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{admin ? 'Administrator' : 'Member'}</small>
          </div>
        </div>
      </div>
    </aside>
  )
}

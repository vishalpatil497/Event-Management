import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings2, Ticket, User as UserIcon } from 'lucide-react'
import Logo from './Logo'
import type { User } from '../types'

export default function Topbar({
  title,
  admin = false,
  onMenu,
  onSearch,
  onBell,
  initials = '--',
  user,
  onLogout,
  onNavigate,
}: {
  title: string
  admin?: boolean
  onMenu: () => void
  onSearch: () => void
  onBell: () => void
  initials?: string
  user?: User | null
  onLogout?: () => void
  onNavigate?: (view: string) => void
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleEsc)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [profileOpen])

  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation menu">
        <Menu size={22} />
      </button>
      <div className="mobile-logo">
        <Logo compact />
      </div>
      <div className="crumb">
        <span>{admin ? 'Admin' : 'Workspace'}</span>
        <b>/</b>
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        <button className="search-trigger" onClick={onSearch} title="Quick search (Ctrl+K)">
          <Search size={16} />
          <span>Quick search</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="bell" aria-label="Notifications" onClick={onBell} title="Notifications">
          <Bell size={18} />
          <i />
        </button>
        <div className="profile-menu-container" ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="profile-toggle-button"
            onClick={() => setProfileOpen(prev => !prev)}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-label="User account menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <div className="top-avatar">{initials}</div>
            <ChevronDown size={14} className="top-chevron" style={{ transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {profileOpen && (
            <div
              className="topbar-dropdown glass-panel"
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 12px)',
                width: 220,
                padding: '12px',
                borderRadius: '14px',
                zIndex: 60,
                boxShadow: '0 16px 36px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#121927',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                animation: 'pop 0.2s ease',
              }}
            >
              {user && (
                <div style={{ padding: '6px 8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
                  <strong style={{ display: 'block', fontSize: 13, color: '#f3f4f8' }}>{user.name}</strong>
                  <small style={{ display: 'block', fontSize: 11, color: '#8d97aa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.email}
                  </small>
                </div>
              )}
              {onNavigate && !admin && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setProfileOpen(false)
                    onNavigate('My bookings')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: 0,
                    color: '#c2cbd8',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Ticket size={15} style={{ color: '#9485ff' }} />
                  <span>My Bookings</span>
                </button>
              )}
              {onNavigate && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setProfileOpen(false)
                    onNavigate('Settings')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: 0,
                    color: '#c2cbd8',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Settings2 size={15} style={{ color: '#9485ff' }} />
                  <span>Account Settings</span>
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setProfileOpen(false)
                    onLogout()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(238,126,155,0.08)',
                    border: '1px solid rgba(238,126,155,0.15)',
                    color: '#ff9cb4',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginTop: 6,
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}




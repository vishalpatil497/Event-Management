import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronDown, Clock3, Compass, Eye, EyeOff, MapPin, Menu, Plus, Search, Sparkles, Ticket, Users, X, Zap } from './components/Icons'
import CreateEventModal from './components/CreateEventModal'
import EventCard from './components/EventCard'
import Logo from './components/Logo'
import Modal from './components/Modal'
import SectionHeader from './components/SectionHeader'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import { useData } from './data'
import { api, ApiError, type AdminBooking, type AdminEvent, type AdminUser, type AuthInput } from './services/api'
import type { Event, User } from './types'
import './responsive.css'

type View = 'home' | 'discover' | 'bookings' | 'events' | 'admin' | 'settings'
type Dashboard = {
  totalUsers: number
  totalEvents: number
  approvedEvents: number
  totalBookings: number
  pendingEvents: number
  revenue: number
  recentBookings: { id: string; attendee: string; event: string; total: number; status: string; createdAt: string }[]
}

export default function App() {
  const { events, bookings, categories, setEvents, setBookings } = useData()
  const [view, setView] = useState<View>('home')
  const [active, setActive] = useState('Overview')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authAccess, setAuthAccess] = useState<'user' | 'admin'>('user')
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login')
  const [resetToken, setResetToken] = useState<string>('')
  const [resetEmail, setResetEmail] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [toast, setToast] = useState('')
  const [verifyToken, setVerifyToken] = useState<string | null>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const token = url.searchParams.get('token')
      const email = url.searchParams.get('email')
      const pathVerify = url.pathname.includes('verify-email')
      const pathReset = url.pathname.includes('reset-password')
      if (pathVerify && token) {
        setVerifyToken(token)
        const clean = new URL(url.toString())
        clean.searchParams.delete('token')
        if (clean.pathname.includes('verify-email')) clean.pathname = '/'
        window.history.replaceState({}, document.title, clean.toString())
      } else if ((pathReset || token) && token) {
        setResetToken(token)
        setResetEmail(email ?? '')
        setAuthMode('reset')
        setAuthAccess('user')
        setAuthOpen(true)
        const clean = new URL(url.toString())
        clean.searchParams.delete('token')
        clean.searchParams.delete('email')
        if (clean.pathname.includes('reset-password')) clean.pathname = '/'
        window.history.replaceState({}, document.title, clean.toString())
      }
    } catch {
      /* ignore URL parsing */
    }
  }, [])

  const refreshEvents = useCallback(async () => {
    const response = await api.getEvents({ limit: 100 })
    setEvents(response.items ?? [])
    setDataVersion(version => version + 1)
  }, [setEvents])

  const refreshBookings = useCallback(async () => {
    if (!user) {
      setBookings([])
      setDataVersion(version => version + 1)
      return
    }
    const response = await api.getMyBookings({ limit: 100 })
    setBookings(response.items ?? [])
    setDataVersion(version => version + 1)
  }, [setBookings, user])

  useEffect(() => {
    void refreshEvents().catch(error => notify(error.message))
  }, [notify, refreshEvents])
  useEffect(() => {
    void api.me().then(response => setUser(response.user)).catch(() => setUser(null))
  }, [])
  useEffect(() => {
    void refreshBookings().catch(error => notify(error.message))
  }, [notify, refreshBookings])
  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setDashboard(null)
      return
    }
    void api.getDashboard().then(setDashboard).catch(error => notify(error.message))
  }, [notify, user])

  const openCreate = () => {
    if (!user) {
      setAuthAccess('user')
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    setView('events')
    setActive('My events')
    setCreateOpen(true)
  }
  const go = (next: string) => {
    if (user?.role === 'ADMIN' && ['Events', 'Users', 'Bookings', 'Analytics'].includes(next)) {
      setView('admin')
      setActive(next)
      setMenuOpen(false)
      return
    }
    if (next === 'Overview') {
      setView(user?.role === 'ADMIN' ? 'admin' : 'home')
      setActive('Overview')
    }
    if (next === 'Discover' || next === 'Events') {
      setView('discover')
      setActive(next)
    }
    if (next === 'My bookings') {
      setView('bookings')
      setActive(next)
    }
    if (next === 'My events') {
      setView('events')
      setActive(next)
    }
    if (next === 'Create event') openCreate()
    if (next === 'Settings') {
      setView('settings')
      setActive('Settings')
    }
    if (next === 'Analytics') notify(`${next} will be available soon.`)
    setMenuOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault()
        if (user?.role === 'ADMIN') {
          go('Events')
        } else {
          go('Discover')
        }
        window.setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('.toolbar-search input, .resource-search input')
          input?.focus()
        }, 80)
      } else if (event.key === 'Escape') {
        setSelectedEvent(null)
        setAuthOpen(false)
        setCreateOpen(false)
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [user])

  const authenticate = async (input: AuthInput, requestedAccess: 'user' | 'admin') => {
    const response = await api.auth(input)
    if (input.mode === 'signup') {
      // Signup no longer logs user in — they must verify email first
      setAuthOpen(false)
      setAuthMode('login')
      notify('Account created! Please check your email to verify your address before logging in.')
      return response.user
    }
    if (requestedAccess === 'admin' && response.user.role !== 'ADMIN') {
      await api.logout()
      throw new Error('This account does not have administrator access.')
    }
    setUser(response.user)
    setAuthOpen(false)
    setAuthMode('login')
    notify(`Welcome back, ${response.user.name.split(' ')[0]}.`)
    return response.user
  }
  const handleForgotPassword = async (email: string) => {
    const response = await api.forgotPassword(email)
    notify(response.message)
  }
  const handleResetPassword = async (password: string) => {
    if (!resetToken) throw new Error('Reset token missing. Please request a new link.')
    const response = await api.resetPassword(resetToken, password)
    setUser(response.user)
    setAuthOpen(false)
    setAuthMode('login')
    setResetToken('')
    setResetEmail('')
    notify(response.message)
    return response.user
  }
  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* Clear this browser session even if the server is unavailable. */
    }
    setUser(null)
    setBookings([])
    setView('home')
    setActive('Overview')
    setDataVersion(version => version + 1)
    notify('You have been signed out.')
  }
  const createEvent = async (input: Parameters<typeof api.createEvent>[0]) => {
    await api.createEvent(input)
    setCreateOpen(false)
    setDataVersion(version => version + 1)
    notify('Your event was submitted for review.')
  }
  const bookEvent = async (count: number) => {
    if (!selectedEvent) return
    if (!user) {
      setAuthAccess('user')
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    try {
      await api.createBooking(selectedEvent.id, count)
      await Promise.all([refreshEvents(), refreshBookings()])
      setSelectedEvent(null)
      notify('Booking confirmed. Your ticket is in My bookings.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Booking could not be completed.')
    }
  }
  const cancelBooking = async (bookingId: string) => {
    try {
      await api.cancelBooking(bookingId)
      await Promise.all([refreshEvents(), refreshBookings()])
      notify('Your booking has been cancelled and seats returned.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to cancel this booking.')
    }
  }

  const page =
    view === 'home' ? (
      <Home onSelect={setSelectedEvent} onDiscover={() => go('Discover')} onCreate={openCreate} />
    ) : view === 'discover' ? (
      <Discover onSelect={setSelectedEvent} />
    ) : view === 'bookings' ? (
      <Bookings onSelect={setSelectedEvent} onDiscover={() => go('Discover')} onCancel={cancelBooking} />
    ) : view === 'events' ? (
      <MyEvents onCreate={openCreate} refreshToken={dataVersion} />
    ) : view === 'settings' ? (
      user ? (
        <Settings user={user} onUpdated={nextUser => { setUser(nextUser); notify('Your account settings were saved.') }} />
      ) : (
        <Empty text="Sign in to manage your account settings." />
      )
    ) : (
      <Admin
        active={active}
        dashboard={dashboard}
        onReviewed={async () => {
          await refreshEvents()
          setDashboard(await api.getDashboard())
        }}
      />
    )

  const bookingCount = bookings.filter(b => b.status !== 'CANCELLED').length

  // Show verify-email page if user navigated via verification link
  if (verifyToken) {
    return (
      <>
        <VerifyEmailPage
          token={verifyToken}
          onComplete={() => {
            setVerifyToken(null)
            setAuthAccess('user')
            setAuthMode('login')
            setAuthOpen(true)
          }}
          onResend={() => {
            setVerifyToken(null)
          }}
        />
        {toast && <Toast message={toast} />}
      </>
    )
  }

  if (!user)
    return (
      <div className="public-shell">
        <PublicNav
          onExplore={() => go('Discover')}
          onLogin={() => {
            setAuthAccess('user')
            setAuthMode('login')
            setAuthOpen(true)
          }}
          onAdminLogin={() => {
            setAuthAccess('admin')
            setAuthMode('login')
            setAuthOpen(true)
          }}
          onCreate={openCreate}
        />
        <main className="public-main">
          <div className="page-content">{page}</div>
        </main>
        {selectedEvent && (
          <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} onBook={bookEvent} />
        )}
        {authOpen && (
          <AuthModal
            access={authAccess}
            mode={authMode}
            onModeChange={next => { setAuthMode(next); setResetToken('') }}
            resetEmail={resetEmail}
            onClose={() => { setAuthOpen(false); setAuthMode('login'); setResetToken('') }}
            onSubmit={authenticate}
            onForgot={handleForgotPassword}
            onReset={handleResetPassword}
          />
        )}
        {toast && <Toast message={toast} />}
      </div>
    )

  return (
    <div className="app-shell" data-version={dataVersion}>
      <div className={menuOpen ? 'sidebar-mobile open' : 'sidebar-mobile'}>
        <Sidebar
          active={active}
          setActive={go}
          admin={user.role === 'ADMIN'}
          onClose={() => setMenuOpen(false)}
          onLogout={logout}
          displayName={user.name}
          initials={user.initials}
          bookingCount={bookingCount}
        />
      </div>
      <div className="desktop-sidebar">
        <Sidebar
          active={active}
          setActive={go}
          admin={user.role === 'ADMIN'}
          onClose={() => setMenuOpen(false)}
          onLogout={logout}
          displayName={user.name}
          initials={user.initials}
          bookingCount={bookingCount}
        />
      </div>
      <main className="main-shell">
        <Topbar
          title={
            view === 'admin'
              ? active
              : view === 'settings'
                ? 'Settings'
                : view === 'home'
                  ? 'Overview'
                  : view === 'discover'
                    ? 'Discover events'
                    : view === 'bookings'
                      ? 'My bookings'
                      : 'My events'
          }
          admin={user.role === 'ADMIN'}
          onMenu={() => setMenuOpen(true)}
          onSearch={() => {
            if (user.role === 'ADMIN') {
              go('Events')
            } else {
              go('Discover')
            }
            window.setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>('.toolbar-search input, .resource-search input')
              input?.focus()
            }, 80)
          }}
          onBell={() => notify('You are all caught up.')}
          initials={user.initials}
          user={user}
          onLogout={logout}
          onNavigate={go}
        />
        <div className="page-content">{page}</div>
      </main>
      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} onBook={bookEvent} />}
      {createOpen && <CreateEventModal onClose={() => setCreateOpen(false)} onSubmit={createEvent} />}
      {toast && <Toast message={toast} />}
    </div>
  )
}

function PublicNav({
  onExplore,
  onLogin,
  onAdminLogin,
  onCreate,
}: {
  onExplore: () => void
  onLogin: () => void
  onAdminLogin: () => void
  onCreate: () => void
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  return (
    <header className="public-nav">
      <Logo />
      <nav className="desktop-public-nav">
        <button onClick={onExplore}>Explore events</button>
        <button onClick={onCreate}>Create an event</button>
      </nav>
      <div className="public-nav-actions">
        <button className="admin-login-link" onClick={onAdminLogin}>
          Admin portal
        </button>
        <button className="public-login" onClick={onLogin}>
          Log in
        </button>
        <button className="primary-button public-cta" onClick={onCreate}>
          Get started <ArrowUpRight size={15} />
        </button>
        <button
          type="button"
          className="mobile-public-toggle"
          aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="public-mobile-drawer glass-panel">
          <button
            onClick={() => {
              setMobileMenuOpen(false)
              onExplore()
            }}
          >
            <Compass size={16} /> Explore events
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false)
              onCreate()
            }}
          >
            <Plus size={16} /> Create an event
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false)
              onAdminLogin()
            }}
          >
            <Zap size={16} /> Admin portal
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false)
              onLogin()
            }}
          >
            Log in to account
          </button>
        </div>
      )}
    </header>
  )
}

function getCategoryIcon(title: string) {
  const t = title.toLowerCase()
  if (t.includes('tech') || t.includes('code') || t.includes('ai')) return <Zap size={18} />
  if (t.includes('well') || t.includes('health') || t.includes('mind')) return <Sparkles size={18} />
  if (t.includes('music') || t.includes('concert') || t.includes('sound')) return <Ticket size={18} />
  if (t.includes('design') || t.includes('art') || t.includes('creativ')) return <Compass size={18} />
  if (t.includes('food') || t.includes('drink') || t.includes('culinary')) return <CalendarDays size={18} />
  return <Sparkles size={18} />
}

function Home({ onSelect, onDiscover, onCreate }: { onSelect: (event: Event) => void; onDiscover: () => void; onCreate: () => void }) {
  const { events, categories } = useData()
  const categoryEntries = Object.entries(
    events.reduce<Record<string, number>>((all, event) => ({ ...all, [event.category]: (all[event.category] ?? 0) + 1 }), {}),
  )
  const shownCategories = categoryEntries.length
    ? categoryEntries
    : categories.map(c => [c.name, c.count] as const)
  return (
    <>
      <section className="hero">
        <div className="hero-glow one" />
        <div className="hero-glow two" />
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> YOUR NEXT EXPERIENCE AWAITS
          </span>
          <h1>
            Make room for
            <br />
            <em>something memorable.</em>
          </h1>
          <p>Discover thoughtful events, good people, and the moments that stay with you.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onDiscover}>
              Explore events <ArrowUpRight size={17} />
            </button>
            <button className="secondary-button" onClick={onCreate}>
              Create an event <span>+</span>
            </button>
          </div>
        </div>
        <div className="hero-art">
          <div className="orbital orbital-a" />
          <div className="orbital orbital-b" />
          <div className="hero-note">
            <span>
              Good things happen
              <br />
              when you <em>show up.</em>
            </span>
            <small>Find your next plan</small>
          </div>
        </div>
      </section>
      <section className="quick-search glass-panel">
        <div className="search-label">
          <Search size={20} />
          <div>
            <strong>Find your next thing</strong>
            <small>Search by event, place or mood</small>
          </div>
        </div>
        <button className="search-field" onClick={onDiscover}>
          <Search size={17} />
          <span>Explore live events near you</span>
        </button>
        <button className="search-button" onClick={onDiscover}>
          Search <ArrowUpRight size={17} />
        </button>
      </section>
      <section className="content-section">
        <SectionHeader
          title="Made for your calendar"
          description="Events published by the Gatherly community."
          action="View all events"
          onAction={onDiscover}
        />
        {events.length ? (
          <div className="event-grid featured-grid">
            {events.slice(0, 3).map(event => (
              <EventCard key={event.id} event={event} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <Empty text="No events have been published yet. Check back soon." />
        )}
      </section>
      <section className="categories">
        <SectionHeader title="Find your kind of good time" description="Browse the categories people are creating." />
        {shownCategories.length ? (
          <div className="category-grid">
            {shownCategories.map(([title, count]) => (
              <button key={title} className="category-card" onClick={onDiscover}>
                <span className="category-icon-badge">{getCategoryIcon(title)}</span>
                <strong>{title}</strong>
                <small>
                  {count} {count === 1 ? 'event' : 'events'}
                </small>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  )
}

function Discover({ onSelect }: { onSelect: (event: Event) => void }) {
  const { events, categories } = useData()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const categoryOptions = Array.from(new Set([...categories.map(c => c.name), ...events.map(event => event.category)]))
  const filtered = events.filter(
    event =>
      `${event.title} ${event.city} ${event.category} ${event.organizer}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'All categories' || event.category === category),
  )
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            <i /> THE GOOD STUFF
          </span>
          <h1>
            Discover events
            <br />
            <em>worth showing up for.</em>
          </h1>
        </div>
        <p className="intro-copy">Find your people, pick a date, and make a plan.</p>
      </div>
      <div className="discover-toolbar glass-panel">
        <div className="toolbar-search">
          <Search size={18} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search events, cities, categories..."
          />
        </div>
        <div className="select-wrap">
          <select value={category} onChange={event => setCategory(event.target.value)}>
            <option>All categories</option>
            {categoryOptions.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
        <button className="filter-button" onClick={() => setFiltersOpen(open => !open)}>
          Filters <span>{filtersOpen ? '-' : '+'}</span>
        </button>
      </div>
      {filtersOpen && (
        <div className="filter-drawer glass-panel">
          <button onClick={() => setQuery('')}>Clear search</button>
          {categoryOptions.map(item => (
            <button key={item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
      <div className="discover-label">
        <span>
          <strong>{filtered.length}</strong> events found
        </span>
      </div>
      {filtered.length ? (
        <div className="event-grid discover-grid">
          {filtered.map(event => (
            <EventCard key={event.id} event={event} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <Empty text="No matching events found." />
      )}
    </>
  )
}

function Bookings({
  onSelect,
  onDiscover,
  onCancel,
}: {
  onSelect: (event: Event) => void
  onDiscover: () => void
  onCancel: (bookingId: string) => Promise<void>
}) {
  const { bookings, events } = useData()
  const [tab, setTab] = useState('Upcoming')
  const [cancelling, setCancelling] = useState('')
  const shown = bookings.filter(booking =>
    tab === 'Cancelled' ? booking.status === 'CANCELLED' : booking.status !== 'CANCELLED',
  )
  const beginCancel = async (bookingId: string, canCancel: boolean) => {
    if (!canCancel) return
    setCancelling(bookingId)
    try {
      await onCancel(bookingId)
    } finally {
      setCancelling('')
    }
  }
  return (
    <>
      <div className="page-intro compact">
        <div>
          <span className="eyebrow">
            <i /> YOUR PLANS
          </span>
          <h1>My bookings</h1>
          <p className="muted">Keep track of the moments you said yes to.</p>
        </div>
        <button className="secondary-button small" onClick={onDiscover}>
          Browse events <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="booking-tabs">
        {['Upcoming', 'Past', 'Cancelled'].map(item => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
            {item === 'Upcoming' && bookings.length > 0 && <span>{bookings.length}</span>}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="booking-list">
          {shown.map(booking => {
            const event = events.find(item => item.id === booking.eventId)
            const canCancel = booking.status === 'CONFIRMED'
            return (
              <div className="booking-row glass-panel" key={booking.id}>
                <img src={booking.eventImage} alt="" />
                <div className="booking-info">
                  <span className="category-pill inline">{booking.status}</span>
                  <h3>{booking.eventTitle}</h3>
                  <div className="event-meta">
                    <span>
                      <CalendarDays size={14} />
                      {booking.date}
                    </span>
                    <span>
                      <MapPin size={14} />
                      {booking.location}
                    </span>
                  </div>
                </div>
                <div className="booking-seats">
                  <small>Seats</small>
                  <strong>{booking.seats}</strong>
                </div>
                <div className="booking-total">
                  <small>Total paid</small>
                  <strong>Rs. {booking.total.toLocaleString('en-IN')}</strong>
                  <small className="reference">{booking.reference}</small>
                </div>
                <div className="booking-row-actions">
                  <button
                    className="row-action"
                    disabled={!event}
                    onClick={() => event && onSelect(event)}
                  >
                    View ticket <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="secondary-button small"
                    style={{ opacity: canCancel ? 1 : 0.5, pointerEvents: canCancel ? 'auto' : 'none' }}
                    disabled={!canCancel || cancelling === booking.id}
                    onClick={() => beginCancel(booking.id, canCancel)}
                  >
                    {cancelling === booking.id ? 'Cancelling...' : 'Cancel booking'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty text={`No ${tab.toLowerCase()} bookings yet.`} />
      )}
    </>
  )
}

function MyEvents({ onCreate, refreshToken }: { onCreate: () => void; refreshToken: number }) {
  const [items, setItems] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true)
    void api
      .getMyEvents()
      .then(response => setItems(response.items ?? []))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load your events.'))
      .finally(() => setLoading(false))
  }, [refreshToken])
  return (
    <>
      <div className="page-intro compact">
        <div>
          <span className="eyebrow">
            <i /> YOUR CREATIONS
          </span>
          <h1>My events</h1>
          <p className="muted">Create, track, and share your upcoming experiences.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          Create event <span>+</span>
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="my-events-grid">
        <button className="create-card glass-panel" onClick={onCreate}>
          <span className="create-icon">+</span>
          <strong>Bring people together</strong>
          <p>Submit an event and it will be reviewed by an administrator.</p>
          <span className="text-button">
            Start creating <ArrowUpRight size={15} />
          </span>
        </button>
        {items.map(event => (
          <article className="owned-event-card glass-panel" key={event.id}>
            {event.image ? (
              <img src={event.image} alt="" />
            ) : (
              <div className="owned-event-image">{event.category.slice(0, 1)}</div>
            )}
            <div>
              <span className={`event-status ${event.status.toLowerCase()}`}>{event.status.toLowerCase()}</span>
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <div className="event-meta">
                <span>
                  <CalendarDays size={14} />
                  {event.date}
                </span>
                <span>
                  <MapPin size={14} />
                  {event.city}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && items.length === 0 && (
        <p className="my-events-empty">Your submitted events will appear here with their approval status.</p>
      )}
    </>
  )
}

function Settings({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setName(user.name), [user.name])
  const save = async () => {
    setError('')
    setSaving(true)
    try {
      const response = await api.updateProfile(name)
      onUpdated(response.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="settings-page">
      <div className="settings-hero">
        <span className="eyebrow">
          <i /> ACCOUNT SETTINGS
        </span>
        <h1>Make Gatherly yours.</h1>
        <p>Update the name shown across your workspace and event activity.</p>
      </div>
      <div className="settings-layout">
        <article className="settings-card profile-summary">
          <span className="settings-avatar">{user.initials}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
            <span className={user.role === 'ADMIN' ? 'role-badge admin' : 'role-badge'}>{user.role.toLowerCase()}</span>
          </div>
        </article>
        <article className="settings-card settings-form">
          <div>
            <h2>Profile details</h2>
            <p>Your email is used to sign in and cannot be changed here.</p>
          </div>
          <label>
            Display name
            <input
              className="form-input"
              value={name}
              maxLength={80}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label>
            Email address
            <input className="form-input" value={user.email} disabled />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="settings-actions">
            <button
              className="secondary-button small"
              disabled={saving || name.trim() === user.name}
              onClick={() => setName(user.name)}
            >
              Discard changes
            </button>
            <button
              className="primary-button small"
              disabled={saving || name.trim().length < 2 || name.trim() === user.name}
              onClick={save}
            >
              {saving ? 'Saving...' : 'Save changes'} <ArrowUpRight size={14} />
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}

function Admin({
  active,
  dashboard,
  onReviewed,
}: {
  active: string
  dashboard: Dashboard | null
  onReviewed: () => Promise<void>
}) {
  const [pending, setPending] = useState<Event[]>([])
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState('')
  useEffect(() => {
    void api
      .getPendingEvents()
      .then(response => setPending(response.items ?? []))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load the review queue.'))
  }, [])
  const review = async (eventId: string, status: 'APPROVED' | 'REJECTED') => {
    setReviewing(eventId)
    setError('')
    try {
      await api.reviewEvent(eventId, status)
      setPending(items => items.filter(item => item.id !== eventId))
      await onReviewed()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the event.')
    } finally {
      setReviewing('')
    }
  }
  if (active === 'Events') return <AdminEvents onReviewed={onReviewed} />
  if (active === 'Users') return <AdminUsers />
  if (active === 'Bookings') return <AdminBookings />
  if (active === 'Analytics') return <AdminAnalytics dashboard={dashboard} />
  if (!dashboard) return <Empty text="Loading your live admin dashboard..." />
  const approvalRate = dashboard.totalEvents ? Math.round((dashboard.approvedEvents / dashboard.totalEvents) * 100) : 0
  const metrics = [
    { label: 'Total revenue', value: `Rs. ${dashboard.revenue.toLocaleString('en-IN')}`, note: 'Confirmed bookings', icon: Zap, tone: 'violet' },
    { label: 'Bookings', value: String(dashboard.totalBookings), note: 'Across all events', icon: Ticket, tone: 'blue' },
    {
      label: 'Published events',
      value: String(dashboard.approvedEvents),
      note: `${dashboard.pendingEvents} awaiting review`,
      icon: CalendarDays,
      tone: 'orange',
    },
    { label: 'Community members', value: String(dashboard.totalUsers), note: 'Registered accounts', icon: Users, tone: 'green' },
  ]
  return (
    <div className="admin-dashboard">
      <section className="admin-hero">
        <div>
          <span className="eyebrow">
            <i /> ADMIN CONTROL CENTRE
          </span>
          <h1>
            Run your platform
            <br />
            <em>with confidence.</em>
          </h1>
          <p>Live performance, event moderation, and the latest booking activity in one place.</p>
        </div>
        <div className="admin-hero-status">
          <span className="live-dot" /> Live database
          <br />
          <small>MongoDB Atlas connected</small>
        </div>
      </section>
      <section className="admin-metrics">
        {metrics.map(metric => {
          const Icon = metric.icon
          return (
            <article className={`admin-metric ${metric.tone}`} key={metric.label}>
              <span className="admin-metric-icon">
                <Icon size={18} />
              </span>
              <div>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <p>{metric.note}</p>
              </div>
            </article>
          )
        })}
      </section>
      <section className="admin-overview-grid">
        <div className="admin-panel review-panel">
          <div className="admin-panel-head">
            <div>
              <span className="admin-kicker">MODERATION</span>
              <h2>Event review queue</h2>
              <p>
                {pending.length
                  ? `${pending.length} submission${pending.length === 1 ? '' : 's'} need your decision.`
                  : 'Your review queue is clear.'}
              </p>
            </div>
            <span className={pending.length ? 'queue-count has-items' : 'queue-count'}>{pending.length}</span>
          </div>
          {error && <p className="form-error">{error}</p>}
          {pending.length ? (
            <div className="review-list">
              {pending.map(event => (
                <article className="review-card" key={event.id}>
                  {event.image ? (
                    <img src={event.image} alt="" />
                  ) : (
                    <div className="review-image-fallback">{event.category.slice(0, 1)}</div>
                  )}
                  <div className="review-card-content">
                    <span className="review-status">Pending review</span>
                    <h3>{event.title}</h3>
                    <p>{event.description}</p>
                    <div className="review-meta">
                      <span>
                        <CalendarDays size={14} />
                        {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${event.date}T12:00:00`))}
                      </span>
                      <span>
                        <MapPin size={14} />
                        {event.city}
                      </span>
                      <span>{event.totalSeats} seats</span>
                    </div>
                  </div>
                  <div className="review-actions">
                    <button
                      className="admin-reject"
                      disabled={reviewing === event.id}
                      onClick={() => review(event.id, 'REJECTED')}
                    >
                      Reject
                    </button>
                    <button
                      className="admin-approve"
                      disabled={reviewing === event.id}
                      onClick={() => review(event.id, 'APPROVED')}
                    >
                      {reviewing === event.id ? 'Saving...' : 'Approve'} <ArrowUpRight size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <span>All caught up</span>
              <p>New event submissions will appear here for approval.</p>
            </div>
          )}
        </div>
        <aside className="admin-panel operations-panel">
          <div className="admin-panel-head">
            <div>
              <span className="admin-kicker">PLATFORM HEALTH</span>
              <h2>Operations pulse</h2>
              <p>A quick read on what needs attention.</p>
            </div>
          </div>
          <div className="pulse-item">
            <div>
              <span>Approval rate</span>
              <strong>{approvalRate}%</strong>
            </div>
            <div className="pulse-bar">
              <i style={{ width: `${approvalRate}%` }} />
            </div>
            <small>
              {dashboard.approvedEvents} of {dashboard.totalEvents} events are live
            </small>
          </div>
          <div className="pulse-item">
            <div>
              <span>Review workload</span>
              <strong>{dashboard.pendingEvents}</strong>
            </div>
            <div className="pulse-bar warm">
              <i style={{ width: `${Math.min(100, dashboard.pendingEvents * 20)}%` }} />
            </div>
            <small>
              {dashboard.pendingEvents ? 'Prioritize pending submissions today' : 'No submission backlog'}
            </small>
          </div>
          <div className="operations-footer">
            <span className="live-dot" /> All systems operational
          </div>
        </aside>
      </section>
      <section className="admin-panel booking-activity">
        <div className="admin-panel-head">
          <div>
            <span className="admin-kicker">LATEST ACTIVITY</span>
            <h2>Recent bookings</h2>
            <p>Bookings recorded in your platform.</p>
          </div>
          <span className="booking-live">Live</span>
        </div>
        {dashboard.recentBookings.length ? (
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Attendee</span>
              <span>Event</span>
              <span>When</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {dashboard.recentBookings.map(booking => (
              <div className="admin-table-row" key={booking.id}>
                <span className="admin-attendee">
                  <i>{booking.attendee.split(' ').map(part => part[0]).join('').slice(0, 2)}</i>
                  {booking.attendee}
                </span>
                <span>{booking.event}</span>
                <span>
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(booking.createdAt))}
                </span>
                <strong>Rs. {booking.total.toLocaleString('en-IN')}</strong>
                <span className="booking-status">{booking.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <span>No bookings yet</span>
            <p>New customer bookings will show up here in real time.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function AdminEvents({ onReviewed }: { onReviewed: () => Promise<void> }) {
  const [items, setItems] = useState<AdminEvent[]>([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.getAdminEvents()
      setItems(response.items ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load events.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const review = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setReviewing(id)
    try {
      await api.reviewEvent(id, status)
      await Promise.all([load(), onReviewed()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update event.')
    } finally {
      setReviewing('')
    }
  }
  const visible = filter === 'ALL' ? items : items.filter(event => event.status === filter)
  return (
    <section className="admin-resource">
      <div className="resource-header">
        <div>
          <span className="eyebrow">
            <i /> EVENT MANAGEMENT
          </span>
          <h1>All events</h1>
          <p>Review submissions and monitor every event on your platform.</p>
        </div>
        <div className="resource-summary">
          <strong>{items.length}</strong>
          <span>Total events</span>
        </div>
      </div>
      <div className="resource-tabs">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(status => (
          <button key={status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>
            {status.toLowerCase()}
            <span>
              {status === 'ALL' ? items.length : items.filter(event => event.status === status).length}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="resource-list">
        {loading ? (
          <Empty text="Loading event records..." />
        ) : visible.length ? (
          visible.map(event => (
            <article className="resource-event" key={event.id}>
              {event.image ? (
                <img src={event.image} alt="" />
              ) : (
                <div className="resource-event-image">{event.category.slice(0, 1)}</div>
              )}
              <div className="resource-event-main">
                <div className="resource-title-line">
                  <span className={`event-status ${event.status.toLowerCase()}`}>{event.status.toLowerCase()}</span>
                  <span className="resource-category">{event.category}</span>
                </div>
                <h2>{event.title}</h2>
                <p>
                  Submitted by {event.submittedBy} - {event.submittedEmail}
                </p>
                <div className="event-meta">
                  <span>
                    <CalendarDays size={14} />
                    {event.date}
                  </span>
                  <span>
                    <MapPin size={14} />
                    {event.city}
                  </span>
                  <span>
                    {event.seats}/{event.totalSeats} seats available
                  </span>
                </div>
              </div>
              {event.status === 'PENDING' ? (
                <div className="review-actions horizontal">
                  <button
                    className="admin-reject"
                    disabled={reviewing === event.id}
                    onClick={() => review(event.id, 'REJECTED')}
                  >
                    Reject
                  </button>
                  <button
                    className="admin-approve"
                    disabled={reviewing === event.id}
                    onClick={() => review(event.id, 'APPROVED')}
                  >
                    {reviewing === event.id ? 'Saving...' : 'Approve'} <ArrowUpRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="resource-event-value">
                  <strong>Rs. {event.price.toLocaleString('en-IN')}</strong>
                  <small>per ticket</small>
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty text={`No ${filter.toLowerCase()} events found.`} />
        )}
      </div>
    </section>
  )
}

function AdminUsers() {
  const [items, setItems] = useState<AdminUser[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    void api
      .getAdminUsers()
      .then(response => setItems(response.items ?? []))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load users.'))
  }, [])
  const shown = items.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <section className="admin-resource">
      <div className="resource-header">
        <div>
          <span className="eyebrow">
            <i /> COMMUNITY MANAGEMENT
          </span>
          <h1>Users</h1>
          <p>View all registered members and administrator accounts.</p>
        </div>
        <div className="resource-summary">
          <strong>{items.length}</strong>
          <span>Registered users</span>
        </div>
      </div>
      <div className="resource-search">
        <Search size={17} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="resource-table">
        {shown.length ? (
          <>
            <div className="resource-table-head">
              <span>Member</span>
              <span>Role</span>
              <span>Joined</span>
              <span>Status</span>
            </div>
            {shown.map(user => (
              <div className="resource-table-row" key={user.id}>
                <span className="admin-attendee">
                  <i>{user.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</i>
                  <b>{user.name}</b>
                  <small>{user.email}</small>
                </span>
                <span className={user.role === 'ADMIN' ? 'role-badge admin' : 'role-badge'}>{user.role.toLowerCase()}</span>
                <span>
                  {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
                    new Date(user.createdAt),
                  )}
                </span>
                <span className={user.isActive ? 'booking-status' : 'role-badge'}>
                  {user.isActive ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </>
        ) : (
          <Empty text="No users match your search." />
        )}
      </div>
    </section>
  )
}

function AdminBookings() {
  const [items, setItems] = useState<AdminBooking[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void api
      .getAdminBookings()
      .then(response => setItems(response.items ?? []))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load bookings.'))
  }, [])
  return (
    <section className="admin-resource">
      <div className="resource-header">
        <div>
          <span className="eyebrow">
            <i /> BOOKING MANAGEMENT
          </span>
          <h1>All bookings</h1>
          <p>Review customer tickets, revenue, and booking status.</p>
        </div>
        <div className="resource-summary">
          <strong>{items.length}</strong>
          <span>Recorded bookings</span>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="resource-table">
        {items.length ? (
          <>
            <div className="resource-table-head booking">
              <span>Attendee</span>
              <span>Event</span>
              <span>Ticket</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {items.map(booking => (
              <div className="resource-table-row booking" key={booking.id}>
                <span className="admin-attendee">
                  <i>{booking.attendee.split(' ').map(part => part[0]).join('').slice(0, 2)}</i>
                  <b>{booking.attendee}</b>
                  <small>{booking.email}</small>
                </span>
                <span>
                  <b>{booking.event}</b>
                  <small>{booking.city}</small>
                </span>
                <span>
                  <b>
                    {booking.seats} seat{booking.seats === 1 ? '' : 's'}
                  </b>
                  <small>{booking.reference}</small>
                </span>
                <strong>Rs. {booking.total.toLocaleString('en-IN')}</strong>
                <span className={booking.status === 'CANCELLED' ? 'role-badge' : 'booking-status'}>
                  {booking.status.toLowerCase()}
                </span>
              </div>
            ))}
          </>
        ) : (
          <Empty text="No bookings have been made yet." />
        )}
      </div>
    </section>
  )
}

function AdminAnalytics({ dashboard }: { dashboard: Dashboard | null }) {
  if (!dashboard) return <Empty text="Loading analytics..." />
  const maximum = Math.max(dashboard.totalUsers, dashboard.totalEvents, dashboard.totalBookings, 1)
  const measures = [
    ['Community members', dashboard.totalUsers, '#8f7aff'],
    ['Published events', dashboard.approvedEvents, '#62b7ff'],
    ['Bookings', dashboard.totalBookings, '#54d3a5'],
    ['Pending review', dashboard.pendingEvents, '#ffb26c'],
  ] as const
  return (
    <section className="admin-resource">
      <div className="resource-header">
        <div>
          <span className="eyebrow">
            <i /> PLATFORM ANALYTICS
          </span>
          <h1>Performance snapshot</h1>
          <p>Live, database-backed totals to guide your next decision.</p>
        </div>
        <div className="resource-summary">
          <strong>Rs. {dashboard.revenue.toLocaleString('en-IN')}</strong>
          <span>Revenue to date</span>
        </div>
      </div>
      <div className="analytics-grid">
        {measures.map(([label, value, color]) => (
          <article className="analytics-row" key={String(label)}>
            <div>
              <strong>{label}</strong>
              <span>{value}</span>
            </div>
            <div className="analytics-bar">
              <i style={{ width: `${(Number(value) / maximum) * 100}%`, background: String(color) }} />
            </div>
          </article>
        ))}
      </div>
      <div className="analytics-note">
        <Zap size={18} />
        <div>
          <strong>Live figures, not sample data</strong>
          <p>These totals update whenever you refresh the admin workspace after new users, events, or bookings are added.</p>
        </div>
      </div>
    </section>
  )
}

function EventDetail({ event, onClose, onBook }: { event: Event; onClose: () => void; onBook: (count: number) => void }) {
  const [count, setCount] = useState(1)
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-drawer" onClick={event => event.stopPropagation()}>
        <button className="drawer-close circle-button" onClick={onClose}>
          <X size={18} />
        </button>
        <img className="detail-image" src={event.image} alt={event.title} />
        <div className="detail-content">
          <span className="category-pill">{event.category}</span>
          <h1>{event.title}</h1>
          <p className="detail-description">{event.description}</p>
          <div className="detail-facts">
            <div>
              <CalendarDays size={18} />
              <span>
                <small>Date</small>
                <strong>
                  {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
                    new Date(`${event.date}T12:00:00`),
                  )}
                </strong>
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                <small>Time</small>
                <strong>{event.time || 'Time to be announced'}</strong>
              </span>
            </div>
            <div>
              <MapPin size={18} />
              <span>
                <small>Location</small>
                <strong>
                  {event.location}, {event.city}
                </strong>
              </span>
            </div>
            <div>
              <Users size={18} />
              <span>
                <small>Hosted by</small>
                <strong>{event.organizer}</strong>
              </span>
            </div>
          </div>
          <div className="booking-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span className="availability">
                  <i />
                  {event.seats} spots remaining
                </span>
                <h2>
                  Rs. {event.price.toLocaleString('en-IN')} <small>/ person</small>
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '5px 10px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  aria-label="Decrease seat count"
                  disabled={count <= 1}
                  onClick={() => setCount(value => Math.max(1, value - 1))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    color: '#b6aaff',
                    fontSize: 16,
                    display: 'grid',
                    placeItems: 'center',
                    cursor: count <= 1 ? 'not-allowed' : 'pointer',
                    opacity: count <= 1 ? 0.4 : 1,
                    border: 0,
                  }}
                >
                  -
                </button>
                <strong style={{ minWidth: 22, textAlign: 'center', fontSize: 15, color: '#fff' }}>{count}</strong>
                <button
                  type="button"
                  aria-label="Increase seat count"
                  disabled={count >= event.seats}
                  onClick={() => setCount(value => Math.min(Math.max(1, event.seats), value + 1))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    color: '#b6aaff',
                    fontSize: 16,
                    display: 'grid',
                    placeItems: 'center',
                    cursor: count >= event.seats ? 'not-allowed' : 'pointer',
                    opacity: count >= event.seats ? 0.4 : 1,
                    border: 0,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#9fa8b8' }}>
              <span>Total amount ({count} {count === 1 ? 'ticket' : 'tickets'}):</span>
              <strong style={{ fontSize: 16, color: '#fff', letterSpacing: '-0.3px' }}>
                Rs. {(event.price * count).toLocaleString('en-IN')}
              </strong>
            </div>

            <button
              className="primary-button book-button"
              disabled={event.seats < 1}
              onClick={() => onBook(count)}
            >
              {event.seats ? `Confirm & Book ${count} ${count === 1 ? 'Seat' : 'Seats'}` : 'Sold out'} <ArrowUpRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VerifyEmailPage({
  token,
  onComplete,
  onResend,
}: {
  token: string
  onComplete: () => void
  onResend: () => void
}) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    api.verifyEmail(token)
      .then(result => {
        if (cancelled) return
        if (result.ok) {
          setStatus('success')
          setMessage(result.message)
          window.setTimeout(() => { if (!cancelled) onComplete() }, 3000)
        } else {
          setStatus('error')
          setMessage(result.message ?? 'Verification failed.')
          setErrorCode(result.code ?? '')
        }
      })
      .catch(error => {
        if (cancelled) return
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Verification failed.')
        if (error instanceof ApiError) setErrorCode(error.code ?? '')
      })
    return () => { cancelled = true }
  }, [token, onComplete])

  const handleResend = async () => {
    if (!resendEmail.trim()) return
    setResendLoading(true)
    setResendMessage('')
    try {
      const result = await api.resendVerification(resendEmail.trim())
      setResendMessage(result.message)
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : 'Unable to send verification email.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="verify-page">
      <div className="verify-card glass-panel">
        <Logo />
        {status === 'loading' && (
          <div className="verify-status verify-loading">
            <div className="verify-spinner" />
            <h2>Verifying your email...</h2>
            <p className="muted">Please wait while we verify your email address.</p>
          </div>
        )}
        {status === 'success' && (
          <div className="verify-status verify-success">
            <div className="verify-check-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2>Email verified!</h2>
            <p className="muted">{message}</p>
            <p className="verify-redirect-note">Redirecting you to login...</p>
            <button className="primary-button" onClick={onComplete}>
              Go to login <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        {status === 'error' && (
          <div className="verify-status verify-error">
            <div className="verify-error-circle">
              <X size={28} />
            </div>
            <h2>{errorCode === 'expired' ? 'Link expired' : errorCode === 'already_used' ? 'Already verified' : 'Verification failed'}</h2>
            <p className="muted">{message}</p>
            {(errorCode === 'expired' || errorCode === 'invalid_token') && (
              <div className="resend-block">
                <p className="resend-label">Request a new verification email:</p>
                <div className="resend-form">
                  <input
                    className="form-input"
                    type="email"
                    placeholder="your@email.com"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                  />
                  <button
                    className="primary-button"
                    disabled={resendLoading || !resendEmail.trim()}
                    onClick={handleResend}
                  >
                    {resendLoading ? 'Sending...' : 'Resend'}
                  </button>
                </div>
                {resendMessage && <p className="resend-message">{resendMessage}</p>}
              </div>
            )}
            {errorCode === 'already_used' && (
              <button className="primary-button" onClick={onComplete} style={{ marginTop: 16 }}>
                Go to login <ArrowUpRight size={15} />
              </button>
            )}
            <button className="verify-back-link" onClick={onResend}>
              ← Back to home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AuthModal({
  access,
  mode: externalMode,
  onModeChange,
  resetEmail,
  onClose,
  onSubmit,
  onForgot,
  onReset,
}: {
  access: 'user' | 'admin'
  mode: 'login' | 'signup' | 'forgot' | 'reset'
  onModeChange: (next: 'login' | 'signup' | 'forgot' | 'reset') => void
  resetEmail?: string
  onClose: () => void
  onSubmit: (input: AuthInput, requestedAccess: 'user' | 'admin') => Promise<User>
  onForgot: (email: string) => Promise<void>
  onReset: (password: string) => Promise<User>
}) {
  const showForgotFlow = access === 'user' && (externalMode === 'forgot' || externalMode === 'reset' || externalMode === 'login')
  const effectiveMode = access === 'admin' && externalMode !== 'login' ? 'login' : externalMode
  const [innerMode, setInnerMode] = useState<'login' | 'signup'>(effectiveMode === 'forgot' || effectiveMode === 'reset' ? 'login' : effectiveMode)
  const activeMode: 'login' | 'signup' | 'forgot' | 'reset' = effectiveMode === 'forgot' || effectiveMode === 'reset' ? effectiveMode : innerMode
  const [email, setEmail] = useState(resetEmail ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailUnverified, setEmailUnverified] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    if (resetEmail) setEmail(resetEmail)
  }, [resetEmail])

  const switchMode = (next: 'login' | 'signup' | 'forgot' | 'reset') => {
    setError('')
    setEmailUnverified(false)
    setResendMessage('')
    if (next === 'login' || next === 'signup') setInnerMode(next)
    onModeChange(next)
  }

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      if (activeMode === 'forgot') {
        if (!email.trim()) throw new Error('Enter the email for your account.')
        await onForgot(email.trim())
        switchMode('login')
      } else if (activeMode === 'reset') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.')
        if (password !== confirmPassword) throw new Error('Passwords do not match.')
        await onReset(password)
      } else {
        if (activeMode === 'signup' && name.trim().length < 2) throw new Error('Enter your full name.')
        if (!email.trim()) throw new Error('Enter your email address.')
        if (password.length < 8) throw new Error('Password must be at least 8 characters.')
        await onSubmit({ mode: activeMode, name, email: email.trim(), password }, access)
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'EMAIL_UNVERIFIED') {
        setEmailUnverified(true)
        setUnverifiedEmail(email.trim())
        setError('')
      } else {
        setError(reason instanceof Error ? reason.message : 'Unable to continue.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setResendLoading(true)
    setResendMessage('')
    try {
      const result = await api.resendVerification(unverifiedEmail)
      setResendMessage(result.message)
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : 'Unable to send verification email.')
    } finally {
      setResendLoading(false)
    }
  }

  const modalTitle =
    access === 'admin'
      ? 'Admin portal'
      : activeMode === 'forgot'
        ? 'Reset your password'
        : activeMode === 'reset'
          ? 'Create a new password'
          : activeMode === 'login'
            ? 'Welcome back'
            : 'Join Gatherly'

  const renderPasswordInput = (
    id: 'primary' | 'confirm',
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    setShow: (v: boolean) => void,
    label: string,
    placeholder: string,
  ) => (
    <label>
      {label}
      <span className="password-wrap">
        <input
          className="form-input password-input"
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={id === 'primary' ? 'current-password' : 'new-password'}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  )

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <span className={access === 'admin' ? 'auth-access-badge admin' : 'auth-access-badge'}>
        {access === 'admin' ? 'Administrator access' : 'Member access'}
      </span>
      <p className="modal-lede">
        {access === 'admin'
          ? 'Sign in with your administrator account to manage the platform.'
          : activeMode === 'forgot'
            ? 'Enter your email and we will send you a link to create a new password.'
            : activeMode === 'reset'
              ? 'Choose a new strong password for your Gatherly account.'
              : activeMode === 'login'
                ? 'Use the email and password you registered with.'
                : 'Create your own account to start making plans.'}
      </p>

      {activeMode === 'signup' && (
        <label>
          Your name
          <input
            className="form-input"
            placeholder="Your full name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </label>
      )}

      {activeMode !== 'reset' && (
        <label>
          Email address
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>
      )}

      {activeMode === 'reset' && (
        <label>
          Account email
          <input
            className="form-input"
            type="email"
            value={email}
            disabled
          />
        </label>
      )}

      {activeMode !== 'forgot' &&
        renderPasswordInput(
          'primary',
          password,
          setPassword,
          showPassword,
          setShowPassword,
          activeMode === 'reset' ? 'New password' : 'Password',
          activeMode === 'reset' ? 'At least 8 characters' : 'At least 8 characters',
        )}

      {activeMode === 'reset' &&
        renderPasswordInput(
          'confirm',
          confirmPassword,
          setConfirmPassword,
          showConfirm,
          setShowConfirm,
          'Confirm new password',
          'Re-enter your new password',
        )}

      {error && <p className="form-error">{error}</p>}

      {emailUnverified && (
        <div className="email-unverified-notice">
          <div className="unverified-icon">✉</div>
          <strong>Please verify your email address before logging in.</strong>
          <p>We sent a verification email to <strong>{unverifiedEmail}</strong>. Click the link in the email to verify your account.</p>
          <button
            className="primary-button full-button resend-verify-button"
            disabled={resendLoading}
            onClick={handleResendVerification}
          >
            {resendLoading ? 'Sending...' : 'Resend Verification Email'}
          </button>
          {resendMessage && <p className="resend-feedback">{resendMessage}</p>}
        </div>
      )}

      {!emailUnverified && (
        <button
          className="primary-button full-button"
          disabled={
            loading ||
            (activeMode === 'forgot' && !email.trim()) ||
            (activeMode === 'reset' && (password.length < 8 || password !== confirmPassword)) ||
            ((activeMode === 'login' || activeMode === 'signup') &&
              (!email.trim() || password.length < 8 || (activeMode === 'signup' && name.trim().length < 2)))
          }
          onClick={submit}
        >
          {loading
            ? 'Please wait...'
            : activeMode === 'forgot'
              ? 'Send reset link'
              : activeMode === 'reset'
                ? 'Update password'
                : activeMode === 'login'
                  ? access === 'admin'
                    ? 'Enter admin workspace'
                    : 'Log in'
                  : 'Create account'}{' '}
          <ArrowUpRight size={16} />
        </button>
      )}

      {showForgotFlow && activeMode !== 'signup' && activeMode !== 'forgot' && activeMode !== 'reset' && !emailUnverified && (
        <p className="switch-auth">
          Forgot your password?{' '}
          <button onClick={() => switchMode('forgot')}>Send a reset link</button>
        </p>
      )}

      {access === 'user' && (activeMode === 'login' || activeMode === 'signup' || activeMode === 'forgot') && (
        <p className="switch-auth">
          {activeMode === 'forgot'
            ? 'Remembered your password?'
            : activeMode === 'login'
              ? 'New to Gatherly?'
              : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              if (activeMode === 'forgot') switchMode('login')
              else switchMode(activeMode === 'login' ? 'signup' : 'login')
            }}
          >
            {activeMode === 'forgot'
              ? 'Back to log in'
              : activeMode === 'login'
                ? 'Create an account'
                : 'Log in'}
          </button>
        </p>
      )}

      {activeMode === 'reset' && (
        <p className="switch-auth">
          Need a new link?{' '}
          <button onClick={() => switchMode('forgot')}>Request another password reset</button>
        </p>
      )}
    </Modal>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state glass-panel">
      <Ticket size={24} />
      <strong>{text}</strong>
    </div>
  )
}
function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <Sparkles size={16} style={{ color: '#a89cff' }} />
      <span>{message}</span>
    </div>
  )
}


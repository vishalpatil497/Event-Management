import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Category } from './services/api'
import type { Booking, Event } from './types'

type DataContextValue = {
  events: Event[]
  bookings: Booking[]
  categories: Category[]
  setEvents: (items: Event[]) => void
  setBookings: (items: Booking[]) => void
  setCategories: (items: Category[]) => void
  refreshCategories: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const refreshCategories = useCallback(async () => {
    try {
      const response = await api.getCategories()
      setCategories(response.items ?? [])
    } catch {
      /* ignore; fallback defaults are handled server-side */
    }
  }, [])

  useEffect(() => {
    void refreshCategories()
  }, [refreshCategories])

  const value = useMemo<DataContextValue>(
    () => ({ events, bookings, categories, setEvents, setBookings, setCategories, refreshCategories }),
    [events, bookings, categories, refreshCategories],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

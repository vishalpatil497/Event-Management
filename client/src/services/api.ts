import type { Booking, Event, User } from '../types'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

export class ApiError extends Error {
  code?: string
  resendAvailable?: boolean
  constructor(message: string, code?: string, resendAvailable?: boolean) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.resendAvailable = resendAvailable
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({ message: 'Unexpected server response' }))
  if (!response.ok) {
    throw new ApiError(body.message ?? 'Request failed', body.code, body.resendAvailable)
  }
  return body as T
}

export type AuthInput = { mode: 'login' | 'signup'; name?: string; email: string; password: string }
export type EventInput = {
  title: string
  category: string
  date: string
  location: string
  city: string
  description: string
  organizer: string
  totalSeats: number
  price: number
  startTime?: string
  endTime?: string
  image?: string
}
export type AdminEvent = Event & { submittedBy: string; submittedEmail: string }
export type AdminUser = { id: string; name: string; email: string; role: 'USER' | 'ADMIN'; isActive: boolean; createdAt: string }
export type AdminBooking = { id: string; reference: string; attendee: string; email: string; event: string; city: string; seats: number; total: number; status: string; createdAt: string }
export type Category = { id: string; name: string; count: number }
export type ListResult<T> = { items: T[]; total?: number; page?: number; limit?: number }

export const api = {
  getEvents: (params?: { page?: number; limit?: number; category?: string; q?: string }) => {
    const search = new URLSearchParams()
    if (params?.page) search.set('page', String(params.page))
    if (params?.limit) search.set('limit', String(params.limit))
    if (params?.category) search.set('category', params.category)
    if (params?.q) search.set('q', params.q)
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request<ListResult<Event>>(`/events${suffix}`)
  },
  getMyEvents: (params?: { page?: number; limit?: number }) => {
    const search = new URLSearchParams()
    if (params?.page) search.set('page', String(params.page))
    if (params?.limit) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request<ListResult<Event>>(`/events/mine${suffix}`)
  },
  getMyBookings: (params?: { page?: number; limit?: number }) => {
    const search = new URLSearchParams()
    if (params?.page) search.set('page', String(params.page))
    if (params?.limit) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request<ListResult<Booking>>(`/bookings/my${suffix}`)
  },
  cancelBooking: (bookingId: string) =>
    request<ListResult<Booking> extends any ? { item: Booking } : never>(`/bookings/${bookingId}/cancel`, { method: 'PATCH' }),
  getCategories: () => request<{ items: Category[] }>('/categories'),
  me: () => request<{ user: User }>('/auth/me'),
  updateProfile: (name: string) => request<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  auth: (input: AuthInput) =>
    request<{ user: User }>(input.mode === 'signup' ? '/auth/register' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify(input.mode === 'signup' ? input : { email: input.email, password: input.password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) => request<{ sent: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ user: User; message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  createEvent: (input: EventInput) => request<{ item: Event }>('/events', { method: 'POST', body: JSON.stringify(input) }),
  createBooking: (eventId: string, numberOfSeats: number) =>
    request<{ item: Booking }>('/bookings', { method: 'POST', body: JSON.stringify({ eventId, numberOfSeats }) }),
  getDashboard: () =>
    request<{
      totalUsers: number
      totalEvents: number
      approvedEvents: number
      totalBookings: number
      pendingEvents: number
      revenue: number
      recentBookings: { id: string; attendee: string; event: string; total: number; status: string; createdAt: string }[]
    }>('/admin/dashboard'),
  getPendingEvents: () => request<ListResult<Event>>('/admin/events/pending'),
  getAdminEvents: (params?: { page?: number; limit?: number; status?: string }) => {
    const search = new URLSearchParams()
    if (params?.page) search.set('page', String(params.page))
    if (params?.limit) search.set('limit', String(params.limit))
    if (params?.status) search.set('status', params.status)
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request<ListResult<AdminEvent>>(`/admin/events${suffix}`)
  },
  getAdminUsers: () => request<{ items: AdminUser[] }>('/admin/users'),
  getAdminBookings: () => request<{ items: AdminBooking[] }>('/admin/bookings'),
  reviewEvent: (eventId: string, status: 'APPROVED' | 'REJECTED') =>
    request<{ item: Event }>(`/admin/events/${eventId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean; message: string; code?: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
}

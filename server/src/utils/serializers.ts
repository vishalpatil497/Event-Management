export type User = {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  emailVerified: boolean
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type AdminUser = {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  isActive: boolean
  emailVerified: boolean
  createdAt?: Date
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailValid(email: string): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email.trim())
}

function dateOnly(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10)
}

export function serializeEvent(event: any) {
  return {
    id: event.id ?? String(event._id), title: event.title, slug: event.slug,
    description: event.description, category: event.category, image: event.image ?? '',
    date: dateOnly(event.date), time: [event.startTime, event.endTime].filter(Boolean).join(' - '),
    startTime: event.startTime ?? '', endTime: event.endTime ?? '', location: event.location ?? '',
    city: event.city ?? '', organizer: event.organizer ?? '', price: event.price,
    seats: event.availableSeats, totalSeats: event.totalSeats, status: event.status,
    createdBy: event.createdBy, featured: event.featured ?? false,
  }
}

export function serializeBooking(booking: any) {
  const event = booking.eventId && typeof booking.eventId === 'object' ? booking.eventId : undefined
  return {
    id: booking.id ?? String(booking._id), eventId: event?.id ?? String(event?._id ?? booking.eventId),
    eventTitle: event?.title ?? '', eventImage: event?.image ?? '', date: dateOnly(event?.date),
    location: event?.city || event?.location || '', seats: booking.numberOfSeats,
    total: booking.totalAmount, status: booking.status, reference: booking.bookingReference,
    createdAt: booking.createdAt,
  }
}

export type Role = 'USER' | 'ADMIN'
export type EventStatus = 'APPROVED' | 'PENDING' | 'REJECTED'

export type Event = {
  id: string
  title: string
  category: string
  description: string
  date: string
  time: string
  location: string
  city: string
  organizer: string
  price: number
  seats: number
  totalSeats: number
  image: string
  status: EventStatus
  featured?: boolean
}

export type Booking = {
  id: string
  eventId: string
  eventTitle: string
  eventImage: string
  date: string
  location: string
  seats: number
  total: number
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
  reference: string
}

export type User = { name: string; email: string; role: Role; initials: string; emailVerified?: boolean }

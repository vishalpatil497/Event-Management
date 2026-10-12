import { Router } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { env } from '../config/env.js'
import { BookingModel } from '../models/Booking.js'
import { EventModel } from '../models/Event.js'
import { UserModel } from '../models/User.js'
import { CategoryModel } from '../models/Category.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { cancelBooking, createBooking } from '../services/bookingService.js'
import { applyPasswordReset, generatePasswordReset, loginUser, registerUser, signAccessToken, toPublicUser, verifyEmailToken, resendVerificationToken } from '../services/authService.js'
import { serializeBooking, serializeEvent } from '../utils/serializers.js'
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema, resendVerificationSchema } from '../validators/auth.js'
import { sendLoginAlert } from '../services/emailService.js'

const router = Router()
const updateNameSchema = z.object({ name: z.string().trim().min(2).max(80) })
const eventSchema = z.object({ title: z.string().trim().min(3).max(120), category: z.string().trim().min(2).max(60), date: z.string().min(8), location: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80), description: z.string().trim().min(20).max(5000), organizer: z.string().trim().min(2).max(120), totalSeats: z.coerce.number().int().min(1).max(100000), price: z.coerce.number().min(0), startTime: z.string().trim().max(30).optional(), endTime: z.string().trim().max(30).optional(), image: z.string().url().optional() })
const bookingSchema = z.object({ eventId: z.string().min(1), numberOfSeats: z.coerce.number().int().min(1).max(10) })
const reviewEventSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) })

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function parsePagination(req: { query: Record<string, unknown> }) {
  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)))
  const rawLimit = Number(req.query.limit ?? DEFAULT_PAGE_SIZE)
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_SIZE))
  return { page, limit, skip: (page - 1) * limit }
}

function authCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: env.isProduction, path: '/' }
}
function setAuthCookie(res: any, token: string) {
  res.cookie('accessToken', token, { ...authCookieOptions(), maxAge: 24 * 60 * 60 * 1000 })
}
function clearAuthCookie(res: any) {
  res.clearCookie('accessToken', authCookieOptions())
}
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
async function uniqueSlug(title: string, maxAttempts = 8): Promise<string> {
  const base = slugify(title)
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const suffix = attempt === 0
      ? Math.random().toString(36).slice(2, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const candidate = `${base}-${suffix}`
    const exists = await EventModel.exists({ slug: candidate })
    if (!exists) return candidate
  }
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

router.get('/health', (_req, res) => res.json({ ok: true, service: 'gatherly-api' }))

router.get('/categories', async (_req, res) => {
  const categoriesFromDb = await CategoryModel.find({ isActive: true }).sort({ name: 1 }).lean()
  const eventCategories = await EventModel.aggregate([
    { $match: { status: 'APPROVED' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
  const nameToCount = new Map(eventCategories.map(row => [row._id as string, row.count as number]))
  const dbNames = new Set(categoriesFromDb.map(c => c.name))
  for (const [name] of nameToCount) {
    if (name && !dbNames.has(name)) categoriesFromDb.push({ name, isActive: true } as any)
  }
  const fallbackDefaults = ['Technology', 'Wellness', 'Music', 'Design', 'Culture', 'Food & Drink']
  for (const name of fallbackDefaults) {
    if (!dbNames.has(name) && !categoriesFromDb.find(item => item.name === name)) {
      categoriesFromDb.push({ name, isActive: true } as any)
    }
  }
  const items = categoriesFromDb
    .map(cat => ({ id: (cat as any)._id ? String((cat as any)._id) : String(cat.name), name: cat.name, count: nameToCount.get(cat.name) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return res.json({ items })
})

router.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Please provide a valid name, email, and password of at least 8 characters.' })
  try {
    const forwardedFor = req.headers['x-forwarded-for']
    const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : (req.ip ?? req.socket.remoteAddress ?? undefined)
    const userAgent = req.headers['user-agent']
    const user = await registerUser({ ...parsed.data, ip, userAgent })
    // Do NOT set auth cookie — user must verify email first
    return res.status(201).json({
      user,
      emailVerificationSent: true,
      message: 'Account created! Please check your email to verify your address before logging in.',
    })
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to register' })
  }
})

router.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Enter a valid email and password.' })
  try {
    const user = await loginUser(parsed.data.email, parsed.data.password)
    setAuthCookie(res, signAccessToken(user))
    const forwardedFor = req.headers['x-forwarded-for']
    const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : (req.ip ?? req.socket.remoteAddress ?? undefined)
    const userAgent = req.headers['user-agent']
    // #region debug-point DP-auth-route-5 (H4/H5/H1) login-alert enqueue
    try {
      const fs = await import('node:fs')
      const envPath = '.dbg/gmail-login-alert-debug.env'
      const defUrl = 'http://127.0.0.1:7777/event'
      const defSes = 'gmail-login-alert-debug'
      let url = defUrl, ses = defSes
      try { const raw = fs.readFileSync(envPath, 'utf8'); url = raw.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? url; ses = raw.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? ses } catch { /* ignore */ }
      void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: ses, runId: 'pre', hypothesisId: 'H4', location: 'routes/index.ts:auth-login', msg: `[DEBUG] login alert enqueued (await-send for debug)`, data: { userId: user.id, userEmail: user.email, ip: ip ? `${ip.length}b-hash:${ip.slice(-4)}` : undefined, uaLen: userAgent?.length, ts: Date.now() }, ts: Date.now() }) }).catch(() => {})
    } catch { /* debug reporting must never break the app */ }
    // intentionally wrap the fire-and-forget send call so we can capture its status in debug logs
    void (async () => {
      const sent = await sendLoginAlert({ name: user.name, email: user.email, loginAt: new Date(), ip, userAgent })
      try {
        const fs = await import('node:fs')
        const envPath = '.dbg/gmail-login-alert-debug.env'
        const defUrl = 'http://127.0.0.1:7777/event'
        const defSes = 'gmail-login-alert-debug'
        let url = defUrl, ses = defSes
        try { const raw = fs.readFileSync(envPath, 'utf8'); url = raw.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? url; ses = raw.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? ses } catch { /* ignore */ }
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: ses, runId: 'pre', hypothesisId: 'H5', location: 'routes/index.ts:auth-login-send-result', msg: `[DEBUG] sendLoginAlert resolved`, data: { userId: user.id, to: user.email, sent, ts: Date.now() }, ts: Date.now() }) }).catch(() => {})
      } catch { /* ignore */ }
    })()
    // #endregion
    return res.json({ user })
  } catch (error) {
    const err = error as Error & { code?: string; email?: string; resendAvailable?: boolean }
    if (err.code === 'EMAIL_UNVERIFIED') {
      return res.status(403).json({
        message: err.message,
        code: 'EMAIL_UNVERIFIED',
        resendAvailable: err.resendAvailable ?? true,
      })
    }
    return res.status(401).json({ message: err.message ?? 'Unable to log in' })
  }
})

router.post('/auth/logout', (_req, res) => {
  clearAuthCookie(res)
  return res.status(204).send()
})

router.post('/auth/verify-email', async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ ok: false, message: 'Invalid verification token.' })
  const result = await verifyEmailToken(parsed.data.token)
  if (!result.ok) {
    const status = result.code === 'expired' ? 410 : 400
    return res.status(status).json({ ok: false, code: result.code, message: result.message })
  }
  return res.json({ ok: true, message: 'Your email has been verified. You can now log in.' })
})

router.post('/auth/resend-verification', async (req, res) => {
  const parsed = resendVerificationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Enter a valid email address.' })
  const forwardedFor = req.headers['x-forwarded-for']
  const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : (req.ip ?? req.socket.remoteAddress ?? undefined)
  const userAgent = req.headers['user-agent']
  const result = await resendVerificationToken({ email: parsed.data.email, ip, userAgent })
  if (result.status === 'rate_limited') {
    return res.status(429).json({ message: 'Too many requests. Please try again later.' })
  }
  if (result.status === 'already_verified') {
    return res.json({ message: 'This email is already verified. You can log in.' })
  }
  // Generic response — does not reveal whether the email exists
  return res.json({ message: result.message })
})

router.post('/auth/forgot-password', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Enter a valid email address.' })
  try {
    const origin = (req.headers.origin ?? env.clientOrigins[0] ?? 'http://localhost:5173')
    await generatePasswordReset(parsed.data.email, String(origin))
    return res.json({ sent: true, message: 'If an account exists with that email, a password reset link has been sent.' })
  } catch {
    return res.json({ sent: true, message: 'If an account exists with that email, a password reset link has been sent.' })
  }
})

router.post('/auth/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Please provide a valid token and a new password of at least 8 characters.' })
  try {
    const user = await applyPasswordReset(parsed.data.token, parsed.data.password)
    setAuthCookie(res, signAccessToken(user))
    return res.json({ user, message: 'Your password has been updated. You are now signed in.' })
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to reset password.' })
  }
})

router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await UserModel.findById(req.user!.id)
  if (!user) return res.status(401).json({ message: 'Session user no longer exists' })
  return res.json({ user: toPublicUser(user) })
})

router.patch('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateNameSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Enter a name between 2 and 80 characters.' })
  const user = await UserModel.findByIdAndUpdate(req.user!.id, { name: parsed.data.name }, { new: true })
  if (!user) return res.status(404).json({ message: 'Account not found.' })
  return res.json({ user: toPublicUser(user) })
})

router.get('/events', async (req, res) => {
  const query = String(req.query.q ?? '').trim()
  const category = String(req.query.category ?? '').trim()
  const { page, limit, skip } = parsePagination(req)
  const filters: Record<string, unknown> = { status: 'APPROVED' }
  if (category) filters.category = category
  if (query) filters.$or = [{ title: { $regex: query, $options: 'i' } }, { category: { $regex: query, $options: 'i' } }, { city: { $regex: query, $options: 'i' } }, { organizer: { $regex: query, $options: 'i' } }]
  const [events, total] = await Promise.all([
    EventModel.find(filters).sort({ date: 1 }).skip(skip).limit(limit).lean(),
    EventModel.countDocuments(filters),
  ])
  return res.json({ items: events.map(serializeEvent), total, page, limit })
})

router.get('/events/mine', requireAuth, async (req: AuthedRequest, res) => {
  const { page, limit, skip } = parsePagination(req)
  const [items, total] = await Promise.all([
    EventModel.find({ createdBy: req.user!.id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    EventModel.countDocuments({ createdBy: req.user!.id }),
  ])
  return res.json({ items: items.map(serializeEvent), total, page, limit })
})

router.get('/events/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found' })
  const event = await EventModel.findOne({ _id: req.params.id, status: 'APPROVED' }).lean()
  if (!event) return res.status(404).json({ message: 'Event not found' })
  return res.json({ item: serializeEvent(event) })
})

router.post('/events', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Please complete all required event details.' })
  const data = parsed.data
  const slug = await uniqueSlug(data.title)
  const event = await EventModel.create({
    ...data,
    date: new Date(data.date),
    slug,
    availableSeats: data.totalSeats,
    status: 'PENDING',
    createdBy: req.user!.id,
  })
  return res.status(201).json({ item: serializeEvent(event) })
})

router.post('/bookings', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = bookingSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Choose a valid event and seat quantity.' })
  try {
    const booking = await createBooking({ userId: req.user!.id, ...parsed.data })
    return res.status(201).json({ item: serializeBooking(booking) })
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to create booking' })
  }
})

router.patch('/bookings/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const bookingId = String(req.params.id)
  if (!isValidObjectId(bookingId)) return res.status(404).json({ message: 'Booking not found' })
  try {
    const booking = await cancelBooking(bookingId, String(req.user!.id))
    return res.json({ item: serializeBooking(booking) })
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to cancel booking' })
  }
})

router.get('/bookings/my', requireAuth, async (req: AuthedRequest, res) => {
  const { page, limit, skip } = parsePagination(req)
  const [bookings, total] = await Promise.all([
    BookingModel.find({ userId: req.user!.id }).populate('eventId').sort({ createdAt: -1 }).skip(skip).limit(limit),
    BookingModel.countDocuments({ userId: req.user!.id }),
  ])
  return res.json({ items: bookings.map(serializeBooking), total, page, limit })
})

router.get('/admin/dashboard', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const [totalUsers, totalEvents, approvedEvents, totalBookings, pendingEvents, revenue, recentBookings] = await Promise.all([
    UserModel.countDocuments(),
    EventModel.countDocuments(),
    EventModel.countDocuments({ status: 'APPROVED' }),
    BookingModel.countDocuments(),
    EventModel.countDocuments({ status: 'PENDING' }),
    BookingModel.aggregate([{ $match: { status: { $in: ['CONFIRMED', 'COMPLETED'] } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    BookingModel.find().populate('userId', 'name').populate('eventId', 'title').sort({ createdAt: -1 }).limit(5).lean(),
  ])
  return res.json({
    totalUsers, totalEvents, approvedEvents, totalBookings, pendingEvents,
    revenue: revenue[0]?.total ?? 0,
    recentBookings: recentBookings.map((booking: any) => ({
      id: String(booking._id), attendee: booking.userId?.name ?? 'Guest',
      event: booking.eventId?.title ?? 'Removed event', total: booking.totalAmount,
      status: booking.status, createdAt: booking.createdAt,
    })),
  })
})

router.get('/admin/events/pending', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const pendingEvents = await EventModel.find({ status: 'PENDING' }).sort({ createdAt: 1 }).lean()
  return res.json({ items: pendingEvents.map(serializeEvent) })
})

router.get('/admin/events', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const status = String(req.query.status ?? '').trim()
  const { page, limit, skip } = parsePagination(req)
  const query: Record<string, unknown> = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {}
  const [items, total] = await Promise.all([
    EventModel.find(query).populate('createdBy', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    EventModel.countDocuments(query),
  ])
  return res.json({
    items: items.map((event: any) => ({ ...serializeEvent(event), submittedBy: event.createdBy?.name ?? 'Unknown organizer', submittedEmail: event.createdBy?.email ?? '' })),
    total, page, limit,
  })
})

router.get('/admin/users', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const users = await UserModel.find().select('name email role isActive createdAt').sort({ createdAt: -1 }).lean()
  return res.json({ items: users.map((user: any) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt })) })
})

router.get('/admin/bookings', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const bookings = await BookingModel.find().populate('userId', 'name email').populate('eventId', 'title city').sort({ createdAt: -1 }).limit(100).lean()
  return res.json({
    items: bookings.map((booking: any) => ({
      id: String(booking._id), reference: booking.bookingReference,
      attendee: booking.userId?.name ?? 'Guest', email: booking.userId?.email ?? '',
      event: booking.eventId?.title ?? 'Removed event', city: booking.eventId?.city ?? '',
      seats: booking.numberOfSeats, total: booking.totalAmount,
      status: booking.status, createdAt: booking.createdAt,
    })),
  })
})

router.patch('/admin/events/:id/status', requireAuth, requireRole('ADMIN'), async (req: AuthedRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found' })
  const parsed = reviewEventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ message: 'Choose approved or rejected.' })
  const event = await EventModel.findByIdAndUpdate(req.params.id, { status: parsed.data.status, approvedBy: req.user!.id }, { new: true })
  if (!event) return res.status(404).json({ message: 'Event not found' })
  return res.json({ item: serializeEvent(event) })
})

export default router

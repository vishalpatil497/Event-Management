import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { UserModel } from '../models/User.js'
import { VerificationTokenModel } from '../models/VerificationToken.js'
import { isEmailValid as _isEmailValid } from '../utils/serializers.js'
import type { User, AdminUser } from '../utils/serializers.js'
import { env } from '../config/env.js'
import { sendVerificationEmail } from '../services/emailService.js'

type AccessMode = 'login' | 'signup'

const BCRYPT_MIN_ROUNDS = 12

const VERIFY_TOKEN_BYTES = 32

function hashToken(plain: string) {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

function generatePlainToken() {
  const bytes = crypto.randomBytes(VERIFY_TOKEN_BYTES)
  return bytes.toString('base64url')
}

function verificationExpiry() {
  const d = new Date()
  d.setMinutes(d.getMinutes() + env.verify.ttlMinutes)
  return d
}

function buildVerifyLink(token: string) {
  const base = env.appUrl || 'http://localhost:5173'
  return `${base}/verify-email?token=${encodeURIComponent(token)}`
}

export async function generateAndStoreVerificationToken(input: {
  userId: string
  email: string
  name: string
  ip?: string
  userAgent?: string
  invalidateExisting?: boolean
}) {
  const { userId, email, name, ip, userAgent, invalidateExisting = true } = input
  if (invalidateExisting) {
    await VerificationTokenModel.updateMany(
      { userId, used: false },
      { $set: { used: true, expiresAt: new Date(Date.now() - 1000) } },
    ).catch(() => null)
  }
  const plain = generatePlainToken()
  const tokenHash = hashToken(plain)
  const expiresAt = verificationExpiry()
  await VerificationTokenModel.create({
    userId,
    tokenHash,
    expiresAt,
    used: false,
    ip,
    userAgent,
  })
  const verifyLink = buildVerifyLink(plain)
  await sendVerificationEmail({ name, email, verifyLink, expiresAt }).catch(() => null)
  return { expiresAt, verifyLink }
}

export async function resendVerificationToken(input: { email: string; ip?: string; userAgent?: string }) {
  const normalizedEmail = input.email.trim().toLowerCase()
  const user = await UserModel.findOne({ email: normalizedEmail }).exec()
  const result = {
    status: 'queued' as 'queued' | 'rate_limited' | 'already_verified',
    message: 'If a Gatherly account exists for that email, a new verification link has been sent.',
  }
  if (!user) return result
  if (user.emailVerified) {
    result.status = 'already_verified'
    result.message = 'This email is already verified.'
    return result
  }
  const ip = input.ip ?? 'unknown'
  const ipWindowStart = new Date(Date.now() - 60 * 1000)
  const ipCount = await VerificationTokenModel.countDocuments({
    ip,
    createdAt: { $gte: ipWindowStart },
  }).exec()
  if (ipCount >= Math.max(1, env.verify.resendPerIpPerMinute)) {
    result.status = 'rate_limited'
    return result
  }
  const emailWindowStart = new Date(Date.now() - 60 * 60 * 1000)
  const emailCount = await VerificationTokenModel.countDocuments({
    userId: user._id,
    createdAt: { $gte: emailWindowStart },
  }).exec()
  if (emailCount >= Math.max(1, env.verify.resendPerEmailPerHour)) {
    result.status = 'rate_limited'
    return result
  }
  await generateAndStoreVerificationToken({
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    ip: input.ip,
    userAgent: input.userAgent,
    invalidateExisting: true,
  })
  return result
}

export async function verifyEmailToken(plainToken: string) {
  if (typeof plainToken !== 'string' || plainToken.length < 16) {
    return { ok: false, code: 'invalid_token' as const, message: 'Invalid or expired verification token.' }
  }
  const tokenHash = hashToken(plainToken)
  const token = await VerificationTokenModel.findOne({ tokenHash }).exec()
  if (!token) {
    return { ok: false, code: 'invalid_token' as const, message: 'Invalid or expired verification token.' }
  }
  if (token.used) {
    return { ok: false, code: 'already_used' as const, message: 'This verification link has already been used.' }
  }
  if (Date.now() > token.expiresAt.getTime()) {
    return { ok: false, code: 'expired' as const, message: 'This verification link has expired. Please request a new one.' }
  }
  const user = await UserModel.findById(token.userId).exec()
  if (!user) {
    await VerificationTokenModel.findByIdAndUpdate(token._id, { $set: { used: true, expiresAt: new Date(Date.now() - 1000) } }).exec()
    return { ok: false, code: 'user_not_found' as const, message: 'Invalid or expired verification token.' }
  }
  const session = await (VerificationTokenModel as any).db.startSession?.().catch(() => null)
  if (session) {
    try {
      await session.withTransaction(async () => {
        await UserModel.findByIdAndUpdate(user._id, { $set: { emailVerified: true } }).session(session).exec()
        await VerificationTokenModel.findByIdAndUpdate(token._id, { $set: { used: true, expiresAt: new Date(Date.now() - 1000) } }).session(session).exec()
        await VerificationTokenModel.deleteMany({ userId: user._id, _id: { $ne: token._id } }).session(session).exec()
      })
    } finally {
      await session.endSession().catch(() => null)
    }
  } else {
    await UserModel.findByIdAndUpdate(user._id, { $set: { emailVerified: true } }).exec()
    await VerificationTokenModel.findByIdAndUpdate(token._id, { $set: { used: true, expiresAt: new Date(Date.now() - 1000) } }).exec()
    await VerificationTokenModel.deleteMany({ userId: user._id, _id: { $ne: token._id } }).exec()
  }
  return { ok: true as const, user: { id: user._id.toString(), email: user.email, name: user.name } }
}

export async function authenticate(input: {
  mode: AccessMode
  name?: string
  email: string
  password: string
  ip?: string
  userAgent?: string
}) {
  if (input.mode === 'signup') {
    if (!input.name) throw new Error('Name is required.')
    if (_isEmailValid(input.email) === false) throw new Error('Enter a valid email address.')
    const existing = await UserModel.findOne({ email: input.email.trim().toLowerCase() }).select('_id').exec()
    if (existing) throw new Error('An account with that email already exists.')
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters.')
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_MIN_ROUNDS)
    const created = await UserModel.create({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role: 'USER',
      emailVerified: false,
    })
    void generateAndStoreVerificationToken({
      userId: created._id.toString(),
      email: created.email,
      name: created.name,
      ip: input.ip,
      userAgent: input.userAgent,
    }).catch(() => null)
    const user = created.toObject()
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: false,
      isActive: user.isActive,
    } as const
  }
  const found = await UserModel.findOne({ email: input.email.trim().toLowerCase() })
    .select('+passwordHash emailVerified isActive role name email createdAt')
    .exec()
  const passwordHash = found?.passwordHash
  const dummyDelay = found ? Promise.resolve() : new Promise<void>(r => setTimeout(r, 200))
  const verified = passwordHash ? await bcrypt.compare(input.password, passwordHash) : false
  await dummyDelay
  if (!found || !verified) {
    throw new Error('Invalid email or password.')
  }
  if (!found.isActive) throw new Error('This account has been disabled.')
  if (!found.emailVerified) {
    const err: Error & { code?: string; email?: string; resendAvailable?: boolean } = new Error(
      'Please verify your email address before logging in.',
    )
    err.code = 'EMAIL_UNVERIFIED'
    err.email = found.email
    err.resendAvailable = true
    throw err
  }
  return {
    id: found._id.toString(),
    name: found.name,
    email: found.email,
    role: found.role,
    emailVerified: found.emailVerified,
    isActive: found.isActive,
    createdAt: (found as any).createdAt,
  } as const
}

export async function forgotPassword(email: string) {
  const normalized = email.trim().toLowerCase()
  const user = await UserModel.findOne({ email: normalized }).select('_id email name').exec()
  if (!user) return { message: 'If a Gatherly account exists for that email, a password reset link has been sent.' }
  const buffer = crypto.randomBytes(24)
  const resetPasswordToken = crypto.createHash('sha256').update(buffer).digest('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  await UserModel.findByIdAndUpdate(user._id, { $set: { resetPasswordToken, resetPasswordExpires: expiresAt } }).exec()
  return { message: 'If a Gatherly account exists for that email, a password reset link has been sent.' }
}

export async function resetPassword(token: string, nextPassword: string) {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const user = await UserModel.findOne({ resetPasswordToken: hash }).select('+resetPasswordExpires').exec()
  if (!user || !user.resetPasswordExpires || Date.now() > user.resetPasswordExpires.getTime()) {
    throw new Error('This password reset link has expired or is no longer valid.')
  }
  if (nextPassword.length < 8) throw new Error('Password must be at least 8 characters.')
  const passwordHash = await bcrypt.hash(nextPassword, BCRYPT_MIN_ROUNDS)
  const updated = await UserModel.findByIdAndUpdate(
    user._id,
    { $set: { passwordHash, resetPasswordToken: undefined as any, resetPasswordExpires: undefined as any } },
    { new: true, runValidators: true },
  ).exec()
  if (!updated) throw new Error('Unable to reset password.')
  return {
    id: updated._id.toString(),
    name: updated.name,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
  } as const
}

export async function getUserById(id: string): Promise<User | null> {
  const found = await UserModel.findById(id).exec()
  if (!found) return null
  return {
    id: found._id.toString(),
    name: found.name,
    email: found.email,
    role: found.role as 'USER' | 'ADMIN',
    emailVerified: !!found.emailVerified,
    isActive: !!found.isActive,
    createdAt: (found as any).createdAt,
    updatedAt: (found as any).updatedAt,
  }
}

export async function updateProfile(id: string, nextName: string): Promise<User> {
  const name = nextName.trim()
  if (name.length < 2 || name.length > 80) throw new Error('Name must be between 2 and 80 characters.')
  const updated = await UserModel.findByIdAndUpdate(id, { $set: { name } }, { new: true, runValidators: true }).exec()
  if (!updated) throw new Error('User not found.')
  return {
    id: updated._id.toString(),
    name: updated.name,
    email: updated.email,
    role: updated.role as 'USER' | 'ADMIN',
    emailVerified: !!updated.emailVerified,
    isActive: !!updated.isActive,
    createdAt: (updated as any).createdAt,
    updatedAt: (updated as any).updatedAt,
  }
}

export async function listUsers({ page = 1, limit = 20 }: { page?: number; limit?: number }) {
  const p = Math.max(1, Math.floor(page || 1))
  const l = Math.max(1, Math.min(100, Math.floor(limit || 20)))
  const total = await UserModel.countDocuments().exec()
  const rows = await UserModel.find()
    .sort({ createdAt: -1 })
    .skip((p - 1) * l)
    .limit(l)
    .exec()
  return {
    total,
    items: rows.map<AdminUser>(row => ({
      id: row._id.toString(),
      name: row.name,
      email: row.email,
      role: row.role as 'USER' | 'ADMIN',
      isActive: !!row.isActive,
      emailVerified: !!row.emailVerified,
      createdAt: (row as any).createdAt,
    })),
  }
}

// ── Wrapper exports consumed by routes/index.ts ──

export function signAccessToken(user: { id: string; role: string }) {
  return jwt.sign({ id: user.id, role: user.role }, env.accessSecret, { expiresIn: '24h' })
}

export function toPublicUser(doc: any): User {
  return {
    id: doc._id?.toString?.() ?? doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role as 'USER' | 'ADMIN',
    emailVerified: !!doc.emailVerified,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function registerUser(data: { name: string; email: string; password: string; ip?: string; userAgent?: string }) {
  return authenticate({ mode: 'signup', name: data.name, email: data.email, password: data.password, ip: data.ip, userAgent: data.userAgent })
}

export async function loginUser(email: string, password: string) {
  return authenticate({ mode: 'login', email, password })
}

export async function generatePasswordReset(email: string, _origin?: string) {
  return forgotPassword(email)
}

export async function applyPasswordReset(token: string, password: string) {
  return resetPassword(token, password)
}


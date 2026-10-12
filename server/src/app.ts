import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'
import api from './routes/index.js'
import { ensureAdminUser, ensureStarterEvents } from './services/seedService.js'

const app = express()

const helmetOptions: Record<string, any> = {}
if (!env.isProduction) {
  helmetOptions.crossOriginResourcePolicy = { policy: 'cross-origin' }
  helmetOptions.crossOriginOpenerPolicy = false
  helmetOptions.crossOriginEmbedderPolicy = false
  const localhostAnyPort = ['http://localhost:*', 'https://localhost:*', 'http://127.0.0.1:*', 'https://127.0.0.1:*', 'ws://localhost:*', 'wss://localhost:*', 'ws://127.0.0.1:*']
  helmetOptions.contentSecurityPolicy = {
    useDefaults: true,
    directives: {
      'default-src': ["'self'", ...localhostAnyPort],
      'img-src': ["'self'", 'data:', 'https:', 'http:', ...localhostAnyPort],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://fonts.googleapis.com', 'data:', ...localhostAnyPort],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', ...localhostAnyPort],
      'script-src': ["'self'", "'unsafe-inline'", ...localhostAnyPort],
      'connect-src': ["'self'", "'unsafe-inline'", 'http:', 'https:', 'ws:', 'wss:', ...localhostAnyPort],
      'worker-src': ["'self'", 'blob:'],
    },
  }
}
app.use(helmet(helmetOptions))

const allowOrigins = new Set(env.clientOrigins.map(o => o.replace(/\/$/, '')))
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  if (allowOrigins.has(origin.replace(/\/$/, ''))) return true
  if (!env.isProduction) {
    try {
      const u = new URL(origin)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') return true
    } catch {
      /* ignore malformed origin */
    }
  }
  return false
}
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true }))

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many authentication attempts. Please try again later.' },
})

app.use('/api/auth', authLimiter)
app.use('/api', generalLimiter)

app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api', api)
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }))

async function start() {
  await connectDatabase()
  const admin = await ensureAdminUser()
  await ensureStarterEvents(admin.id)
  app.listen(env.port, () => console.log(`Gatherly API listening on :${env.port}`))
}

start().catch(error => { console.error('Unable to start Gatherly API', error); process.exit(1) })

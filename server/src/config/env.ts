import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryEnv = resolve(thisDirectory, '../../..', '.env')
const localEnv = resolve(process.cwd(), '.env')
dotenv.config({ path: existsSync(repositoryEnv) ? repositoryEnv : localEnv })

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value || value.includes('replace-me') || value.includes('please-set') || value.includes('generate-a-long')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing or insecure environment variable: ${name}. Set a proper value in production.`)
    }
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const rawClientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const smtpHost = process.env.SMTP_HOST
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const smtpPort = Number(process.env.SMTP_PORT ?? 587)
const smtpSecure = (process.env.SMTP_SECURE ?? 'false') === 'true'
const smtpFrom = process.env.SMTP_FROM ?? 'Gatherly <no-reply@gatherly.local>'

// Gmail-specific startup validation + spam compliance notes
const GMAIL_SENDING_LIMITS_FREE = 500
const GMAIL_SENDING_LIMITS_WORKSPACE = 2000
function logGmailSmtpStartupWarnings() {
  if (!smtpHost) {
    console.warn('[env] ⚠ SMTP_HOST not set – email delivery will be silently skipped. Set SMTP env vars to enable login alerts and password resets.')
    return
  }
  const isGmail = smtpHost === 'smtp.gmail.com' || smtpHost.endsWith('.gmail.com')
  if (!isGmail) return
  const issues: string[] = []
  if (smtpPort !== 587 && smtpPort !== 465) {
    issues.push(`SMTP_PORT=${smtpPort} – Gmail requires port 587 (STARTTLS) or 465 (SSL).`)
  }
  if (smtpPort === 587 && smtpSecure !== false) {
    issues.push(`SMTP_PORT=587 expects SMTP_SECURE=false (uses STARTTLS upgrade, not implicit SSL).`)
  }
  if (smtpPort === 465 && smtpSecure !== true) {
    issues.push(`SMTP_PORT=465 expects SMTP_SECURE=true (implicit SSL/TLS).`)
  }
  if (!smtpUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpUser)) {
    issues.push(`SMTP_USER must be a valid Gmail address (e.g. you@gmail.com).`)
  }
  if (smtpPass) {
    const stripped = smtpPass.replace(/\s+/g, '')
    if (stripped.length < 12) {
      issues.push(`SMTP_PASS appears too short (${stripped.length} chars). Gmail with 2FA requires a 16-char App Password. Create one at https://myaccount.google.com/apppasswords`)
    }
  } else {
    issues.push(`SMTP_PASS is empty – email delivery will be skipped.`)
  }
  if (smtpUser && smtpFrom && !smtpFrom.toLowerCase().includes(smtpUser.toLowerCase())) {
    issues.push(`SMTP_FROM="${smtpFrom}" does not match SMTP_USER="${smtpUser}". Gmail will likely reject as spoofed / DMARC fail → spam folder.`)
  }
  if (issues.length) {
    console.warn(`[env] ⚠ Gmail SMTP config warnings (${issues.length}):`)
    for (const issue of issues) console.warn(`       - ${issue}`)
  } else {
    console.info(`[env] ✓ Gmail SMTP config looks valid (host=${smtpHost}, port=${smtpPort}, secure=${smtpSecure}, user=${smtpUser}). Gmail limits: ~${GMAIL_SENDING_LIMITS_FREE}/day free, ~${GMAIL_SENDING_LIMITS_WORKSPACE}/day Workspace.`)
  }
  console.info(`[env] ℹ Gmail spam compliance tips already applied: Message-ID, Auto-Submitted, Precedence:bulk, List-Unsubscribe, Importance:High for alerts.`)
}
if (smtpHost) logGmailSmtpStartupWarnings()

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigins: rawClientOrigins,
  mongoUri: requireEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017/gatherly'),
  accessSecret: requireEnv('JWT_ACCESS_SECRET', 'local-dev-access-secret-change-before-production-32charsmin'),
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  adminEmail: requireEnv('ADMIN_EMAIL', 'admin123@gmail.com'),
  adminPassword: requireEnv('ADMIN_PASSWORD', 'admin@123-change-before-production'),
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  verify: {
    ttlMinutes: Number(process.env.VERIFY_EMAIL_TTL_MINUTES ?? 20),
    resendPerEmailPerHour: Number(process.env.RESEND_VERIFY_RATE_PER_EMAIL_PER_HOUR ?? 3),
    resendPerIpPerMinute: Number(process.env.RESEND_VERIFY_RATE_PER_IP_PER_MINUTE ?? 1),
  },
  smtp: {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
    from: smtpFrom,
    secure: smtpSecure,
    limits: {
      gmailFreePerDay: GMAIL_SENDING_LIMITS_FREE,
      gmailWorkspacePerDay: GMAIL_SENDING_LIMITS_WORKSPACE,
    },
  },
}

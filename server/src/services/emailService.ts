import nodemailer, { type Transporter, type SendMailOptions } from 'nodemailer'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

// #region debug-point helpers (gmail-login-alert-debug)
const DBG_ENV = '.dbg/gmail-login-alert-debug.env'
const DBG_DEF_URL = 'http://127.0.0.1:7777/event'
const DBG_DEF_SES = 'gmail-login-alert-debug'
function dbgReport(hypothesisId: string, location: string, msg: string, data: Record<string, unknown> = {}) {
  try {
    let url = DBG_DEF_URL
    let ses = DBG_DEF_SES
    try {
      const raw = fs.readFileSync(DBG_ENV, 'utf8')
      url = raw.match(/DEBUG_SERVER_URL=(.+)/)?.[1] ?? url
      ses = raw.match(/DEBUG_SESSION_ID=(.+)/)?.[1] ?? ses
    } catch {
      // ignore
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: ses, runId: 'pre', hypothesisId, location, msg: `[DEBUG] ${msg}`, data, ts: Date.now() }),
    }).catch(() => {
      // ignore
    })
  } catch {
    // debug reporting must never break the app
  }
}
// #endregion

// #region structured logging
type LogLevel = 'info' | 'warn' | 'error' | 'debug'
function emailLog(level: LogLevel, event: string, message: string, correlationId: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  const prefix = `[${ts}] [emailService] [${level.toUpperCase()}] [${event}] [cid:${correlationId}]`
  const line = `${prefix} ${message}${data ? ` ${JSON.stringify(data)}` : ''}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
function newCorrelationId() {
  return crypto.randomBytes(8).toString('hex')
}
// #endregion

// #region retry + Gmail SMTP configuration validation
type SmtpConfigIssue = { severity: 'error' | 'warn' | 'info'; field: string; message: string }
function validateGmailSmtpConfig(): SmtpConfigIssue[] {
  const issues: SmtpConfigIssue[] = []
  const { host, port, user, pass, secure, from } = env.smtp
  const isGmail = host === 'smtp.gmail.com' || (typeof host === 'string' && host.endsWith('.gmail.com'))
  if (!isGmail) return issues
  if (port !== 587 && port !== 465) {
    issues.push({ severity: 'error', field: 'SMTP_PORT', message: `Gmail SMTP requires port 587 (STARTTLS) or 465 (SSL). Got port ${port}.` })
  }
  if (port === 587 && secure !== false) {
    issues.push({ severity: 'warn', field: 'SMTP_SECURE', message: 'Gmail port 587 expects SMTP_SECURE=false (uses STARTTLS upgrade, not implicit SSL).' })
  }
  if (port === 465 && secure !== true) {
    issues.push({ severity: 'warn', field: 'SMTP_SECURE', message: 'Gmail port 465 expects SMTP_SECURE=true (implicit SSL/TLS).' })
  }
  if (user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    issues.push({ severity: 'error', field: 'SMTP_USER', message: 'SMTP_USER should be a valid Gmail address (e.g. you@gmail.com).' })
  }
  if (pass) {
    const stripped = pass.replace(/\s+/g, '')
    if (stripped.length < 12) {
      issues.push({
        severity: 'warn',
        field: 'SMTP_PASS',
        message: 'For Gmail with 2FA, SMTP_PASS must be a 16-char App Password. Shorter values are almost certainly the regular password (will not work). Generate one at https://myaccount.google.com/apppasswords',
      })
    }
  }
  if (from && user && !from.toLowerCase().includes(user.toLowerCase())) {
    issues.push({
      severity: 'warn',
      field: 'SMTP_FROM',
      message: 'SMTP_FROM address should match SMTP_USER to avoid Gmail spoofing rejection / DMARC failures and spam folder placement.',
    })
  }
  return issues
}
// #endregion

let cachedTransporter: Transporter | null = null
let transporterVerified = false

function getTransporter(correlationId: string): Transporter | null {
  const { host, port, user, pass, secure } = env.smtp
  const missing: string[] = []
  if (!host) missing.push('SMTP_HOST')
  if (!user) missing.push('SMTP_USER')
  if (!pass) missing.push('SMTP_PASS')
  const passMasked = pass ? (pass.length > 4 ? `${pass.slice(0, 2)}${'*'.repeat(pass.length - 4)}${pass.slice(-2)}` : '***') : ''
  dbgReport('H1', 'emailService.ts:getTransporter', 'smtp config read', { host, port, user, passMasked, secure, missing, cacheHit: !!cachedTransporter })
  emailLog('debug', 'config_read', 'SMTP config evaluated', correlationId, { host, port, user, secure, passMasked, missing, cacheHit: !!cachedTransporter })
  if (missing.length > 0) {
    dbgReport('H1', 'emailService.ts:getTransporter', 'smtp env incomplete - delivery skipped', { missing })
    emailLog('warn', 'config_missing', 'SMTP not configured. Skipping email delivery.', correlationId, { missing })
    return null
  }
  const configIssues = validateGmailSmtpConfig()
  for (const issue of configIssues) {
    const lvl = issue.severity === 'error' ? 'error' : issue.severity
    emailLog(lvl as LogLevel, 'config_validate', `SMTP config issue: ${issue.message}`, correlationId, { field: issue.field })
  }
  if (cachedTransporter) return cachedTransporter
  const tlsConfig = { rejectUnauthorized: false }
  dbgReport('H2', 'emailService.ts:getTransporter', 'creating nodemailer transporter', { host, port, secure, authUser: user, tlsRejectUnauthorized: false })
  emailLog('info', 'transporter_create', 'Creating Nodemailer transporter', correlationId, { host, port, secure, authUser: user })
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: tlsConfig,
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  })
  return cachedTransporter
}

async function verifyTransporter(correlationId: string): Promise<boolean> {
  const transporter = getTransporter(correlationId)
  if (!transporter) return false
  if (transporterVerified) return true
  try {
    const ok = await transporter.verify()
    transporterVerified = ok
    emailLog(ok ? 'info' : 'warn', 'smtp_verify', `SMTP connection verify: ${ok ? 'OK' : 'FAILED'}`, correlationId, { ok })
    dbgReport('H2', 'emailService.ts:verifyTransporter', 'transporter.verify result', { ok })
    return ok
  } catch (error) {
    transporterVerified = false
    const err = error as Error & { code?: string; errno?: number; command?: string; response?: string; responseCode?: number }
    emailLog('error', 'smtp_verify_fail', `SMTP connection verify failed: ${err.message}`, correlationId, {
      code: err.code,
      errno: err.errno,
      command: err.command,
      responseCode: err.responseCode,
      response: (err.response ?? '').slice(0, 200),
    })
    dbgReport('H2', 'emailService.ts:verifyTransporter', 'verify throw', {
      code: err.code,
      errno: err.errno,
      message: err.message,
    })
    return false
  }
}

type LoginAlertContext = {
  name: string
  email: string
  loginAt: Date
  ip?: string
  userAgent?: string
}

type ResetPasswordContext = {
  name: string
  email: string
  resetLink: string
  expiresAt: Date
}

type WelcomeContext = {
  name: string
  email: string
}

type VerificationContext = {
  name: string
  email: string
  verifyLink: string
  expiresAt: Date
}

// #region Gmail spam-compliance helpers
function gmailCompliantHeaders(type: 'login-alert' | 'password-reset' | 'welcome' | 'email-verification') {
  const nowUtc = new Date().toUTCString()
  const msgIdDomain = (env.smtp.user?.split('@')[1]) ?? 'gatherly.local'
  const msgId = `<${crypto.randomBytes(12).toString('hex')}@${msgIdDomain}>`
  const listUnsubEmail = env.smtp.user ? `<mailto:${env.smtp.user}?subject=Unsubscribe%20from%20security%20alerts>` : ''
  const headers: Record<string, string> = {
    'Message-ID': msgId,
    Date: nowUtc,
    'X-Mailer': 'Gatherly-App (Nodemailer)',
    'X-Report-Abuse': `Please report abuse to <mailto:abuse@${msgIdDomain}>`,
  }
  if (type === 'login-alert') {
    headers['List-Unsubscribe'] = listUnsubEmail
    headers['Precedence'] = 'bulk'
    headers['Auto-Submitted'] = 'auto-generated'
    headers['X-Auto-Response-Suppress'] = 'All'
    headers['Importance'] = 'High'
    headers['Priority'] = 'urgent'
  } else if (type === 'password-reset') {
    headers['Precedence'] = 'bulk'
    headers['Auto-Submitted'] = 'auto-generated'
    headers['X-Auto-Response-Suppress'] = 'All'
    headers['Importance'] = 'High'
  } else if (type === 'welcome') {
    headers['Precedence'] = 'bulk'
    headers['Auto-Submitted'] = 'auto-generated'
  } else if (type === 'email-verification') {
    headers['Precedence'] = 'bulk'
    headers['Auto-Submitted'] = 'auto-generated'
    headers['X-Auto-Response-Suppress'] = 'All'
    headers['Importance'] = 'High'
    headers['Priority'] = 'urgent'
  }
  return headers
}

function isTransientError(err: { code?: string; errno?: number; responseCode?: number; response?: string }) {
  if (typeof err.responseCode === 'number' && err.responseCode >= 400 && err.responseCode < 500) return true
  if (typeof err.code === 'string' && ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'ECONNREFUSED', 'EAI_AGAIN', 'EPROTO'].includes(err.code)) return true
  if (typeof err.response === 'string' && /^4[0-9]{2}\s/.test(err.response)) return true
  return false
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
// #endregion

function formatLoginAlertHtml(ctx: LoginAlertContext) {
  const date = ctx.loginAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })
  const ipRow = ctx.ip
    ? `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb;"><span style="color: #6b7280; font-size: 13px;">IP address</span><strong style="font-size: 13px;">${ctx.ip}</strong></div>`
    : ''
  const uaRow = ctx.userAgent
    ? `<div style="display: flex; justify-content: space-between; padding: 6px 0;"><span style="color: #6b7280; font-size: 13px;">Device</span><strong style="font-size: 13px;">${ctx.userAgent.slice(0, 120)}</strong></div>`
    : ''
  return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <div style="padding: 16px 20px; background: linear-gradient(135deg, #8f7aff 0%, #62b7ff 100%); border-radius: 12px 12px 0 0; color: #fff;">
      <h2 style="margin: 0; font-size: 20px;">Gatherly Security Alert</h2>
    </div>
    <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hi <strong>${ctx.name}</strong>,</p>
      <p style="margin: 0 0 20px; line-height: 1.6;">A new sign-in was detected on your Gatherly account. If this was you, no action is needed.</p>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb;">
          <span style="color: #6b7280; font-size: 13px;">When</span>
          <strong style="font-size: 13px;">${date}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb;">
          <span style="color: #6b7280; font-size: 13px;">Email</span>
          <strong style="font-size: 13px;">${ctx.email}</strong>
        </div>
        ${ipRow}
        ${uaRow}
      </div>
      <p style="margin: 20px 0 0; line-height: 1.6; color: #ef4444; font-size: 14px;">If you did not sign in, change your password immediately and review your account activity.</p>
      <p style="margin: 16px 0 0; color: #6b7280; font-size: 12px;">The Gatherly team</p>
    </div>
  </div>`
}

function formatResetPasswordHtml(ctx: ResetPasswordContext) {
  return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <div style="padding: 16px 20px; background: linear-gradient(135deg, #54d3a5 0%, #62b7ff 100%); border-radius: 12px 12px 0 0; color: #fff;">
      <h2 style="margin: 0; font-size: 20px;">Reset your Gatherly password</h2>
    </div>
    <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hi <strong>${ctx.name}</strong>,</p>
      <p style="margin: 0 0 20px; line-height: 1.6;">We received a request to reset the password for your Gatherly account. Click the button below to set a new password.</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${ctx.resetLink}" style="display: inline-block; padding: 12px 28px; background: #8f7aff; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">Reset password</a>
      </div>
      <p style="margin: 12px 0; font-size: 13px; color: #6b7280;">Or paste this link into your browser:</p>
      <p style="margin: 0 0 16px; padding: 10px 12px; background: #f3f4f6; border-radius: 8px; font-size: 12px; word-break: break-all; color: #374151;">${ctx.resetLink}</p>
      <p style="margin: 0; line-height: 1.6; font-size: 14px;">This link expires at <strong>${ctx.expiresAt.toLocaleString('en-IN')}</strong>. If you did not request a password reset, you can safely ignore this email.</p>
      <p style="margin: 16px 0 0; color: #6b7280; font-size: 12px;">The Gatherly team</p>
    </div>
  </div>`
}

function formatWelcomeHtml(ctx: WelcomeContext) {
  return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <div style="padding: 16px 20px; background: linear-gradient(135deg, #8f7aff 0%, #ffb26c 100%); border-radius: 12px 12px 0 0; color: #fff;">
      <h2 style="margin: 0; font-size: 20px;">Welcome to Gatherly</h2>
    </div>
    <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hi <strong>${ctx.name}</strong>,</p>
      <p style="margin: 0 0 8px; line-height: 1.6;">Your Gatherly account is ready. Discover events, book tickets, and host experiences worth showing up for.</p>
      <p style="margin: 0; line-height: 1.6; font-size: 14px;">Sign in with <strong>${ctx.email}</strong> to get started.</p>
      <p style="margin: 16px 0 0; color: #6b7280; font-size: 12px;">The Gatherly team</p>
    </div>
  </div>`
}

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 800

type EmailType = 'login-alert' | 'password-reset' | 'welcome' | 'email-verification'

async function safeSend(mail: SendMailOptions, emailType: EmailType) {
  const correlationId = newCorrelationId()
  const envelope = { from: String(mail.from), to: mail.to, subject: mail.subject }
  const transporter = getTransporter(correlationId)
  const sizeHtml = typeof mail.html === 'string' ? mail.html.length : (mail.html ? 'non-string' : 0)
  const sizeText = typeof mail.text === 'string' ? mail.text.length : (mail.text ? 'non-string' : 0)
  dbgReport('H3', 'emailService.ts:safeSend:entry', 'safeSend called', { ...envelope, transporter: !!transporter, sizeHtml, sizeText, emailType })
  emailLog('info', 'send_start', `Sending ${emailType}: ${mail.subject} -> ${mail.to}`, correlationId, { ...envelope, sizeHtml, sizeText })
  if (!transporter) {
    dbgReport('H1', 'emailService.ts:safeSend', 'send skipped: transporter=null (no SMTP config)', envelope)
    emailLog('warn', 'send_skipped', `SMTP disabled - would send: ${mail.subject} -> ${mail.to}`, correlationId, envelope)
    return { sent: false, correlationId, attempts: 0 }
  }
  const verified = await verifyTransporter(correlationId)
  if (!verified) {
    emailLog('warn', 'send_skipped_verify', 'SMTP verify failed; attempting send anyway', correlationId)
  }
  const compliantHeaders = gmailCompliantHeaders(emailType)
  const finalMail: SendMailOptions = {
    ...mail,
    headers: { ...compliantHeaders, ...(mail.headers ?? {}) },
  }
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      dbgReport('H2', 'emailService.ts:safeSend:beforeSend', `invoking transporter.sendMail (attempt ${attempt}/${MAX_RETRIES})`, { ...envelope, attempt })
      emailLog('debug', 'send_attempt', `Delivery attempt ${attempt}/${MAX_RETRIES}`, correlationId, { attempt, maxRetries: MAX_RETRIES })
      const t0 = Date.now()
      const result = await transporter.sendMail(finalMail)
      const latency = Date.now() - t0
      const accepted = Array.isArray(result.accepted) ? result.accepted.length : 0
      const rejected = Array.isArray(result.rejected) ? result.rejected.length : 0
      dbgReport('H4', 'emailService.ts:safeSend:success', 'sendMail returned', {
        ...envelope,
        latencyMs: latency,
        messageId: result.messageId,
        accepted,
        rejected,
        attempt,
        responseType: typeof result.response,
        responsePreview: typeof result.response === 'string' ? result.response.slice(0, 120) : undefined,
      })
      emailLog('info', 'send_success', `Delivered ${emailType} in ${latency}ms`, correlationId, {
        messageId: result.messageId,
        accepted,
        rejected,
        latencyMs: latency,
        attempt,
      })
      return { sent: true, correlationId, attempts: attempt, messageId: result.messageId }
    } catch (error) {
      lastError = error
      const err = error as Error & { code?: string; errno?: number; command?: string; response?: string; responseCode?: number }
      const transient = isTransientError(err)
      const gmailAuthReject = typeof err.response === 'string' && /535|5\.7\.8|Username and Password not accepted|Application-specific password required/i.test(err.response)
      const gmailSpamBlock = typeof err.response === 'string' && /550|5\.7\.1|spam|phish|unverified|DMARC|SPF/i.test(err.response)
      const gmailRateLimit = typeof err.response === 'string' && /450|451|4\.2\.1|452|Daily user sending quota exceeded/i.test(err.response)
      dbgReport('H5', 'emailService.ts:safeSend:catch', `sendMail throw (attempt ${attempt}/${MAX_RETRIES})`, {
        ...envelope,
        attempt,
        code: err.code,
        errno: err.errno,
        command: err.command,
        responseCode: err.responseCode,
        response: (err.response ?? '').slice(0, 300),
        message: err.message,
        isTransient: transient,
        isGmailAuthReject: gmailAuthReject,
        isGmailSpamBlock: gmailSpamBlock,
        isGmailRateLimit: gmailRateLimit,
      })
      const logLvl: LogLevel = transient && attempt < MAX_RETRIES ? 'warn' : 'error'
      emailLog(logLvl, 'send_fail_attempt', `Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`, correlationId, {
        attempt,
        code: err.code,
        errno: err.errno,
        command: err.command,
        responseCode: err.responseCode,
        responsePreview: (err.response ?? '').slice(0, 200),
        isTransient: transient,
        isGmailAuthReject: gmailAuthReject,
        isGmailSpamBlock: gmailSpamBlock,
        isGmailRateLimit: gmailRateLimit,
      })
      if (gmailAuthReject) {
        emailLog('error', 'gmail_auth_rejected', 'Gmail rejected SMTP credentials. Use a 16-char App Password (2FA required). See https://myaccount.google.com/apppasswords', correlationId)
        break
      }
      if (gmailSpamBlock) {
        emailLog('error', 'gmail_spam_blocked', 'Gmail flagged message as spam/phish. Review FROM address, content, and sending reputation.', correlationId)
        break
      }
      if (gmailRateLimit) {
        const backoff = Math.min(60000, BASE_BACKOFF_MS * Math.pow(4, attempt))
        emailLog('warn', 'gmail_rate_limited', `Gmail rate-limit hit. Backing off ${backoff}ms`, correlationId, { backoffMs: backoff })
        await sleep(backoff)
        continue
      }
      if (!transient || attempt >= MAX_RETRIES) {
        break
      }
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
      emailLog('debug', 'retry_backoff', `Transient error. Retrying in ${backoff}ms`, correlationId, { backoffMs: backoff, attempt })
      await sleep(backoff)
    }
  }
  const err = lastError as Error & { code?: string; responseCode?: number; response?: string } | null
  emailLog('error', 'send_failed_permanently', `Permanent failure after ${MAX_RETRIES} attempts: ${err?.message ?? 'unknown'}`, correlationId, {
    maxRetries: MAX_RETRIES,
    code: err?.code,
    responseCode: err?.responseCode,
    response: (err?.response ?? '').slice(0, 200),
  })
  return { sent: false, correlationId, attempts: MAX_RETRIES }
}

export async function sendLoginAlert(ctx: LoginAlertContext) {
  const result = await safeSend({
    from: env.smtp.from,
    to: ctx.email,
    subject: 'Gatherly: New sign-in detected',
    html: formatLoginAlertHtml(ctx),
    text: `Hi ${ctx.name},\n\nA new sign-in was detected on your Gatherly account at ${ctx.loginAt.toLocaleString('en-IN')}. If you did not sign in, change your password immediately.\n\nThe Gatherly team`,
  }, 'login-alert')
  return result.sent
}

export async function sendPasswordReset(ctx: ResetPasswordContext) {
  const result = await safeSend({
    from: env.smtp.from,
    to: ctx.email,
    subject: 'Gatherly: Reset your password',
    html: formatResetPasswordHtml(ctx),
    text: `Hi ${ctx.name},\n\nReset your password here: ${ctx.resetLink}\n\nThis link expires at ${ctx.expiresAt.toLocaleString('en-IN')}. If you did not request this, ignore this email.\n\nThe Gatherly team`,
  }, 'password-reset')
  return result.sent
}

export async function sendWelcome(ctx: WelcomeContext) {
  const result = await safeSend({
    from: env.smtp.from,
    to: ctx.email,
    subject: 'Welcome to Gatherly',
    html: formatWelcomeHtml(ctx),
    text: `Hi ${ctx.name},\n\nWelcome to Gatherly! Sign in with ${ctx.email} to get started.\n\nThe Gatherly team`,
  }, 'welcome')
  return result.sent
}

function formatVerificationHtml(ctx: VerificationContext) {
  const expiresStr = ctx.expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <div style="padding: 16px 20px; background: linear-gradient(135deg, #8f7aff 0%, #b09eff 100%); border-radius: 12px 12px 0 0; color: #fff;">
      <h2 style="margin: 0; font-size: 20px;">Verify Your Email Address</h2>
    </div>
    <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hi <strong>${ctx.name}</strong>,</p>
      <p style="margin: 0 0 20px; line-height: 1.6;">Welcome to Gatherly! To complete your registration and start discovering amazing events, please verify your email address by clicking the button below.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${ctx.verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(100deg, #9687ff, #7765ed); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 14px rgba(117, 99, 237, 0.3);">Verify Email</a>
      </div>
      <p style="margin: 12px 0; font-size: 13px; color: #6b7280;">Or paste this link into your browser:</p>
      <p style="margin: 0 0 16px; padding: 10px 12px; background: #f3f4f6; border-radius: 8px; font-size: 12px; word-break: break-all; color: #374151;">${ctx.verifyLink}</p>
      <div style="padding: 12px 14px; background: #fef3c7; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; font-size: 12px; color: #92400e;"><strong>⏱ This link expires at ${expiresStr}.</strong> After that, you'll need to request a new verification email.</p>
      </div>
      <p style="margin: 16px 0 0; line-height: 1.6; font-size: 13px; color: #6b7280;">If you did not create a Gatherly account, you can safely ignore this email. No account will be activated without verification.</p>
      <p style="margin: 16px 0 0; color: #6b7280; font-size: 12px;">The Gatherly team</p>
    </div>
  </div>`
}

export async function sendVerificationEmail(ctx: VerificationContext) {
  const expiresStr = ctx.expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const result = await safeSend({
    from: env.smtp.from,
    to: ctx.email,
    subject: 'Verify Your Email Address',
    html: formatVerificationHtml(ctx),
    text: `Hi ${ctx.name},\n\nWelcome to Gatherly! Please verify your email address by visiting this link:\n\n${ctx.verifyLink}\n\nThis link expires at ${expiresStr}. If you did not create a Gatherly account, you can safely ignore this email.\n\nThe Gatherly team`,
  }, 'email-verification')
  return result.sent
}

export { isTransientError, validateGmailSmtpConfig, gmailCompliantHeaders, MAX_RETRIES }


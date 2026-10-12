import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export type AuthUser = { id: string; role: 'USER' | 'ADMIN' }
export type AuthedRequest = Request & { user?: AuthUser }

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken ?? req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: 'Authentication required' })
  try { req.user = jwt.verify(token, env.accessSecret) as AuthUser; next() } catch { return res.status(401).json({ message: 'Invalid or expired session' }) }
}

export function requireRole(role: AuthUser['role']) { return (req: AuthedRequest, res: Response, next: NextFunction) => req.user?.role === role ? next() : res.status(403).json({ message: 'Forbidden' }) }

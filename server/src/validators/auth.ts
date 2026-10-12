import { z } from 'zod'

export const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(100) })
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
export const forgotPasswordSchema = z.object({ email: z.string().email() })
export const resetPasswordSchema = z.object({ token: z.string().min(8), password: z.string().min(8).max(100) })
export const verifyEmailSchema = z.object({ token: z.string().min(16).max(256) })
export const resendVerificationSchema = z.object({ email: z.string().email() })

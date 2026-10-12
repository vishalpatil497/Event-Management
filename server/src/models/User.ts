import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  avatar: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false, index: true },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
}, { timestamps: true })

export const UserModel = model('User', userSchema)

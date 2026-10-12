import { Schema, model, type Types } from 'mongoose'

type VerificationTokenDocument = {
  _id: Types.ObjectId
  userId: Types.ObjectId
  tokenHash: string
  expiresAt: Date
  used: boolean
  ip?: string
  userAgent?: string
  createdAt: Date
}

const verificationTokenSchema = new Schema<VerificationTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: { unique: false, expireAfterSeconds: 0 } },
    used: { type: Boolean, default: false, index: true },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 512 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

verificationTokenSchema.index({ userId: 1, createdAt: -1 })

export const VerificationTokenModel = model<VerificationTokenDocument>('VerificationToken', verificationTokenSchema)

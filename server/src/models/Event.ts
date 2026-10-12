import { Schema, model } from 'mongoose'

const eventSchema = new Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true }, category: { type: String, required: true, index: true }, image: String,
  date: { type: Date, required: true, index: true }, startTime: String, endTime: String, location: String, city: String, organizer: String,
  totalSeats: { type: Number, required: true, min: 1 }, availableSeats: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 }, featured: { type: Boolean, default: false }, status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, rejectionReason: String,
}, { timestamps: true })

export const EventModel = model('Event', eventSchema)


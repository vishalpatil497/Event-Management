import { Schema, model } from 'mongoose'

const bookingSchema = new Schema({
  bookingReference: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  numberOfSeats: { type: Number, required: true, min: 1 }, pricePerSeat: { type: Number, required: true, min: 0 }, totalAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['CONFIRMED', 'CANCELLED', 'COMPLETED'], default: 'CONFIRMED' },
}, { timestamps: true })

export const BookingModel = model('Booking', bookingSchema)

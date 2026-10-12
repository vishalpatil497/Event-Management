import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { BookingModel } from '../models/Booking.js'
import { EventModel } from '../models/Event.js'

export async function createBooking(input: { userId: string; eventId: string; numberOfSeats: number }) {
  if (!Number.isInteger(input.numberOfSeats) || input.numberOfSeats < 1) {
    throw new Error('Seat quantity must be a positive integer')
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const event = await EventModel.findOneAndUpdate(
      { _id: input.eventId, status: 'APPROVED', availableSeats: { $gte: input.numberOfSeats } },
      { $inc: { availableSeats: -input.numberOfSeats } },
      { new: true, session },
    )
    if (!event) {
      throw new Error('Event is unavailable or does not have enough seats')
    }
    const [booking] = await BookingModel.create(
      [
        {
          bookingReference: `GTH-${randomBytes(4).toString('hex').toUpperCase()}`,
          userId: input.userId,
          eventId: event.id,
          numberOfSeats: input.numberOfSeats,
          pricePerSeat: event.price,
          totalAmount: event.price * input.numberOfSeats,
          status: 'CONFIRMED',
        },
      ],
      { session },
    )
    await session.commitTransaction()
    return booking
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    await session.endSession()
  }
}

export async function cancelBooking(bookingId: string, userId: string) {
  const existing = await BookingModel.findOne({ _id: bookingId, userId }).populate('eventId') as any
  if (!existing) throw new Error('Booking not found')
  if (existing.status === 'CANCELLED') throw new Error('Booking is already cancelled')
  if (existing.status === 'COMPLETED') throw new Error('Completed bookings cannot be cancelled')

  const event = existing.eventId
  const eventDate = event?.date ? new Date(event.date) : null
  if (eventDate && eventDate.getTime() < Date.now()) {
    throw new Error('Past events cannot be cancelled')
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const updated = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: { $nin: ['CANCELLED', 'COMPLETED'] } },
      { status: 'CANCELLED' },
      { new: true, session },
    )
    if (!updated) throw new Error('Booking is no longer cancellable')

    if (event && existing.numberOfSeats > 0) {
      await EventModel.findByIdAndUpdate(event._id ?? event.id, { $inc: { availableSeats: existing.numberOfSeats } }, { session })
    }
    await session.commitTransaction()
    const refreshed = await BookingModel.findById(bookingId).populate('eventId')
    return refreshed!
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    await session.endSession()
  }
}

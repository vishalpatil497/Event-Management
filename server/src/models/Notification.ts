import { Schema, model } from 'mongoose'

const notificationSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, title: String, message: String, type: String, isRead: { type: Boolean, default: false } }, { timestamps: true })
export const NotificationModel = model('Notification', notificationSchema)

import { Schema, model } from 'mongoose'

const categorySchema = new Schema({ name: { type: String, required: true }, slug: { type: String, unique: true }, description: String, image: String, isActive: { type: Boolean, default: true } }, { timestamps: true })
export const CategoryModel = model('Category', categorySchema)

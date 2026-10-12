import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import { CategoryModel } from '../models/Category.js'
import { EventModel } from '../models/Event.js'
import { UserModel } from '../models/User.js'

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function ensureAdminUser() {
  const email = env.adminEmail.toLowerCase()
  let admin = await UserModel.findOne({ email })
  if (!admin) {
    admin = await UserModel.create({
      name: 'Gatherly Admin',
      email,
      passwordHash: await bcrypt.hash(env.adminPassword, 12),
      role: 'ADMIN',
      emailVerified: true,
    })
    console.log(`Admin account seeded for ${email}`)
  } else if (!admin.emailVerified) {
    admin.emailVerified = true
    await admin.save()
    console.log(`Admin account auto-verified for ${email}`)
  }
  return admin
}

function futureDate(days: number) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date
}

async function ensureUniqueSlug(title: string, dateMs: number): Promise<string> {
  const base = slugify(title)
  let candidate = `${base}-${dateMs}`
  if (!(await EventModel.exists({ slug: candidate }))) return candidate
  let suffix = Math.random().toString(36).slice(2, 8)
  for (let i = 0; i < 10; i += 1) {
    candidate = `${base}-${dateMs}-${suffix}`
    if (!(await EventModel.exists({ slug: candidate }))) return candidate
    suffix = Math.random().toString(36).slice(2, 10)
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function ensureStarterEvents(adminId: string) {
  if (await EventModel.exists({})) return

  const defaultCategories = [
    { name: 'Technology', slug: 'technology', description: 'Engineering, product, and developer events.' },
    { name: 'Wellness', slug: 'wellness', description: 'Movement, mindfulness, and wellbeing gatherings.' },
    { name: 'Music', slug: 'music', description: 'Live performances and listening sessions.' },
    { name: 'Design', slug: 'design', description: 'Talks and workshops for creators and product teams.' },
    { name: 'Culture', slug: 'culture', description: 'Storytelling, walks, and community-led arts.' },
    { name: 'Food & Drink', slug: 'food-and-drink', description: 'Dinners, tastings, and culinary experiences.' },
  ]
  for (const cat of defaultCategories) {
    await CategoryModel.updateOne({ slug: cat.slug }, { $setOnInsert: { ...cat, isActive: true } }, { upsert: true })
  }

  const events = [
    { title: 'Founders and Builders Forum', category: 'Technology', description: 'A practical evening for founders, engineers, and product builders to exchange ideas, meet collaborators, and learn from local operators.', date: futureDate(12), startTime: '10:00', endTime: '17:00', location: 'The Grand Ballroom', city: 'Bengaluru', organizer: 'Gatherly Community', totalSeats: 180, price: 1299, featured: true, image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=85' },
    { title: 'Midnight Jazz Collective', category: 'Music', description: 'An intimate live set from emerging jazz musicians, paired with good conversation and a late-evening city atmosphere.', date: futureDate(19), startTime: '19:30', endTime: '22:30', location: 'The Listening Room', city: 'Mumbai', organizer: 'After Hours Mumbai', totalSeats: 90, price: 850, featured: true, image: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=85' },
    { title: 'Design for Everyone', category: 'Design', description: 'A hands-on gathering for designers and product teams exploring clear, inclusive, and useful digital experiences.', date: futureDate(27), startTime: '14:00', endTime: '18:00', location: 'Makers Hall', city: 'Pune', organizer: 'Open Design Pune', totalSeats: 120, price: 699, featured: false, image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=85' },
    { title: 'Reset and Restore Retreat', category: 'Wellness', description: 'Slow down with guided movement, breathwork, and a nourishing community lunch in a calm outdoor setting.', date: futureDate(34), startTime: '08:30', endTime: '14:00', location: 'Palm Grove Studio', city: 'Goa', organizer: 'Kindred Wellbeing', totalSeats: 60, price: 1499, featured: false, image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1400&q=85' },
    { title: 'Sunday Supper Club', category: 'Food & Drink', description: 'A long-table dinner celebrating seasonal ingredients, independent chefs, and the pleasure of meeting new people.', date: futureDate(42), startTime: '19:00', endTime: '22:00', location: 'The Courtyard Kitchen', city: 'Delhi', organizer: 'Table Stories', totalSeats: 48, price: 1899, featured: false, image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=85' },
    { title: 'Frames of the City', category: 'Culture', description: 'Walk Mumbai with photographers and storytellers, then share your favourite frame over coffee at sunset.', date: futureDate(49), startTime: '16:00', endTime: '19:00', location: 'Kala Ghoda', city: 'Mumbai', organizer: 'City Lens Collective', totalSeats: 75, price: 499, featured: false, image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=85' },
  ]

  const built = []
  for (const event of events) {
    const slug = await ensureUniqueSlug(event.title, event.date.getTime())
    built.push({ ...event, slug, availableSeats: event.totalSeats, status: 'APPROVED', createdBy: adminId, approvedBy: adminId })
  }
  await EventModel.insertMany(built)
  console.log(`Seeded ${events.length} starter events`)
}

import dns from 'node:dns'
import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDatabase() {
  mongoose.set('strictQuery', true)

  // Some ISP/corporate DNS servers refuse SRV lookups, while Atlas uses them
  // for every mongodb+srv URI. Public resolvers make the connection portable
  // on those networks and have no effect on regular mongodb:// connections.
  if (env.mongoUri.startsWith('mongodb+srv://')) dns.setServers(['1.1.1.1', '8.8.8.8'])

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 12000 })
  console.log('MongoDB connected')
}

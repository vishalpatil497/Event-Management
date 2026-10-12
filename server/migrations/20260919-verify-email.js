/**
 * Migration: 20260919-verify-email
 *
 * Backfills the `emailVerified` field for users created before email
 * verification was introduced. Existing users are marked as verified so they
 * are not locked out of login. New users default to `emailVerified: false`.
 *
 * Run once:
 *   cd server
 *   node migrations/20260919-verify-email.js
 *
 * The script is idempotent — re-running it is safe because it only updates
 * documents where `emailVerified` does not yet exist.
 */

import dotenv from 'dotenv'
import mongoose from 'mongoose'
import dns from 'node:dns'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryEnv = resolve(thisDirectory, '../../.env')
const localEnv = resolve(process.cwd(), '.env')
dotenv.config({ path: existsSync(repositoryEnv) ? repositoryEnv : localEnv })

const mongoUri = process.env.MONGODB_URI
if (!mongoUri) {
  console.error('MONGODB_URI is not set. Check your .env file.')
  process.exit(1)
}

if (mongoUri.startsWith('mongodb+srv://')) {
  dns.setServers(['1.1.1.1', '8.8.8.8'])
}

async function run() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 })
  console.log('Connected to MongoDB')

  const usersCollection = mongoose.connection.collection('users')

  // Mark all pre-existing users (without emailVerified) as verified.
  const result = await usersCollection.updateMany(
    { emailVerified: { $exists: false } },
    { $set: { emailVerified: true } },
  )

  console.log(
    `Migration complete. Matched ${result.matchedCount} document(s), modified ${result.modifiedCount} document(s).`,
  )

  await mongoose.disconnect()
  console.log('Disconnected from MongoDB')
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

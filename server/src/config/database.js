import mongoose from 'mongoose'

export async function connectDatabase(connectionString) {
  await mongoose.connect(connectionString, { serverSelectionTimeoutMS: 5000 })
  console.log('Connected to MongoDB.')
}

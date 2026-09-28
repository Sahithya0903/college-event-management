import mongoose from 'mongoose'

const registrationSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    eventName: { type: String, required: true },
    studentName: { type: String, required: true, trim: true },
    rollNumber: { type: String, required: true, trim: true, uppercase: true },
    ticketCode: { type: String, required: true },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// A roll number can be registered only once for the same event.
// The partial index keeps old registrations without roll numbers from blocking new ones.
registrationSchema.index(
  { eventId: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: 'string' } } },
)
registrationSchema.index({ eventId: 1 })
registrationSchema.index(
  { ticketCode: 1 },
  { unique: true, partialFilterExpression: { ticketCode: { $type: 'string' } } },
)

const Registration = mongoose.model('Registration', registrationSchema)

export default Registration

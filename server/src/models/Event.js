import mongoose from 'mongoose'

// A schema describes what fields each event document stores in MongoDB.
const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    dateLabel: { type: String, required: true },
    time: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1, max: 5000, default: 50 },
    posterUrl: { type: String, default: '' },
    color: { type: String, default: 'mint' },
    symbol: { type: String, default: '✦' },
  },
  { timestamps: true },
)

const Event = mongoose.model('Event', eventSchema)

export default Event

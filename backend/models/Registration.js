const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registrationId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'rejected', 'attended', 'no_show'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'submitted', 'paid', 'failed', 'refunded'],
      default: 'not_required',
    },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], trim: true, lowercase: true },
    phone: { type: String, required: [true, 'Phone number is required'], trim: true },
    organization: { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    extra: { type: String, trim: true, default: '', maxlength: 1000 },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One registration per person per event (a cancelled one is re-used).
registrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });
registrationSchema.index({ userId: 1, registeredAt: -1 });

module.exports = mongoose.model('Registration', registrationSchema);

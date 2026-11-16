const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    paymentMethod: { type: String, default: 'online' },
    transactionId: { type: String, required: true, unique: true },
    providerReference: { type: String, trim: true, default: '' },
    proofFile: { type: String, default: '', select: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    status: { type: String, enum: ['pending', 'submitted', 'successful', 'failed', 'refunded'], default: 'pending' },
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ registrationId: 1 }, { unique: true, partialFilterExpression: { status: 'submitted' } });

module.exports = mongoose.model('Payment', paymentSchema);

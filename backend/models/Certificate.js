const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
    certificateId: { type: String, required: true, unique: true },
    certificateTemplateVersion: { type: Number, default: 1 },
    recipientName: { type: String, required: true },
    recipientOrganization: { type: String, trim: true, default: '' },
    awardPlace: { type: String, enum: ['', 'First Place', 'Second Place', 'Third Place'], default: '' },
    certificateUrl: { type: String, default: '' },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

certificateSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);

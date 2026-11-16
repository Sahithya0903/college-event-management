const mongoose = require('mongoose');

const STATUSES = ['draft', 'published', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled'];

// Builds a local Date from a stored calendar date (UTC midnight) and an "HH:mm" string.
const at = (date, time = '00:00') => {
  const d = new Date(date);
  const [h, m] = time.split(':').map(Number);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 0, m || 0);
};

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Event title is required'], trim: true, maxlength: 150 },
    description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 5000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: [true, 'Choose a category'] },
    image: { type: String, default: '' },
    paymentQr: { type: String, default: '', select: false },
    certificateBackground: { type: String, default: '' },
    certificateLayout: { type: String, enum: ['classic', 'modern', 'minimal', 'custom'], default: 'classic' },
    certificateAccent: { type: String, default: '#3D3BF3', match: [/^#[0-9a-fA-F]{6}$/, 'Certificate accent must be a hex color'] },
    certificateTitle: { type: String, trim: true, maxlength: 100, default: 'Certificate of Participation' },
    certificateMessage: { type: String, trim: true, maxlength: 300, default: 'for successfully participating in' },
    rankingCertificateBackground: { type: String, default: '', select: false },
    rankingsConfirmed: { type: Boolean, default: false, select: false },
    rankings: { type: [{
      place: { type: String, enum: ['First Place', 'Second Place', 'Third Place'], required: true },
      registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      _id: false,
    }], default: [], select: false },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate: { type: Date, required: [true, 'End date is required'] },
    startTime: { type: String, default: '09:00', match: [/^\d{2}:\d{2}$/, 'Start time must be HH:mm'] },
    endTime: { type: String, default: '17:00', match: [/^\d{2}:\d{2}$/, 'End time must be HH:mm'] },
    venue: { type: String, required: [true, 'Venue is required'], trim: true },
    location: { type: String, required: [true, 'Location is required'], trim: true },
    fee: { type: Number, default: 0, min: [0, 'Fee cannot be negative'] },
    isCompetition: { type: Boolean, default: false },
    capacity: { type: Number, required: [true, 'Capacity is required'], min: [1, 'Capacity must be at least 1'] },
    registeredCount: { type: Number, default: 0, min: 0 },
    registrationDeadline: { type: Date },
    status: { type: String, enum: STATUSES, default: 'draft' },
    autoIssueCertificates: { type: Boolean, default: true },
    certificatesIssuedAt: { type: Date },
    organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizerName: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    highlights: [{ type: String, trim: true }],
    schedule: [{ time: String, title: String, details: String, _id: false }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

eventSchema.index({ startDate: 1 });
eventSchema.index({ organizerId: 1 });
eventSchema.index({ category: 1 });

eventSchema.virtual('startsAt').get(function startsAt() {
  return at(this.startDate, this.startTime);
});
eventSchema.virtual('endsAt').get(function endsAt() {
  return at(this.endDate, this.endTime);
});

eventSchema.virtual('seatsLeft').get(function seatsLeft() {
  return Math.max(0, (this.capacity || 0) - (this.registeredCount || 0));
});

// The status people actually see: stored status adjusted by dates.
eventSchema.virtual('liveStatus').get(function liveStatus() {
  if (['draft', 'cancelled', 'completed'].includes(this.status)) return this.status;
  const now = new Date();
  if (now > this.endsAt) return 'completed';
  if (now >= this.startsAt) return 'ongoing';
  if (this.status === 'registration_closed') return 'registration_closed';
  if (this.registrationDeadline && now > at(this.registrationDeadline, '23:59')) return 'registration_closed';
  return 'registration_open';
});

eventSchema.virtual('canRegister').get(function canRegister() {
  return this.liveStatus === 'registration_open' && this.seatsLeft > 0;
});

eventSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Event', eventSchema);

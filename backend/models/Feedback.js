const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: [true, 'Choose a rating'], min: [1, 'Rating must be 1 to 5'], max: [5, 'Rating must be 1 to 5'] },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

feedbackSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);

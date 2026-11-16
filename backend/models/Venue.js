const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Venue name is required'], trim: true, maxlength: 100 },
    address: { type: String, trim: true, default: '' },
    city: { type: String, required: [true, 'City is required'], trim: true },
    capacity: { type: Number, min: 1, default: 100 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Venue', venueSchema);

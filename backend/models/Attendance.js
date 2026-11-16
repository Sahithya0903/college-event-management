const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, unique: true },
    status: { type: String, enum: ['present', 'absent'], default: 'present' },
    markedAt: { type: Date, default: Date.now },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

attendanceSchema.index({ eventId: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);

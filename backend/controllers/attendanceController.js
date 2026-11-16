const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const { HttpError, asyncHandler } = require('../middleware/error');

async function assertStaffOnEvent(eventId, user) {
  const event = await Event.findById(eventId);
  if (!event) throw new HttpError(404, 'Event not found');
  if (user.role !== 'admin' && String(event.organizerId) !== String(user._id)) {
    throw new HttpError(403, 'You can only manage attendance for your own events');
  }
  return event;
}

exports.mark = asyncHandler(async (req, res) => {
  const { registrationId, status = 'present' } = req.body;
  const reg = await Registration.findById(registrationId);
  if (!reg) throw new HttpError(404, 'Registration not found');
  const event = await assertStaffOnEvent(reg.eventId, req.user);
  if (!['confirmed', 'attended', 'no_show'].includes(reg.status)) {
    throw new HttpError(409, 'Only confirmed registrations can have attendance marked');
  }
  if (!['present', 'absent'].includes(status)) throw new HttpError(400, 'Status must be present or absent');

  const attendance = await Attendance.findOneAndUpdate(
    { registrationId: reg._id },
    { eventId: event._id, userId: reg.userId, status, markedAt: new Date(), markedBy: req.user._id },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  reg.status = status === 'present' ? 'attended' : 'no_show';
  await reg.save();
  if (status === 'present' && (event.status === 'completed' || event.liveStatus === 'completed')) {
    await Event.updateOne({ _id: event._id }, { $unset: { certificatesIssuedAt: 1 } });
  }
  res.json({ success: true, attendance, registration: reg });
});

exports.forEvent = asyncHandler(async (req, res) => {
  const event = await assertStaffOnEvent(req.params.eventId, req.user);
  const [registrations, records] = await Promise.all([
    Registration.find({ eventId: event._id, status: { $in: ['confirmed', 'attended', 'no_show'] } })
      .sort('fullName')
      .populate('userId', 'name email organization'),
    Attendance.find({ eventId: event._id }),
  ]);
  const byReg = new Map(records.map((r) => [String(r.registrationId), r]));
  const roster = registrations.map((r) => ({
    registrationId: r._id,
    name: r.userId?.name || r.fullName,
    status: r.status,
    attendance: byReg.get(String(r._id))?.status || null,
    markedAt: byReg.get(String(r._id))?.markedAt || null,
  }));
  const present = roster.filter((r) => r.attendance === 'present').length;
  res.json({ success: true, roster, stats: { total: roster.length, present, absent: roster.length - present } });
});

exports.update = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) throw new HttpError(404, 'Attendance record not found');
  const event = await assertStaffOnEvent(attendance.eventId, req.user);
  const { status } = req.body;
  if (!['present', 'absent'].includes(status)) throw new HttpError(400, 'Status must be present or absent');
  attendance.status = status;
  attendance.markedAt = new Date();
  attendance.markedBy = req.user._id;
  await attendance.save();
  await Registration.updateOne({ _id: attendance.registrationId }, { status: status === 'present' ? 'attended' : 'no_show' });
  if (status === 'present' && (event.status === 'completed' || event.liveStatus === 'completed')) {
    await Event.updateOne({ _id: event._id }, { $unset: { certificatesIssuedAt: 1 } });
  }
  res.json({ success: true, attendance });
});

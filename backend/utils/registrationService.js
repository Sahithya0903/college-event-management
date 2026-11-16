const Event = require('../models/Event');
const Payment = require('../models/Payment');

// Registrations in these states occupy a seat.
const SEAT_STATUSES = ['pending', 'confirmed', 'attended', 'no_show'];

/**
 * Moves a registration to cancelled/rejected, frees the seat and refunds a paid fee.
 */
async function releaseRegistration(reg, newStatus) {
  const holdsSeat = SEAT_STATUSES.includes(reg.status);
  reg.status = newStatus;
  if (reg.paymentStatus === 'paid') {
    await Payment.updateMany({ registrationId: reg._id, status: 'successful' }, { status: 'refunded' });
    reg.paymentStatus = 'refunded';
  } else if (reg.paymentStatus === 'submitted') {
    await Payment.updateMany({ registrationId: reg._id, status: 'submitted' }, { status: 'failed' });
    reg.paymentStatus = 'failed';
  }
  await reg.save();
  if (holdsSeat) await Event.updateOne({ _id: reg.eventId, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
  return reg;
}

module.exports = { SEAT_STATUSES, releaseRegistration };

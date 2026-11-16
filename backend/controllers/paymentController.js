const crypto = require('crypto');
const mongoose = require('mongoose');
const Registration = require('../models/Registration');
const Payment = require('../models/Payment');
const { HttpError, asyncHandler } = require('../middleware/error');
const { notify } = require('../utils/notify');
const { PAYMENT_PROOF_DIR, removePaymentProof } = require('../middleware/uploadMiddleware');
const path = require('path');

const isId = (v) => mongoose.isValidObjectId(v);

// Participant submits a payment screenshot; the event organizer confirms the transfer manually.
exports.submitProof = asyncHandler(async (req, res) => {
  const { registrationId } = req.body;
  if (!req.file) throw new HttpError(400, 'Choose a screenshot of your payment');
  let createdPayment = null;
  let registrationSaved = false;
  try {
    if (!isId(registrationId)) throw new HttpError(400, 'Choose a valid registration');
    const reg = await Registration.findById(registrationId).populate({ path: 'eventId', select: '+paymentQr' });
    if (!reg) throw new HttpError(404, 'Registration not found');
    if (String(reg.userId) !== String(req.user._id)) throw new HttpError(403, 'This is not your registration');
    if (!reg.eventId || !reg.eventId.paymentQr) throw new HttpError(409, 'The organizer has not added a payment QR code for this event');
    if (reg.eventId.fee <= 0) throw new HttpError(409, 'This event does not require payment');
    if (reg.paymentStatus === 'paid') throw new HttpError(409, 'This registration is already paid');
    if (!['pending', 'failed'].includes(reg.paymentStatus) || !['pending', 'confirmed'].includes(reg.status)) {
      throw new HttpError(409, 'Your payment proof is already waiting for the organizer to review');
    }

    const transactionId = `PAY-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    createdPayment = await Payment.create({
      registrationId: reg._id,
      userId: req.user._id,
      eventId: reg.eventId._id,
      amount: reg.eventId.fee,
      currency: 'INR',
      paymentMethod: 'upi_qr',
      transactionId,
      providerReference: typeof req.body.providerReference === 'string' ? req.body.providerReference.trim().slice(0, 100) : '',
      proofFile: req.file.filename,
      status: 'submitted',
    });

    reg.paymentStatus = 'submitted';
    await reg.save();
    registrationSaved = true;
    await notify(reg.eventId.organizerId, {
      title: 'Payment proof submitted',
      message: `${req.user.name} submitted payment proof for "${reg.eventId.title}". Review it in your Participants dashboard.`,
      type: 'payment',
      eventId: reg.eventId._id,
      link: '/dashboard.html',
    });
    res.status(201).json({ success: true, payment: { _id: createdPayment._id, status: createdPayment.status }, registration: reg });
  } catch (err) {
    if (!registrationSaved) {
      if (createdPayment) await Payment.deleteOne({ _id: createdPayment._id }).catch(() => {});
      removePaymentProof(req.file.filename);
    }
    if (err && err.code === 11000) throw new HttpError(409, 'Your payment proof is already waiting for the organizer to review');
    throw err;
  }
});

// Only the organizer of the event (or an admin) can approve or reject a submitted proof.
exports.review = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Payment not found');
  const payment = await Payment.findById(req.params.id).populate('eventId', 'title organizerId');
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (req.user.role !== 'admin' && String(payment.eventId.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'Only the event organizer can review this payment');
  }
  if (payment.status !== 'submitted') throw new HttpError(409, 'This payment proof has already been reviewed');
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) throw new HttpError(400, 'Choose approve or reject');

  const reg = await Registration.findById(payment.registrationId);
  if (!reg || ['cancelled', 'rejected'].includes(reg.status)) throw new HttpError(409, 'This registration is no longer active');
  payment.status = decision === 'approve' ? 'successful' : 'failed';
  payment.reviewedBy = req.user._id;
  payment.reviewedAt = new Date();
  await payment.save();

  if (decision === 'approve') {
    reg.paymentStatus = 'paid';
    reg.status = 'confirmed';
  } else {
    reg.paymentStatus = 'failed';
  }
  await reg.save();
  await notify(reg.userId, {
    title: decision === 'approve' ? 'Payment approved' : 'Payment proof needs correction',
    message: decision === 'approve'
      ? `Your payment of ₹${payment.amount} for "${payment.eventId.title}" was approved. Your seat is confirmed.`
      : `Your payment proof for "${payment.eventId.title}" was not approved. Please check it and submit a new screenshot.`,
    type: 'payment',
    eventId: payment.eventId._id,
    link: `/registration.html?id=${reg._id}`,
  });
  res.json({ success: true, payment: { _id: payment._id, status: payment.status }, registration: reg });
});

// Payment proof images are private; only the participant and event staff can view them.
exports.getProof = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Payment proof not found');
  const payment = await Payment.findById(req.params.id).select('+proofFile').populate('eventId', 'organizerId');
  if (!payment || !payment.proofFile) throw new HttpError(404, 'Payment proof not found');
  const isOwner = String(payment.userId) === String(req.user._id);
  const isStaff = req.user.role === 'admin' || String(payment.eventId.organizerId) === String(req.user._id);
  if (!isOwner && !isStaff) throw new HttpError(403, 'You do not have access to this payment proof');
  res.sendFile(path.join(PAYMENT_PROOF_DIR, path.basename(payment.proofFile)));
});

exports.getOne = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Payment not found');
  const payment = await Payment.findById(req.params.id).populate('eventId', 'title organizerId');
  if (!payment) throw new HttpError(404, 'Payment not found');
  const isOwner = String(payment.userId) === String(req.user._id);
  const isStaff = req.user.role === 'admin' || String(payment.eventId.organizerId) === String(req.user._id);
  if (!isOwner && !isStaff) throw new HttpError(403, 'You do not have access to this payment');
  res.json({ success: true, payment });
});

exports.myPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ userId: req.user._id }).sort('-createdAt').populate('eventId', 'title');
  res.json({ success: true, payments });
});

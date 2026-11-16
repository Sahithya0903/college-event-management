const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const { HttpError, asyncHandler } = require('../middleware/error');
const { certificateId: genCertId } = require('../utils/generateId');
const generateCertificatePdf = require('../utils/certificateGenerator');
const { notify } = require('../utils/notify');
const { removeUploadedFile } = require('../middleware/uploadMiddleware');

const CERT_DIR = path.join(__dirname, '..', 'certificates');
const CERTIFICATE_TEMPLATE_VERSION = 2;
fs.mkdirSync(CERT_DIR, { recursive: true });

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function issueOne(event, reg, options = {}) {
  let cert = await Certificate.findOne({ eventId: event._id, userId: reg.userId });

  // Certificates use the name on the participant's signed-in account, not free-form form text.
  const participant = await User.findById(reg.userId).select('name organization');
  const recipientName = participant?.name || reg.fullName;
  const recipientOrganization = participant?.organization || reg.organization || '';

  const certificateId = cert?.certificateId || genCertId();
  const fileName = `${certificateId}.pdf`;
  const outPath = path.join(CERT_DIR, fileName);
  const awardPlace = options.awardPlace === undefined ? (cert?.awardPlace || '') : options.awardPlace;
  const changed = !cert || cert.awardPlace !== awardPlace || cert.certificateTemplateVersion !== CERTIFICATE_TEMPLATE_VERSION || options.force === true || !fs.existsSync(outPath);
  if (!changed) return cert;

  await generateCertificatePdf(
    {
      certificateId,
      name: recipientName,
      organization: recipientOrganization,
      eventTitle: event.title,
      eventDate: fmtDate(event.startDate),
      organizer: event.organizerName || 'Evently',
      layout: event.certificateLayout || 'classic',
      accent: event.certificateAccent || '#3D3BF3',
      title: awardPlace ? 'Certificate of Achievement' : (event.certificateTitle || 'Certificate of Participation'),
      message: event.certificateMessage || 'for successfully participating in',
      awardPlace,
      backgroundPath: (awardPlace ? event.rankingCertificateBackground : event.certificateBackground)
        ? path.join(__dirname, '..', 'uploads', 'events', path.basename(awardPlace ? event.rankingCertificateBackground : event.certificateBackground))
        : null,
    },
    outPath
  );

  try {
    if (cert) {
      cert.registrationId = reg._id;
      cert.recipientName = recipientName;
      cert.recipientOrganization = recipientOrganization;
      cert.certificateUrl = `/certificates/${fileName}`;
      cert.awardPlace = awardPlace;
      cert.certificateTemplateVersion = CERTIFICATE_TEMPLATE_VERSION;
      cert.issuedAt = new Date();
      await cert.save();
    } else {
      cert = await Certificate.create({
        eventId: event._id,
        userId: reg.userId,
        registrationId: reg._id,
        certificateId,
        recipientName,
        recipientOrganization,
        certificateUrl: `/certificates/${fileName}`,
        awardPlace,
        certificateTemplateVersion: CERTIFICATE_TEMPLATE_VERSION,
      });
    }
  } catch (err) {
    // The unique event/user index prevents duplicate certificates if the timer and dashboard
    // request happen at nearly the same time.
    await fs.promises.unlink(outPath).catch(() => {});
    if (err && err.code === 11000) {
      const existing = await Certificate.findOne({ eventId: event._id, userId: reg.userId });
      if (existing) return existing;
    }
    throw err;
  }

  await notify(reg.userId, {
    title: awardPlace ? `${awardPlace} certificate available` : 'Certificate available',
    message: awardPlace
      ? `You were awarded ${awardPlace} in "${event.title}". Your certificate is ready to download.`
      : `Your certificate for "${event.title}" is ready to download.`,
    type: 'certificate',
    eventId: event._id,
    link: `/my-events.html`,
  });
  return cert;
}

let automaticIssueRunning = false;

// Background issuance runs periodically and also catches up after a server restart.
exports.issueFinishedEvents = async () => {
  if (automaticIssueRunning) return;
  automaticIssueRunning = true;
  try {
    const now = new Date();
    const candidates = await Event.find({
      endDate: { $lte: now },
      status: { $nin: ['draft', 'cancelled'] },
      autoIssueCertificates: true,
    }).select('+rankingCertificateBackground +rankings');
    for (const event of candidates) {
      if (event.endsAt > now) continue;
      const attendees = Registration.find({ eventId: event._id, status: 'attended' })
        .select('_id userId fullName')
        .cursor();
      let issuedCount = 0;
      for await (const reg of attendees) {
        await issueOne(event, reg);
        issuedCount += 1;
      }
      // Keep checking for attendance recorded after this event's first certificate run.
      // issueOne is idempotent and still refreshes certificates made with an old template.
      if (issuedCount && !event.certificatesIssuedAt) {
        event.certificatesIssuedAt = now;
        await event.save();
      }
    }
  } finally {
    automaticIssueRunning = false;
  }
};

// Staff: issue certificates to everyone marked present for a finished event.
exports.issueForEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.eventId).select('+rankingCertificateBackground +rankings');
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only issue certificates for your own events');
  }
  if (event.liveStatus !== 'completed' && event.status !== 'completed') {
    throw new HttpError(409, 'Certificates can be issued once the event has finished');
  }
  const eligible = await Registration.find({ eventId: event._id, status: 'attended' });
  if (!eligible.length) throw new HttpError(409, 'No attendees marked present yet');

  const certificates = [];
  for (const reg of eligible) certificates.push(await issueOne(event, reg));
  event.certificatesIssuedAt = new Date();
  await event.save();
  res.json({ success: true, count: certificates.length, certificates });
});

// Organizer confirms the three winning participant accounts and uploads their certificate layout.
exports.confirmRankings = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.eventId)) throw new HttpError(404, 'Event not found');
  const event = await Event.findById(req.params.eventId).select('+rankingCertificateBackground +rankings');
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only confirm results for your own events');
  }
  if (!event.isCompetition) throw new HttpError(409, 'This event is not marked as a competition');
  if (event.liveStatus !== 'completed' && event.status !== 'completed') {
    throw new HttpError(409, 'Confirm competition results after the event has finished');
  }

  const places = [
    ['First Place', req.body.first],
    ['Second Place', req.body.second],
    ['Third Place', req.body.third],
  ];
  const registrationIds = places.map(([, id]) => id);
  if (registrationIds.some((id) => !mongoose.isValidObjectId(id)) || new Set(registrationIds).size !== 3) {
    throw new HttpError(400, 'Choose three different participants for first, second, and third place');
  }
  const registrations = await Registration.find({
    _id: { $in: registrationIds },
    eventId: event._id,
    status: { $in: ['confirmed', 'attended'] },
  });
  if (registrations.length !== 3) throw new HttpError(400, 'Each winner must be a confirmed participant in this event');
  const byId = new Map(registrations.map((reg) => [String(reg._id), reg]));
  const rankingCertificateBackground = req.file ? `/uploads/events/${req.file.filename}` : event.rankingCertificateBackground;
  if (!rankingCertificateBackground) {
    if (req.file) removeUploadedFile(`/uploads/events/${req.file.filename}`);
    throw new HttpError(400, 'Upload a certificate layout for the winners');
  }

  const oldBackground = event.rankingCertificateBackground;
  const previousAwards = await Certificate.find({ eventId: event._id, awardPlace: { $ne: '' } });
  event.rankingCertificateBackground = rankingCertificateBackground;
  event.rankings = places.map(([place, registrationId]) => ({
    place,
    registrationId,
    userId: byId.get(String(registrationId)).userId,
  }));
  event.rankingsConfirmed = true;
  let eventSaved = false;
  try {
    await event.save();
    eventSaved = true;
    const currentUsers = new Set(registrations.map((reg) => String(reg.userId)));
    for (const previous of previousAwards) {
      if (currentUsers.has(String(previous.userId))) continue;
      const reg = await Registration.findById(previous.registrationId);
      if (reg?.status === 'attended') await issueOne(event, reg, { awardPlace: '' });
      else {
        await Certificate.deleteOne({ _id: previous._id });
        await fs.promises.unlink(path.join(CERT_DIR, path.basename(previous.certificateUrl || ''))).catch(() => {});
      }
    }
    const issued = [];
    for (const [place, registrationId] of places) {
      issued.push(await issueOne(event, byId.get(String(registrationId)), { awardPlace: place, force: true }));
    }
    if (oldBackground && oldBackground !== rankingCertificateBackground) removeUploadedFile(oldBackground);
    res.json({ success: true, rankingsConfirmed: true, count: issued.length, certificates: issued });
  } catch (err) {
    if (req.file && !eventSaved) removeUploadedFile(rankingCertificateBackground);
    throw err;
  }
});

// A participant can self-issue once attendance is on record.
exports.issueMine = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.eventId).select('+rankingCertificateBackground +rankings');
  if (!event) throw new HttpError(404, 'Event not found');
  const reg = await Registration.findOne({ eventId: event._id, userId: req.user._id });
  if (!reg || reg.status !== 'attended') throw new HttpError(409, 'A certificate is available once your attendance is marked present');
  if (event.liveStatus !== 'completed' && event.status !== 'completed') {
    throw new HttpError(409, 'Your participation certificate will be available after the event has finished');
  }
  const certificate = await issueOne(event, reg);
  res.status(201).json({ success: true, certificate });
});

exports.myCertificates = asyncHandler(async (req, res) => {
  const certificates = await Certificate.find({ userId: req.user._id }).sort('-issuedAt').populate('eventId', 'title startDate');
  res.json({ success: true, certificates });
});

exports.forEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.eventId);
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only view certificates for your own events');
  }
  const certificates = await Certificate.find({ eventId: event._id }).sort('recipientName');
  res.json({ success: true, certificates });
});

// Public: verify a certificate by ID, no login required.
exports.verify = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findOne({ certificateId: req.params.certificateId }).populate('eventId', 'title startDate organizerName');
  if (!certificate) throw new HttpError(404, 'No certificate found with this ID');
  res.json({
    success: true,
    valid: true,
    certificateId: certificate.certificateId,
    recipientName: certificate.recipientName,
    recipientOrganization: certificate.recipientOrganization,
    awardPlace: certificate.awardPlace,
    eventTitle: certificate.eventId.title,
    eventDate: certificate.eventId.startDate,
    issuedAt: certificate.issuedAt,
  });
});

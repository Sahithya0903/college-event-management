const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { HttpError } = require('./error');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'events');
const PAYMENT_PROOF_DIR = path.join(__dirname, '..', 'private', 'payment-proofs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PAYMENT_PROOF_DIR, { recursive: true });

// Extension comes from the verified MIME type, never from the user's filename.
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const filters = (req, file, cb) =>
  EXT[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Upload a JPG, PNG or WebP image'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 3 },
  fileFilter: filters,
});

exports.uploadEventImage = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'certificateBackground', maxCount: 1 },
  { name: 'paymentQr', maxCount: 1 },
]);

exports.uploadRankingCertificate = upload.single('rankingCertificateBackground');

const paymentProofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PAYMENT_PROOF_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: filters,
});

exports.uploadPaymentProof = paymentProofUpload.single('proof');
exports.PAYMENT_PROOF_DIR = PAYMENT_PROOF_DIR;
exports.removePaymentProof = (fileName) => {
  if (!fileName || path.basename(fileName) !== fileName) return;
  fs.unlink(path.join(PAYMENT_PROOF_DIR, fileName), () => {});
};
exports.UPLOAD_DIR = UPLOAD_DIR;

exports.removeUploadedFile = (publicPath) => {
  if (!publicPath || !publicPath.startsWith('/uploads/events/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(publicPath));
  fs.unlink(file, () => {});
};

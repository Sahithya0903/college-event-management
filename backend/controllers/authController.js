const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError, asyncHandler } = require('../middleware/error');

const sign = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const str = (v) => (typeof v === 'string' ? v.trim() : '');

exports.register = asyncHandler(async (req, res) => {
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const allowOrganizer = process.env.ALLOW_ORGANIZER_SIGNUP !== 'false';
  const role = req.body.role === 'organizer' && allowOrganizer ? 'organizer' : 'user';
  const organization = str(req.body.organization);
  if (!name) throw new HttpError(400, 'Enter your name');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (role === 'user' && !organization) throw new HttpError(400, 'Enter your college or organization');
  if (organization.length > 160) throw new HttpError(400, 'College or organization must be 160 characters or less');

  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');

  // Only "user" and (optionally) "organizer" can be chosen at sign-up. Admins are created by seed or by another admin.
  const user = await User.create({
    name,
    email,
    password,
    phone: str(req.body.phone),
    organization,
    role,
  });
  res.status(201).json({ success: true, token: sign(user), user });
});

exports.login = asyncHandler(async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new HttpError(401, 'Email or password is incorrect');
  if (user.status === 'blocked') throw new HttpError(403, 'Your account is blocked. Contact the administrator');

  res.json({ success: true, token: sign(user), user });
});

exports.me = (req, res) => res.json({ success: true, user: req.user });

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, phone, organization } = req.body;
  if (name !== undefined) {
    if (!str(name)) throw new HttpError(400, 'Name cannot be empty');
    req.user.name = str(name);
  }
  if (phone !== undefined) req.user.phone = str(phone);
  if (organization !== undefined) {
    const value = str(organization);
    if (req.user.role === 'user' && !value) throw new HttpError(400, 'Enter your college or organization');
    if (value.length > 160) throw new HttpError(400, 'College or organization must be 160 characters or less');
    req.user.organization = value;
  }
  await req.user.save();
  res.json({ success: true, user: req.user });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(String(currentPassword || '')))) throw new HttpError(400, 'Current password is incorrect');
  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
});

// JWTs are stateless: the client deletes its token. This endpoint exists for a clean API and future token blacklisting.
exports.logout = (req, res) => res.json({ success: true, message: 'Logged out' });

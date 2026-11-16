const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError, asyncHandler } = require('./error');

const getToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const loadUser = async (token) => {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return User.findById(payload.id);
};

// Requires a valid login.
exports.protect = asyncHandler(async (req, res, next) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Log in to continue');
  let user;
  try {
    user = await loadUser(token);
  } catch {
    throw new HttpError(401, 'Your session has expired. Log in again');
  }
  if (!user) throw new HttpError(401, 'This account no longer exists');
  if (user.status === 'blocked') throw new HttpError(403, 'Your account is blocked. Contact the administrator');
  req.user = user;
  next();
});

// Attaches req.user when a valid token is present, but never fails.
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  const token = getToken(req);
  if (token) {
    try {
      const user = await loadUser(token);
      if (user && user.status === 'active') req.user = user;
    } catch {
      /* ignore invalid token */
    }
  }
  next();
});

// Role guard, e.g. requireRole('admin', 'organizer')
exports.requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));

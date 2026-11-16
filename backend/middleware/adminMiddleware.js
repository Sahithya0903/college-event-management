const { requireRole } = require('./authMiddleware');

exports.adminOnly = requireRole('admin');
exports.staffOnly = requireRole('admin', 'organizer');

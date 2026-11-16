const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

// Mounted at /api/users - admin-only directory, distinct from /api/auth/me (self-service).
router.get('/', protect, adminOnly, ctrl.listUsers);
router.put('/:id', protect, adminOnly, ctrl.updateUser);
router.delete('/:id', protect, adminOnly, ctrl.deleteUser);

module.exports = router;

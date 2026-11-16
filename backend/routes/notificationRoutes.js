const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, ctrl.list);
router.put('/read-all', protect, ctrl.markAllRead);
router.put('/:id/read', protect, ctrl.markRead);
router.delete('/:id', protect, ctrl.remove);

module.exports = router;

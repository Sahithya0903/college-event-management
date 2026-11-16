const router = require('express').Router();
const ctrl = require('../controllers/eventController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');
const { uploadEventImage } = require('../middleware/uploadMiddleware');

router.get('/', optionalAuth, ctrl.list);
router.get('/mine', protect, staffOnly, ctrl.mine);
router.get('/:id', optionalAuth, ctrl.getOne);
router.post('/', protect, staffOnly, uploadEventImage, ctrl.create);
router.put('/:id', protect, staffOnly, uploadEventImage, ctrl.update);
router.put('/:id/status', protect, staffOnly, ctrl.setStatus);
router.delete('/:id', protect, staffOnly, ctrl.remove);

module.exports = router;

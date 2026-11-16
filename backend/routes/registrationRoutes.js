const router = require('express').Router();
const ctrl = require('../controllers/registrationController');
const { protect } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');

router.post('/', protect, ctrl.create);
router.get('/my', protect, ctrl.myRegistrations);
router.get('/event/:eventId', protect, staffOnly, ctrl.forEvent);
router.get('/event/:eventId/export', protect, staffOnly, ctrl.exportEvent);
router.get('/:id', protect, ctrl.getOne);
router.put('/:id/cancel', protect, ctrl.cancel);
router.put('/:id/status', protect, staffOnly, ctrl.setStatus);

module.exports = router;

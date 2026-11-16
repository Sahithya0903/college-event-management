const router = require('express').Router();
const ctrl = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');

router.post('/', protect, staffOnly, ctrl.mark);
router.get('/event/:eventId', protect, staffOnly, ctrl.forEvent);
router.put('/:id', protect, staffOnly, ctrl.update);

module.exports = router;

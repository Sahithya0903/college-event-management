const router = require('express').Router();
const ctrl = require('../controllers/feedbackController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, ctrl.create);
router.get('/event/:eventId/manage', protect, ctrl.forOrganizerEvent);
router.get('/event/:eventId', ctrl.forEvent);

module.exports = router;

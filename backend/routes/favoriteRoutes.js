const router = require('express').Router();
const ctrl = require('../controllers/favoriteController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, ctrl.list);
router.post('/:eventId', protect, ctrl.add);
router.delete('/:eventId', protect, ctrl.remove);

module.exports = router;

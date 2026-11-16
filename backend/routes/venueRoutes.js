const router = require('express').Router();
const ctrl = require('../controllers/venueController');
const { protect } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');

router.get('/', ctrl.list);
router.post('/', protect, staffOnly, ctrl.create);
router.put('/:id', protect, staffOnly, ctrl.update);
router.delete('/:id', protect, staffOnly, ctrl.remove);

module.exports = router;

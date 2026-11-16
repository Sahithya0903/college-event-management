const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

router.use(protect, adminOnly);
router.get('/dashboard', ctrl.dashboard);
router.get('/analytics', ctrl.analytics);
router.get('/registrations', ctrl.listRegistrations);
router.get('/registrations/export', ctrl.exportRegistrations);
router.get('/payments', ctrl.listPayments);
router.get('/payments/export', ctrl.exportPayments);

module.exports = router;

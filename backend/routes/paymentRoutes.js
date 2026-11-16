const router = require('express').Router();
const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');
const { uploadPaymentProof } = require('../middleware/uploadMiddleware');

router.post('/submit-proof', protect, uploadPaymentProof, ctrl.submitProof);
router.get('/my', protect, ctrl.myPayments);
router.get('/:id/proof', protect, ctrl.getProof);
router.put('/:id/review', protect, staffOnly, ctrl.review);
router.get('/:id', protect, ctrl.getOne);

module.exports = router;

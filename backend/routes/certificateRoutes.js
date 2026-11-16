const router = require('express').Router();
const ctrl = require('../controllers/certificateController');
const { protect } = require('../middleware/authMiddleware');
const { staffOnly } = require('../middleware/adminMiddleware');
const { uploadRankingCertificate } = require('../middleware/uploadMiddleware');

router.get('/verify/:certificateId', ctrl.verify);
router.get('/my', protect, ctrl.myCertificates);
router.post('/event/:eventId/issue', protect, staffOnly, ctrl.issueForEvent);
router.post('/event/:eventId/rankings', protect, staffOnly, uploadRankingCertificate, ctrl.confirmRankings);
router.post('/event/:eventId/mine', protect, ctrl.issueMine);
router.get('/event/:eventId', protect, staffOnly, ctrl.forEvent);

module.exports = router;

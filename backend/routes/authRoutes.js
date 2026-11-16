const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', protect, ctrl.me);
router.put('/me', protect, ctrl.updateMe);
router.put('/me/password', protect, ctrl.changePassword);

module.exports = router;

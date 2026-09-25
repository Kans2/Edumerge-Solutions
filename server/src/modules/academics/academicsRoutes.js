const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const { CAPABILITIES: C } = require('../../config/constants');
const c = require('./academicsController');

router.use(authenticate);
const admin = requireCapability(C.ADMIN_MANAGE);

router.get('/departments', c.listDepartments);
router.post('/departments', admin, c.createDepartment);
router.patch('/departments/:id', admin, c.updateDepartment);

router.get('/programmes', c.listProgrammes);
router.post('/programmes', admin, c.createProgramme);

router.get('/batches', c.listBatches);
router.post('/batches', admin, c.createBatch);

router.get('/sections', c.listSections);
router.post('/sections', admin, c.createSection);
router.get('/sections/:id/students', c.sectionStudents);

router.get('/subjects', c.listSubjects);
router.post('/subjects', admin, c.createSubject);

router.get('/terms', c.listTerms);
router.get('/terms/current', c.currentTerm);
router.post('/terms', admin, c.createTerm);
router.patch('/terms/:id', admin, c.updateTerm);

router.get('/holidays', c.listHolidays);
router.post('/holidays', admin, c.createHoliday);
router.delete('/holidays/:id', admin, c.deleteHoliday);

router.get('/offerings', c.listOfferings);
router.post('/offerings', admin, c.createOffering);
router.patch('/offerings/:id', requireCapability(C.SESSION_MANAGE, C.ADMIN_MANAGE), c.updateOffering);

module.exports = router;

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const ApiError = require('../../utils/ApiError');
const {
  Department, Programme, Batch, Section, Subject, AcademicTerm, Holiday, CourseOffering, User,
} = require('../../models');
const { ROLES } = require('../../config/constants');
const termService = require('./termService');

/* ---- Departments ---- */
exports.listDepartments = asyncHandler(async (req, res) =>
  ok(res, await Department.find({ isActive: true }).populate('hodUserId', 'name email').sort({ name: 1 }).lean()));
exports.createDepartment = asyncHandler(async (req, res) => created(res, await Department.create(req.body)));
exports.updateDepartment = asyncHandler(async (req, res) => {
  const d = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!d) throw ApiError.notFound('Department not found');
  return ok(res, d);
});

/* ---- Programmes ---- */
exports.listProgrammes = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  return ok(res, await Programme.find(filter).sort({ name: 1 }).lean());
});
exports.createProgramme = asyncHandler(async (req, res) => created(res, await Programme.create(req.body)));

/* ---- Batches ---- */
exports.listBatches = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.programmeId) filter.programmeId = req.query.programmeId;
  return ok(res, await Batch.find(filter).sort({ admissionYear: -1 }).lean());
});
exports.createBatch = asyncHandler(async (req, res) => created(res, await Batch.create(req.body)));

/* ---- Sections ---- */
exports.listSections = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.batchId) filter.batchId = req.query.batchId;
  if (req.query.semester) filter.currentSemester = Number(req.query.semester);

  // Scope non-privileged staff to what they actually teach or advise
  if (req.user.role === ROLES.FACULTY) {
    const offerings = await CourseOffering.find({ facultyId: req.user._id, isActive: true }).distinct('sectionId');
    const advisor = req.user.staff?.advisorOfSectionIds || [];
    filter._id = { $in: [...offerings, ...advisor] };
  } else if (req.user.role === ROLES.HOD || req.user.role === ROLES.CLASS_ADVISOR) {
    filter.departmentId = filter.departmentId || req.user.departmentId;
  }

  const sections = await Section.find(filter)
    .populate('classAdvisorId', 'name email')
    .sort({ code: 1 }).lean();
  return ok(res, sections);
});
exports.createSection = asyncHandler(async (req, res) => created(res, await Section.create(req.body)));
exports.sectionStudents = asyncHandler(async (req, res) => {
  const students = await User.find({
    role: ROLES.STUDENT, 'student.sectionId': req.params.id, status: 'ACTIVE',
  })
    .select('code name email student')
    .sort({ 'student.rollNumber': 1, name: 1 })
    .lean();
  return ok(res, students);
});

/* ---- Subjects ---- */
exports.listSubjects = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.semester) filter.semester = Number(req.query.semester);
  return ok(res, await Subject.find(filter).sort({ semester: 1, code: 1 }).lean());
});
exports.createSubject = asyncHandler(async (req, res) => created(res, await Subject.create(req.body)));

/* ---- Terms ---- */
exports.listTerms = asyncHandler(async (req, res) =>
  ok(res, await AcademicTerm.find({ isActive: true }).sort({ startDate: -1 }).lean()));
exports.currentTerm = asyncHandler(async (req, res) => ok(res, await termService.getCurrentTerm()));
exports.createTerm = asyncHandler(async (req, res) => {
  if (req.body.isCurrent) await AcademicTerm.updateMany({}, { $set: { isCurrent: false } });
  const term = await AcademicTerm.create(req.body);
  termService.invalidate();
  return created(res, term);
});
exports.updateTerm = asyncHandler(async (req, res) => {
  if (req.body.isCurrent) await AcademicTerm.updateMany({}, { $set: { isCurrent: false } });
  const term = await AcademicTerm.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!term) throw ApiError.notFound('Term not found');
  termService.invalidate();
  return ok(res, term);
});

/* ---- Holidays ---- */
exports.listHolidays = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.termId) filter.termId = req.query.termId;
  return ok(res, await Holiday.find(filter).sort({ date: 1 }).lean());
});
exports.createHoliday = asyncHandler(async (req, res) => {
  const h = await Holiday.create(req.body);
  termService.invalidate();
  return created(res, h);
});
exports.deleteHoliday = asyncHandler(async (req, res) => {
  await Holiday.findByIdAndDelete(req.params.id);
  termService.invalidate();
  return ok(res, { deleted: true });
});

/* ---- Course offerings ---- */
exports.listOfferings = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  const term = req.query.termId || (await termService.getCurrentTerm())?._id;
  if (term) filter.termId = term;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.facultyId) filter.facultyId = req.query.facultyId === 'me' ? req.user._id : req.query.facultyId;
  if (req.user.role === ROLES.FACULTY && !req.query.sectionId) filter.facultyId = req.user._id;

  return ok(res, await CourseOffering.find(filter).sort({ subjectCode: 1 }).lean());
});

exports.createOffering = asyncHandler(async (req, res) => {
  const [subject, section, faculty] = await Promise.all([
    Subject.findById(req.body.subjectId).lean(),
    Section.findById(req.body.sectionId).lean(),
    User.findById(req.body.facultyId).lean(),
  ]);
  if (!subject || !section || !faculty) throw ApiError.badRequest('Subject, section or faculty not found');

  const offering = await CourseOffering.create({
    ...req.body,
    departmentId: section.departmentId,
    subjectCode: subject.code,
    subjectName: subject.name,
    sectionCode: section.code,
    facultyName: faculty.name,
  });
  return created(res, offering);
});

exports.updateOffering = asyncHandler(async (req, res) => {
  const o = await CourseOffering.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!o) throw ApiError.notFound('Course offering not found');
  return ok(res, o);
});

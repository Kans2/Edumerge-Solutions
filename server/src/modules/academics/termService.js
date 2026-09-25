const { AcademicTerm, Holiday } = require('../../models');
const ApiError = require('../../utils/ApiError');

let cache = { current: null, byId: new Map(), holidays: new Map(), at: 0 };
const TTL = 60 * 1000;

async function getCurrentTerm() {
  if (cache.current && Date.now() - cache.at < TTL) return cache.current;
  const term = await AcademicTerm.findOne({ isCurrent: true, isActive: true }).lean();
  cache.current = term;
  cache.at = Date.now();
  return term;
}

async function getTerm(termId) {
  if (!termId) return getCurrentTerm();
  const key = String(termId);
  if (cache.byId.has(key)) return cache.byId.get(key);
  const term = await AcademicTerm.findById(termId).lean();
  if (term) cache.byId.set(key, term);
  return term;
}

async function requireCurrentTerm() {
  const term = await getCurrentTerm();
  if (!term) throw ApiError.badRequest('No active academic term has been configured.');
  return term;
}

/** Holiday lookup for a term, returned as a Set of date keys. */
async function getHolidaySet(termId, departmentId = null) {
  const key = `${termId}:${departmentId || 'ALL'}`;
  if (cache.holidays.has(key)) return cache.holidays.get(key);

  const rows = await Holiday.find({
    termId,
    isWorkingDay: false,
    $or: [{ scope: 'INSTITUTION' }, { departmentId }],
  }).lean();

  const set = new Set(rows.map((h) => h.date));
  cache.holidays.set(key, set);
  return set;
}

/** Dates explicitly declared as working days (e.g. a compensatory Saturday). */
async function getWorkingOverrides(termId) {
  const rows = await Holiday.find({ termId, isWorkingDay: true }).lean();
  return new Set(rows.map((h) => h.date));
}

function invalidate() { cache = { current: null, byId: new Map(), holidays: new Map(), at: 0 }; }

module.exports = { getCurrentTerm, getTerm, requireCurrentTerm, getHolidaySet, getWorkingOverrides, invalidate };

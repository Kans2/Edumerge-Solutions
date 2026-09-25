function parsePagination(query, { defaultLimit = 25, maxLimit = 200 } = {}) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || defaultLimit, 10), 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}
function parseSort(sortStr, fallback = { createdAt: -1 }) {
  if (!sortStr) return fallback;
  const sort = {};
  sortStr.split(',').forEach((t) => {
    const k = t.trim();
    if (!k) return;
    if (k.startsWith('-')) sort[k.slice(1)] = -1; else sort[k] = 1;
  });
  return Object.keys(sort).length ? sort : fallback;
}
const buildMeta = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) || 0 });
module.exports = { parsePagination, parseSort, buildMeta };

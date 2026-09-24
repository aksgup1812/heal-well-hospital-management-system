/* Wrap asynchronous route handlers so errors reach Express consistently. */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/* Return a readable public identifier for a new record. */
function publicId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/* Resolve either an internal numeric id or a public id/name reference. */
async function findByReference(pool, table, idColumn, publicColumn, reference, nameColumn = null) {
  if (reference === undefined || reference === null || reference === '') return null;
  const conditions = ['id = ?', `${publicColumn} = ?`];
  const values = [reference, reference];
  if (nameColumn) { conditions.push(`${nameColumn} = ?`); values.push(reference); }
  const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE ${conditions.join(' OR ')} LIMIT 1`, values);
  return rows[0] || null;
}

/* Convert a database error into a safe client response. */
function isDuplicate(error) {
  return error && error.code === 'ER_DUP_ENTRY';
}

module.exports = { asyncHandler, publicId, findByReference, isDuplicate };

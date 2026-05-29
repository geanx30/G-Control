const oracledb = require("oracledb");

let oracleClientInitialized = false;

function initOracleClientIfNeeded() {
  if (oracleClientInitialized) return;
  const libDir = process.env.MEGA_ORACLE_CLIENT_LIB_DIR;
  if (libDir) {
    oracledb.initOracleClient({ libDir });
  }
  oracleClientInitialized = true;
}

async function fetchMegaApRows(filters = {}) {
  initOracleClientIfNeeded();
  const user = process.env.MEGA_ORACLE_USER;
  const password = process.env.MEGA_ORACLE_PASSWORD;
  const connectString = process.env.MEGA_ORACLE_CONNECT_STRING;
  const baseQuery = commentDisabledMegaFilters(normalizeQuery(process.env.MEGA_AP_QUERY));
  const { query, binds } = buildFilteredQuery(baseQuery, filters);

  if (!user || !password || !connectString || !baseQuery) {
    throw new Error("Configure MEGA_ORACLE_USER, MEGA_ORACLE_PASSWORD, MEGA_ORACLE_CONNECT_STRING e MEGA_AP_QUERY no .env.");
  }

  const connection = await oracledb.getConnection({ user, password, connectString });
  try {
    const result = await connection.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows || [];
  } finally {
    await connection.close();
  }
}

module.exports = {
  fetchMegaApRows
};

function normalizeQuery(query) {
  return String(query || "").replaceAll("\\n", "\n").trim();
}

function commentDisabledMegaFilters(query) {
  return String(query || "").replace(
    /\n\s*AND\s+TRUNC\(FP\.FPA_DT_EMISSAO\)\s*>=\s*ADD_MONTHS\(TRUNC\(SYSDATE\),\s*-2\)/i,
    "\n-- AND TRUNC(FP.FPA_DT_EMISSAO) >= ADD_MONTHS(TRUNC(SYSDATE), -2)"
  );
}

function buildFilteredQuery(baseQuery, filters) {
  const binds = {};
  const clauses = [];
  const queryWithoutOrder = stripTrailingOrderBy(baseQuery);

  if (filters.nf) {
    binds.nf = String(filters.nf).trim();
    clauses.push("MEGA_Q.NOTA_FISCAL = :nf");
  }

  if (filters.codFornecedor) {
    binds.codFornecedor = String(filters.codFornecedor).trim();
    clauses.push("MEGA_Q.COD_FORNECEDOR = :codFornecedor");
  }

  if (!clauses.length) return { query: baseQuery, binds };

  return {
    query: `SELECT * FROM (${queryWithoutOrder}) MEGA_Q WHERE ${clauses.join(" AND ")}`,
    binds
  };
}

function stripTrailingOrderBy(query) {
  return String(query || "").replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trim();
}

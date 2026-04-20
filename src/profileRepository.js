const PROFILE_COLUMNS = `
  id,
  name,
  gender,
  gender_probability,
  age,
  age_group,
  country_id,
  country_name,
  country_probability,
  created_at
`;

const SUMMARY_COLUMNS = `
  id,
  name,
  gender,
  age,
  age_group,
  country_id
`;

const SORT_COLUMNS = {
  age: 'age',
  created_at: 'created_at',
  gender_probability: 'gender_probability',
};

function rowToProfile(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: row.gender_probability,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_name: row.country_name,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

function rowToSummary(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
  };
}

function buildWhereClause(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.gender) {
    clauses.push('gender = :gender');
    params.gender = String(filters.gender).toLowerCase();
  }

  if (filters.age_group) {
    clauses.push('age_group = :age_group');
    params.age_group = String(filters.age_group).toLowerCase();
  }

  if (filters.country_id) {
    clauses.push('country_id = :country_id');
    params.country_id = String(filters.country_id).toUpperCase();
  }

  if (filters.min_age !== undefined) {
    clauses.push('age >= :min_age');
    params.min_age = filters.min_age;
  }

  if (filters.max_age !== undefined) {
    clauses.push('age <= :max_age');
    params.max_age = filters.max_age;
  }

  if (filters.min_gender_probability !== undefined) {
    clauses.push('gender_probability >= :min_gender_probability');
    params.min_gender_probability = filters.min_gender_probability;
  }

  if (filters.min_country_probability !== undefined) {
    clauses.push('country_probability >= :min_country_probability');
    params.min_country_probability = filters.min_country_probability;
  }

  return {
    params,
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

function createProfileRepository(db) {
  const insertProfile = db.prepare(`
    INSERT INTO profiles (
      id,
      name,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at
    ) VALUES (
      @id,
      @name,
      @gender,
      @gender_probability,
      @age,
      @age_group,
      @country_id,
      @country_name,
      @country_probability,
      @created_at
    )
  `);

  const getByIdStmt = db.prepare(`
    SELECT ${PROFILE_COLUMNS}
    FROM profiles
    WHERE id = ?
  `);

  const getByNameStmt = db.prepare(`
    SELECT ${PROFILE_COLUMNS}
    FROM profiles
    WHERE name = ?
  `);

  const deleteByIdStmt = db.prepare(`
    DELETE FROM profiles
    WHERE id = ?
  `);

  function findMany(options = {}) {
    const { filters = {}, sortBy = 'created_at', order = 'desc', limit = 10, offset = 0 } = options;
    const { params, whereSql } = buildWhereClause(filters);
    const sortColumn = SORT_COLUMNS[sortBy] ?? SORT_COLUMNS.created_at;
    const sortDirection = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const total = db.prepare(`
      SELECT COUNT(*) AS total
      FROM profiles
      ${whereSql}
    `).get(params).total;

    const rows = db.prepare(`
      SELECT ${SUMMARY_COLUMNS}
      FROM profiles
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}, id ASC
      LIMIT :limit
      OFFSET :offset
    `).all({
      ...params,
      limit,
      offset,
    });

    return {
      total,
      data: rows.map(rowToSummary),
    };
  }

  return {
    create(profile) {
      insertProfile.run(profile);
      return rowToProfile(getByIdStmt.get(profile.id));
    },
    getById(id) {
      return rowToProfile(getByIdStmt.get(id));
    },
    getByName(name) {
      return rowToProfile(getByNameStmt.get(name));
    },
    deleteById(id) {
      return deleteByIdStmt.run(id);
    },
    findMany,
    count(filters = {}) {
      const { params, whereSql } = buildWhereClause(filters);
      return db.prepare(`
        SELECT COUNT(*) AS total
        FROM profiles
        ${whereSql}
      `).get(params).total;
    },
    rowToProfile,
    rowToSummary,
  };
}

module.exports = {
  buildWhereClause,
  createProfileRepository,
  rowToProfile,
  rowToSummary,
};

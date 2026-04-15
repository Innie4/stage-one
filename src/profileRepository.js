function rowToProfile(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: row.gender_probability,
    sample_size: row.sample_size,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

function createProfileRepository(db) {
  const insertProfile = db.prepare(`
    INSERT INTO profiles (
      id,
      name,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_probability,
      created_at
    ) VALUES (
      @id,
      @name,
      @gender,
      @gender_probability,
      @sample_size,
      @age,
      @age_group,
      @country_id,
      @country_probability,
      @created_at
    )
  `);

  const getProfileById = db.prepare(`
    SELECT
      id,
      name,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_probability,
      created_at
    FROM profiles
    WHERE id = ?
  `);

  const getProfileByName = db.prepare(`
    SELECT
      id,
      name,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_probability,
      created_at
    FROM profiles
    WHERE name = ?
  `);

  const deleteProfileById = db.prepare(`DELETE FROM profiles WHERE id = ?`);

  function listProfiles(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.gender) {
      clauses.push('LOWER(gender) = @gender');
      params.gender = String(filters.gender).toLowerCase();
    }

    if (filters.country_id) {
      clauses.push('LOWER(country_id) = @country_id');
      params.country_id = String(filters.country_id).toLowerCase();
    }

    if (filters.age_group) {
      clauses.push('LOWER(age_group) = @age_group');
      params.age_group = String(filters.age_group).toLowerCase();
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT
        id,
        name,
        gender,
        gender_probability,
        sample_size,
        age,
        age_group,
        country_id,
        country_probability,
        created_at
      FROM profiles
      ${whereClause}
      ORDER BY created_at ASC, id ASC
    `).all(params);

    return rows.map(rowToProfile);
  }

  return {
    create(profile) {
      insertProfile.run(profile);
      return rowToProfile(getProfileById.get(profile.id));
    },
    getById(id) {
      return rowToProfile(getProfileById.get(id));
    },
    getByName(name) {
      return rowToProfile(getProfileByName.get(name));
    },
    list(filters) {
      return listProfiles(filters);
    },
    deleteById(id) {
      return deleteProfileById.run(id);
    },
  };
}

module.exports = {
  createProfileRepository,
  rowToProfile,
};

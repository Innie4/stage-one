const { v7: uuidv7 } = require('uuid');
const path = require('node:path');
const { loadSeedProfiles } = require('./seedData');

function formatUtcTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function seedDatabase(db, options = {}) {
  const seedPath = options.seedPath ?? path.join(process.cwd(), 'data', 'seed_profiles.json');
  const profiles = options.profiles ?? loadSeedProfiles(seedPath);
  const now = options.now ?? (() => new Date());
  const seededAt = formatUtcTimestamp(now());

  const insert = db.prepare(`
    INSERT OR IGNORE INTO profiles (
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

  db.exec('BEGIN TRANSACTION;');

  try {
    for (const profile of profiles) {
      insert.run({
        id: uuidv7(),
        name: profile.name,
        gender: profile.gender,
        gender_probability: profile.gender_probability,
        age: profile.age,
        age_group: profile.age_group,
        country_id: profile.country_id,
        country_name: profile.country_name,
        country_probability: profile.country_probability,
        created_at: seededAt,
      });
    }

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return {
    seededAt,
    seededCount: profiles.length,
  };
}

module.exports = {
  formatUtcTimestamp,
  seedDatabase,
};

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const EXPECTED_COLUMNS = [
  'id',
  'name',
  'gender',
  'gender_probability',
  'age',
  'age_group',
  'country_id',
  'country_name',
  'country_probability',
  'created_at',
];

function ensureDirectoryForFile(filePath) {
  if (!filePath || filePath === ':memory:') {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      gender TEXT NOT NULL,
      gender_probability REAL NOT NULL,
      age INTEGER NOT NULL,
      age_group TEXT NOT NULL,
      country_id TEXT NOT NULL,
      country_name TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
    CREATE INDEX IF NOT EXISTS idx_profiles_age_group ON profiles(age_group);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_id ON profiles(country_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles(age);
    CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
    CREATE INDEX IF NOT EXISTS idx_profiles_gender_probability ON profiles(gender_probability);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_probability ON profiles(country_probability);
  `);
}

function readTableColumns(db) {
  return db.prepare('PRAGMA table_info(profiles)').all().map((row) => row.name);
}

function migrateLegacySchema(db) {
  const rows = db.prepare('SELECT * FROM profiles').all();
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

  db.exec('BEGIN TRANSACTION;');

  try {
    db.exec(`
      CREATE TABLE profiles_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        gender TEXT NOT NULL,
        gender_probability REAL NOT NULL,
        age INTEGER NOT NULL,
        age_group TEXT NOT NULL,
        country_id TEXT NOT NULL,
        country_name TEXT NOT NULL,
        country_probability REAL NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const insert = db.prepare(`
      INSERT INTO profiles_new (
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

    for (const row of rows) {
      const countryId = String(row.country_id || '').toUpperCase();
      insert.run({
        id: row.id,
        name: row.name,
        gender: row.gender,
        gender_probability: row.gender_probability,
        age: row.age,
        age_group: row.age_group,
        country_id: countryId,
        country_name: row.country_name || displayNames.of(countryId) || countryId,
        country_probability: row.country_probability,
        created_at: row.created_at,
      });
    }

    db.exec(`
      DROP TABLE profiles;
      ALTER TABLE profiles_new RENAME TO profiles;
    `);

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function openDatabase(dbPath = path.join(process.cwd(), 'data', 'intelligence.db')) {
  ensureDirectoryForFile(dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const columns = readTableColumns(db);
  if (columns.length === 0) {
    createSchema(db);
  } else if (
    columns.length !== EXPECTED_COLUMNS.length ||
    columns.some((column, index) => column !== EXPECTED_COLUMNS[index])
  ) {
    migrateLegacySchema(db);
  }

  createIndexes(db);

  return db;
}

module.exports = {
  openDatabase,
};

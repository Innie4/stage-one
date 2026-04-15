const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function ensureDirectoryForFile(filePath) {
  if (!filePath || filePath === ':memory:') {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openDatabase(dbPath = path.join(process.cwd(), 'data', 'profiles.db')) {
  ensureDirectoryForFile(dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      gender TEXT NOT NULL,
      gender_probability REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      age INTEGER NOT NULL,
      age_group TEXT NOT NULL,
      country_id TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_id ON profiles(country_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_age_group ON profiles(age_group);
  `);

  return db;
}

module.exports = {
  openDatabase,
};

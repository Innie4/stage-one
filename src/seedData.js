const fs = require('node:fs');
const path = require('node:path');
const { createCountryIndex } = require('./countryUtils');

function loadSeedProfiles(seedPath = path.join(process.cwd(), 'data', 'seed_profiles.json')) {
  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = JSON.parse(raw);
  const profiles = Array.isArray(parsed) ? parsed : parsed.profiles;

  if (!Array.isArray(profiles)) {
    throw new Error('Invalid seed file format');
  }

  return profiles;
}

function loadSeedData(seedPath) {
  const profiles = loadSeedProfiles(seedPath);
  return {
    profiles,
    countryIndex: createCountryIndex(profiles),
  };
}

module.exports = {
  loadSeedData,
  loadSeedProfiles,
};

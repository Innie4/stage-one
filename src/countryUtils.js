const regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function createCountryIndex(profiles = []) {
  const countryNameToCode = new Map();
  const countryCodeToName = new Map();

  for (const profile of profiles) {
    if (!profile || !profile.country_id) {
      continue;
    }

    const code = String(profile.country_id).toUpperCase();
    const name = profile.country_name ? String(profile.country_name).trim() : '';

    countryNameToCode.set(normalizeText(code), code);
    if (name) {
      countryNameToCode.set(normalizeText(name), code);
      if (!countryCodeToName.has(code)) {
        countryCodeToName.set(code, name);
      }
    }
  }

  return {
    countryCodeToName,
    countryNameToCode,
  };
}

function resolveCountryCode(input, countryIndex) {
  if (!input) {
    return null;
  }

  const normalized = normalizeText(input);
  return countryIndex.countryNameToCode.get(normalized) ?? null;
}

function resolveCountryName(countryId, countryIndex) {
  if (!countryId) {
    return null;
  }

  const code = String(countryId).toUpperCase();
  if (countryIndex.countryCodeToName.has(code)) {
    return countryIndex.countryCodeToName.get(code);
  }

  const displayName = regionDisplayNames.of(code);
  return displayName && displayName !== code ? displayName : code;
}

module.exports = {
  createCountryIndex,
  normalizeText,
  resolveCountryCode,
  resolveCountryName,
};

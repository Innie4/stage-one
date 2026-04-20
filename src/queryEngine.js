const { normalizeText } = require('./countryUtils');

const ALLOWED_LIST_KEYS = new Set([
  'gender',
  'age_group',
  'country_id',
  'min_age',
  'max_age',
  'min_gender_probability',
  'min_country_probability',
  'sort_by',
  'order',
  'page',
  'limit',
]);

const ALLOWED_SEARCH_KEYS = new Set(['q', 'sort_by', 'order', 'page', 'limit']);
const VALID_GENDERS = new Set(['male', 'female']);
const VALID_AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const VALID_SORT_BY = new Set(['age', 'created_at', 'gender_probability']);
const VALID_ORDER = new Set(['asc', 'desc']);

function errorResponse(statusCode, message) {
  return {
    ok: false,
    statusCode,
    body: {
      status: 'error',
      message,
    },
  };
}

function successResponse(value) {
  return {
    ok: true,
    value,
  };
}

function readQueryValue(raw) {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const value = readQueryValue(item);
      if (value !== undefined) {
        return value;
      }
    }

    return raw.length > 0 ? '' : undefined;
  }

  if (raw === undefined || raw === null) {
    return undefined;
  }

  return String(raw).trim();
}

function parseAllowedKeys(query, allowedKeys) {
  const keys = Object.keys(query || {});
  const unknown = keys.filter((key) => !allowedKeys.has(key));

  if (unknown.length > 0) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return null;
}

function parseEnumParam(raw, allowedValues) {
  const value = readQueryValue(raw);
  if (value === undefined) {
    return successResponse(undefined);
  }

  if (!value) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  const normalized = value.toLowerCase();
  if (!allowedValues.has(normalized)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return successResponse(normalized);
}

function parseCountryId(raw) {
  const value = readQueryValue(raw);
  if (value === undefined) {
    return successResponse(undefined);
  }

  if (!value) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  if (!/^[a-z]{2}$/i.test(value)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return successResponse(value.toUpperCase());
}

function parseIntegerParam(raw, options = {}) {
  const { allowDefault = false, defaultValue, min, max } = options;
  const value = readQueryValue(raw);

  if (value === undefined) {
    if (allowDefault) {
      return successResponse(defaultValue);
    }

    return successResponse(undefined);
  }

  if (!value) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  if (!/^-?\d+$/.test(value)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  if (min !== undefined && parsed < min) {
    return errorResponse(422, 'Invalid query parameters');
  }

  if (max !== undefined && parsed > max) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return successResponse(parsed);
}

function parseProbabilityParam(raw) {
  const value = readQueryValue(raw);
  if (value === undefined) {
    return successResponse(undefined);
  }

  if (!value) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  const parsed = Number(value);
  if (parsed < 0 || parsed > 1) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return successResponse(parsed);
}

function parseSortParam(raw, allowedValues, defaultValue) {
  const value = readQueryValue(raw);
  if (value === undefined) {
    return successResponse(defaultValue);
  }

  if (!value) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  const normalized = value.toLowerCase();
  if (!allowedValues.has(normalized)) {
    return errorResponse(422, 'Invalid query parameters');
  }

  return successResponse(normalized);
}

function parsePagination(query) {
  const pageResult = parseIntegerParam(query.page, { allowDefault: true, defaultValue: 1, min: 1 });
  if (!pageResult.ok) {
    return pageResult;
  }

  const limitResult = parseIntegerParam(query.limit, { allowDefault: true, defaultValue: 10, min: 1, max: 50 });
  if (!limitResult.ok) {
    return limitResult;
  }

  return successResponse({
    page: pageResult.value,
    limit: limitResult.value,
  });
}

function parseListQuery(query = {}) {
  const keyError = parseAllowedKeys(query, ALLOWED_LIST_KEYS);
  if (keyError) {
    return keyError;
  }

  const gender = parseEnumParam(query.gender, VALID_GENDERS);
  if (!gender.ok) {
    return gender;
  }

  const ageGroup = parseEnumParam(query.age_group, VALID_AGE_GROUPS);
  if (!ageGroup.ok) {
    return ageGroup;
  }

  const countryId = parseCountryId(query.country_id);
  if (!countryId.ok) {
    return countryId;
  }

  const minAge = parseIntegerParam(query.min_age, { min: 0 });
  if (!minAge.ok) {
    return minAge;
  }

  const maxAge = parseIntegerParam(query.max_age, { min: 0 });
  if (!maxAge.ok) {
    return maxAge;
  }

  const minGenderProbability = parseProbabilityParam(query.min_gender_probability);
  if (!minGenderProbability.ok) {
    return minGenderProbability;
  }

  const minCountryProbability = parseProbabilityParam(query.min_country_probability);
  if (!minCountryProbability.ok) {
    return minCountryProbability;
  }

  const sortBy = parseSortParam(query.sort_by, VALID_SORT_BY, 'created_at');
  if (!sortBy.ok) {
    return sortBy;
  }

  const order = parseSortParam(query.order, VALID_ORDER, 'desc');
  if (!order.ok) {
    return order;
  }

  const pagination = parsePagination(query);
  if (!pagination.ok) {
    return pagination;
  }

  if (minAge.value !== undefined && maxAge.value !== undefined && minAge.value > maxAge.value) {
    return errorResponse(422, 'Invalid query parameters');
  }

  const filters = {};
  if (gender.value !== undefined) {
    filters.gender = gender.value;
  }

  if (ageGroup.value !== undefined) {
    filters.age_group = ageGroup.value;
  }

  if (countryId.value !== undefined) {
    filters.country_id = countryId.value;
  }

  if (minAge.value !== undefined) {
    filters.min_age = minAge.value;
  }

  if (maxAge.value !== undefined) {
    filters.max_age = maxAge.value;
  }

  if (minGenderProbability.value !== undefined) {
    filters.min_gender_probability = minGenderProbability.value;
  }

  if (minCountryProbability.value !== undefined) {
    filters.min_country_probability = minCountryProbability.value;
  }

  return successResponse({
    filters,
    order: order.value,
    page: pagination.value.page,
    limit: pagination.value.limit,
    sortBy: sortBy.value,
  });
}

function getAgeBoundsForAgeGroup(ageGroup) {
  switch (ageGroup) {
    case 'child':
      return { min: 0, max: 12 };
    case 'teenager':
      return { min: 13, max: 19 };
    case 'adult':
      return { min: 20, max: 59 };
    case 'senior':
      return { min: 60, max: Infinity };
    default:
      return null;
  }
}

function findCountryCodeInText(normalizedText, countryIndex) {
  const entries = Array.from(countryIndex.countryNameToCode.entries())
    .filter(([alias]) => alias.length > 2)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, code] of entries) {
    if (normalizedText.includes(alias)) {
      return code;
    }
  }

  const tokens = normalizedText.split(' ');
  for (const token of tokens) {
    if (token.length === 2) {
      const code = countryIndex.countryNameToCode.get(token);
      if (code) {
        return code;
      }
    }
  }

  return null;
}

function parseNaturalLanguageQuery(rawQuery, countryIndex) {
  const query = readQueryValue(rawQuery);
  if (query === undefined || query === '') {
    return errorResponse(400, 'Missing or empty parameter');
  }

  const normalized = normalizeText(query);
  if (!normalized) {
    return errorResponse(400, 'Missing or empty parameter');
  }

  const filters = {};
  let recognized = false;

  const hasMale = /\b(male|males|man|men|boy|boys)\b/.test(normalized);
  const hasFemale = /\b(female|females|woman|women|girl|girls)\b/.test(normalized);
  if (hasMale && !hasFemale) {
    filters.gender = 'male';
    recognized = true;
  } else if (hasFemale && !hasMale) {
    filters.gender = 'female';
    recognized = true;
  } else if (hasMale || hasFemale) {
    recognized = true;
  }

  const ageGroupMatches = [];
  for (const [synonym, canonical] of [
    ['child', 'child'],
    ['children', 'child'],
    ['teenager', 'teenager'],
    ['teenagers', 'teenager'],
    ['teen', 'teenager'],
    ['teens', 'teenager'],
    ['adult', 'adult'],
    ['adults', 'adult'],
    ['senior', 'senior'],
    ['seniors', 'senior'],
  ]) {
    if (new RegExp(`\\b${synonym}\\b`).test(normalized)) {
      ageGroupMatches.push(canonical);
    }
  }

  const distinctAgeGroups = [...new Set(ageGroupMatches)];
  if (distinctAgeGroups.length > 1) {
    return errorResponse(422, 'Invalid query parameters');
  }

  if (distinctAgeGroups.length === 1) {
    filters.age_group = distinctAgeGroups[0];
    recognized = true;
  }

  const ageRange = {
    min: -Infinity,
    max: Infinity,
  };

  if (/\byoung\b/.test(normalized)) {
    ageRange.min = Math.max(ageRange.min, 16);
    ageRange.max = Math.min(ageRange.max, 24);
    recognized = true;
  }

  const aboveMatch = normalized.match(/\b(?:above|over|older than|more than|greater than)\s+(\d+)\b/);
  if (aboveMatch) {
    ageRange.min = Math.max(ageRange.min, Number(aboveMatch[1]));
    recognized = true;
  }

  const belowMatch = normalized.match(/\b(?:below|under|younger than|less than)\s+(\d+)\b/);
  if (belowMatch) {
    ageRange.max = Math.min(ageRange.max, Number(belowMatch[1]));
    recognized = true;
  }

  if (filters.age_group) {
    const bounds = getAgeBoundsForAgeGroup(filters.age_group);
    ageRange.min = Math.max(ageRange.min, bounds.min);
    ageRange.max = Math.min(ageRange.max, bounds.max);
  }

  if (Number.isFinite(ageRange.min) && Number.isFinite(ageRange.max) && ageRange.min > ageRange.max) {
    return errorResponse(422, 'Invalid query parameters');
  }

  if (Number.isFinite(ageRange.min)) {
    filters.min_age = ageRange.min;
  }

  if (Number.isFinite(ageRange.max)) {
    filters.max_age = ageRange.max;
  }

  const countryCode = findCountryCodeInText(normalized, countryIndex);
  if (countryCode) {
    filters.country_id = countryCode;
    recognized = true;
  }

  if (!recognized) {
    return errorResponse(422, 'Unable to interpret query');
  }

  if (Object.keys(filters).length === 0) {
    return errorResponse(422, 'Unable to interpret query');
  }

  return successResponse(filters);
}

function parseSearchQuery(query = {}, countryIndex) {
  const keyError = parseAllowedKeys(query, ALLOWED_SEARCH_KEYS);
  if (keyError) {
    return keyError;
  }

  const interpreted = parseNaturalLanguageQuery(query.q, countryIndex);
  if (!interpreted.ok) {
    return interpreted;
  }

  const sortBy = parseSortParam(query.sort_by, VALID_SORT_BY, 'created_at');
  if (!sortBy.ok) {
    return sortBy;
  }

  const order = parseSortParam(query.order, VALID_ORDER, 'desc');
  if (!order.ok) {
    return order;
  }

  const pagination = parsePagination(query);
  if (!pagination.ok) {
    return pagination;
  }

  return successResponse({
    filters: interpreted.value,
    order: order.value,
    page: pagination.value.page,
    limit: pagination.value.limit,
    sortBy: sortBy.value,
  });
}

module.exports = {
  parseListQuery,
  parseSearchQuery,
};

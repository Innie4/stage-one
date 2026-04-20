class ExternalApiError extends Error {
  constructor(apiName, message) {
    super(message);
    this.name = 'ExternalApiError';
    this.apiName = apiName;
  }
}

function createInvalidResponseError(apiName) {
  return new ExternalApiError(apiName, `${apiName} returned an invalid response`);
}

function ensureObject(value, apiName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createInvalidResponseError(apiName);
  }

  return value;
}

function withTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetchImpl(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
}

async function fetchJson(fetchImpl, url, apiName, timeoutMs) {
  let response;

  try {
    response = await withTimeout(fetchImpl, url, timeoutMs);
  } catch (error) {
    throw createInvalidResponseError(apiName);
  }

  if (!response || !response.ok) {
    throw createInvalidResponseError(apiName);
  }

  try {
    return ensureObject(await response.json(), apiName);
  } catch (error) {
    throw createInvalidResponseError(apiName);
  }
}

function classifyAgeGroup(age) {
  if (age <= 12) {
    return 'child';
  }

  if (age <= 19) {
    return 'teenager';
  }

  if (age <= 59) {
    return 'adult';
  }

  return 'senior';
}

function normalizeGenderResponse(payload, apiName) {
  const gender = typeof payload.gender === 'string' ? payload.gender.toLowerCase() : null;
  const probability = Number(payload.probability);
  const count = Number(payload.count);

  if (!gender || count <= 0 || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw createInvalidResponseError(apiName);
  }

  return {
    gender,
    gender_probability: probability,
  };
}

function normalizeAgeResponse(payload, apiName) {
  const age = Number(payload.age);

  if (!Number.isFinite(age) || age < 0) {
    throw createInvalidResponseError(apiName);
  }

  return {
    age: Math.trunc(age),
    age_group: classifyAgeGroup(age),
  };
}

function normalizeNationalityResponse(payload, apiName) {
  if (!Array.isArray(payload.country) || payload.country.length === 0) {
    throw createInvalidResponseError(apiName);
  }

  const countries = payload.country
    .filter((entry) => entry && typeof entry.country_id === 'string')
    .map((entry) => ({
      country_id: entry.country_id.toUpperCase(),
      probability: Number(entry.probability),
    }))
    .filter((entry) => entry.country_id && Number.isFinite(entry.probability) && entry.probability >= 0 && entry.probability <= 1)
    .sort((a, b) => b.probability - a.probability);

  if (countries.length === 0) {
    throw createInvalidResponseError(apiName);
  }

  return {
    country_id: countries[0].country_id,
    country_probability: countries[0].probability,
  };
}

async function fetchProfileInsights(name, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const encodedName = encodeURIComponent(name);

  const [genderPayload, agePayload, nationalityPayload] = await Promise.all([
    fetchJson(fetchImpl, `https://api.genderize.io?name=${encodedName}`, 'Genderize', timeoutMs),
    fetchJson(fetchImpl, `https://api.agify.io?name=${encodedName}`, 'Agify', timeoutMs),
    fetchJson(fetchImpl, `https://api.nationalize.io?name=${encodedName}`, 'Nationalize', timeoutMs),
  ]);

  const gender = normalizeGenderResponse(genderPayload, 'Genderize');
  const age = normalizeAgeResponse(agePayload, 'Agify');
  const nationality = normalizeNationalityResponse(nationalityPayload, 'Nationalize');

  return {
    ...gender,
    ...age,
    ...nationality,
  };
}

module.exports = {
  ExternalApiError,
  classifyAgeGroup,
  createInvalidResponseError,
  fetchProfileInsights,
};

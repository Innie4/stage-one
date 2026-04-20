const { v7: uuidv7 } = require('uuid');
const { createCountryIndex, resolveCountryName } = require('./countryUtils');
const { ExternalApiError, fetchProfileInsights } = require('./externalApis');
const { formatUtcTimestamp } = require('./seed');
const { parseListQuery, parseSearchQuery } = require('./queryEngine');

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNameInput(input) {
  if (input === undefined) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Missing or empty name',
    };
  }

  if (typeof input !== 'string') {
    return {
      ok: false,
      statusCode: 422,
      message: 'Invalid type',
    };
  }

  const normalized = normalizeName(input);
  if (!normalized) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Missing or empty name',
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

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

function createProfileService(repo, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const countryIndex = options.countryIndex ?? createCountryIndex([]);

  async function createProfile(payload) {
    if (payload !== undefined && payload !== null && !isPlainObject(payload)) {
      return errorResponse(422, 'Invalid type');
    }

    const nameValidation = validateNameInput(payload?.name);
    if (!nameValidation.ok) {
      return errorResponse(nameValidation.statusCode, nameValidation.message);
    }

    const name = nameValidation.value;
    const existing = repo.getByName(name);
    if (existing) {
      return {
        ok: true,
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Profile already exists',
          data: existing,
        },
      };
    }

    let insights;
    try {
      insights = await fetchProfileInsights(name, { fetchImpl });
    } catch (error) {
      if (error instanceof ExternalApiError) {
        return errorResponse(502, error.message);
      }

      throw error;
    }

    const record = {
      id: uuidv7(),
      name,
      gender: insights.gender,
      gender_probability: insights.gender_probability,
      age: insights.age,
      age_group: insights.age_group,
      country_id: insights.country_id,
      country_name: resolveCountryName(insights.country_id, countryIndex),
      country_probability: insights.country_probability,
      created_at: formatUtcTimestamp(now()),
    };

    try {
      const inserted = repo.create(record);
      return {
        ok: true,
        statusCode: 201,
        body: {
          status: 'success',
          data: inserted,
        },
      };
    } catch (error) {
      const duplicate = repo.getByName(name);
      if (duplicate) {
        return {
          ok: true,
          statusCode: 200,
          body: {
            status: 'success',
            message: 'Profile already exists',
            data: duplicate,
          },
        };
      }

      throw error;
    }
  }

  function getProfileById(id) {
    const profile = repo.getById(id);

    if (!profile) {
      return errorResponse(404, 'Profile not found');
    }

    return {
      ok: true,
      statusCode: 200,
      body: {
        status: 'success',
        data: profile,
      },
    };
  }

  function listProfiles(query = {}) {
    const parsed = parseListQuery(query);
    if (!parsed.ok) {
      return parsed;
    }

    const result = repo.findMany({
      filters: parsed.value.filters,
      sortBy: parsed.value.sortBy,
      order: parsed.value.order,
      limit: parsed.value.limit,
      offset: (parsed.value.page - 1) * parsed.value.limit,
    });

    return {
      ok: true,
      statusCode: 200,
      body: {
        status: 'success',
        page: parsed.value.page,
        limit: parsed.value.limit,
        total: result.total,
        data: result.data,
      },
    };
  }

  function searchProfiles(query = {}) {
    const parsed = parseSearchQuery(query, countryIndex);
    if (!parsed.ok) {
      return parsed;
    }

    const result = repo.findMany({
      filters: parsed.value.filters,
      sortBy: parsed.value.sortBy,
      order: parsed.value.order,
      limit: parsed.value.limit,
      offset: (parsed.value.page - 1) * parsed.value.limit,
    });

    return {
      ok: true,
      statusCode: 200,
      body: {
        status: 'success',
        page: parsed.value.page,
        limit: parsed.value.limit,
        total: result.total,
        data: result.data,
      },
    };
  }

  function deleteProfile(id) {
    const result = repo.deleteById(id);

    if (result.changes === 0) {
      return errorResponse(404, 'Profile not found');
    }

    return {
      ok: true,
      statusCode: 204,
      body: null,
    };
  }

  return {
    createProfile,
    deleteProfile,
    getProfileById,
    listProfiles,
    searchProfiles,
  };
}

module.exports = {
  createProfileService,
  errorResponse,
  isPlainObject,
  normalizeName,
  validateNameInput,
};

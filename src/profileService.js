const { v7: uuidv7 } = require('uuid');
const { ExternalApiError, fetchProfileInsights } = require('./externalApis');

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

function normalizeOptionalFilter(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeOptionalFilter(item);
      if (normalized !== undefined) {
        return normalized;
      }
    }

    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function createProfileService(repo, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  async function createProfile(payload) {
    if (payload !== undefined && payload !== null && !isPlainObject(payload)) {
      return {
        ok: false,
        statusCode: 422,
        body: {
          status: 'error',
          message: 'Invalid type',
        },
      };
    }

    const nameValidation = validateNameInput(payload?.name);
    if (!nameValidation.ok) {
      return {
        ok: false,
        statusCode: nameValidation.statusCode,
        body: {
          status: 'error',
          message: nameValidation.message,
        },
      };
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
        return {
          ok: false,
          statusCode: 502,
          body: {
            status: 'error',
            message: error.message,
          },
        };
      }

      throw error;
    }

    const createdAt = now().toISOString();
    const record = {
      id: uuidv7(),
      name,
      gender: insights.gender,
      gender_probability: insights.gender_probability,
      sample_size: insights.sample_size,
      age: insights.age,
      age_group: insights.age_group,
      country_id: insights.country_id,
      country_probability: insights.country_probability,
      created_at: createdAt,
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
      return {
        ok: false,
        statusCode: 404,
        body: {
          status: 'error',
          message: 'Profile not found',
        },
      };
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
    const filters = {};

    const gender = normalizeOptionalFilter(query.gender);
    const countryId = normalizeOptionalFilter(query.country_id);
    const ageGroup = normalizeOptionalFilter(query.age_group);

    if (gender) {
      filters.gender = gender;
    }

    if (countryId) {
      filters.country_id = countryId;
    }

    if (ageGroup) {
      filters.age_group = ageGroup;
    }

    const profiles = repo.list(filters).map((profile) => ({
      id: profile.id,
      name: profile.name,
      gender: profile.gender,
      age: profile.age,
      age_group: profile.age_group,
      country_id: profile.country_id,
    }));

    return {
      ok: true,
      statusCode: 200,
      body: {
        status: 'success',
        count: profiles.length,
        data: profiles,
      },
    };
  }

  function deleteProfile(id) {
    const result = repo.deleteById(id);

    if (result.changes === 0) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          status: 'error',
          message: 'Profile not found',
        },
      };
    }

    return {
      ok: true,
      statusCode: 204,
      body: null,
    };
  }

  return {
    createProfile,
    getProfileById,
    listProfiles,
    deleteProfile,
  };
}

module.exports = {
  createProfileService,
  isPlainObject,
  normalizeName,
  validateNameInput,
};

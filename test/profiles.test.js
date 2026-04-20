const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const supertest = require('supertest');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db');
const { createProfileRepository } = require('../src/profileRepository');
const { createProfileService, validateNameInput } = require('../src/profileService');
const { loadSeedData } = require('../src/seedData');
const { seedDatabase } = require('../src/seed');

const seedData = loadSeedData();

function createMockFetch(responses) {
  const calls = [];

  const fetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(responses).find((pattern) => url.includes(pattern));

    if (!key) {
      throw new Error(`Unexpected fetch url: ${url}`);
    }

    const response = responses[key];
    if (response instanceof Error) {
      throw response;
    }

    if (typeof response === 'function') {
      return response(url);
    }

    return {
      ok: response.ok ?? true,
      json: async () => response.body,
    };
  };

  return { fetchImpl, calls };
}

function createSeededContext(fetchResponses = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-two-'));
  const dbPath = path.join(dir, 'intelligence.db');
  const db = openDatabase(dbPath);
  seedDatabase(db, { profiles: seedData.profiles });
  const mock = createMockFetch(fetchResponses);
  const { app } = createApp({
    db,
    seedData,
    fetchImpl: mock.fetchImpl,
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  });

  return {
    db,
    dir,
    mock,
    request: supertest(app),
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function getSampleProfile(predicate) {
  const profile = seedData.profiles.find(predicate);
  assert.ok(profile, 'Expected a matching seeded profile');
  return profile;
}

function assertSummaryShape(profile) {
  assert.deepEqual(Object.keys(profile).sort(), ['age', 'age_group', 'country_id', 'gender', 'id', 'name']);
}

test('seedDatabase loads all 2026 profiles and stays idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-two-seed-'));
  const dbPath = path.join(dir, 'intelligence.db');
  const db = openDatabase(dbPath);

  try {
    const first = seedDatabase(db, { profiles: seedData.profiles });
    const second = seedDatabase(db, { profiles: seedData.profiles });

    const total = db.prepare('SELECT COUNT(*) AS total FROM profiles').get().total;
    assert.equal(first.seededCount, 2026);
    assert.equal(second.seededCount, 2026);
    assert.equal(total, 2026);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('validateNameInput enforces missing and invalid types', () => {
  assert.deepEqual(validateNameInput(undefined), {
    ok: false,
    statusCode: 400,
    message: 'Missing or empty name',
  });

  assert.deepEqual(validateNameInput('   '), {
    ok: false,
    statusCode: 400,
    message: 'Missing or empty name',
  });

  assert.deepEqual(validateNameInput(123), {
    ok: false,
    statusCode: 422,
    message: 'Invalid type',
  });
});

test('root route returns a friendly status payload', async (t) => {
  const ctx = createSeededContext();
  t.after(() => ctx.cleanup());

  const response = await ctx.request.get('/').expect(200);

  assert.equal(response.body.status, 'success');
  assert.equal(response.body.message, 'Stage Two API is running');
});

test('default profile listing returns page 1, limit 10, and total 2026', async (t) => {
  const ctx = createSeededContext();
  t.after(() => ctx.cleanup());

  const response = await ctx.request.get('/api/profiles').expect(200);

  assert.equal(response.body.status, 'success');
  assert.equal(response.body.page, 1);
  assert.equal(response.body.limit, 10);
  assert.equal(response.body.total, 2026);
  assert.equal(response.body.data.length, 10);
  assertSummaryShape(response.body.data[0]);
});

test('createProfile persists the Stage 2 shape and supports lookup and delete', async (t) => {
  const ctx = createSeededContext({
    'genderize.io': { body: { gender: 'female', probability: 0.99, count: 1234 } },
    'agify.io': { body: { age: 46 } },
    'nationalize.io': { body: { country: [{ country_id: 'NG', probability: 0.85 }] } },
  });
  t.after(() => ctx.cleanup());

  const createResponse = await ctx.request.post('/api/profiles').send({ name: 'Ella Bishop' }).expect(201);

  assert.equal(createResponse.headers['access-control-allow-origin'], '*');
  assert.equal(createResponse.body.status, 'success');
  assert.equal(createResponse.body.data.name, 'ella bishop');
  assert.equal(createResponse.body.data.gender, 'female');
  assert.equal(createResponse.body.data.gender_probability, 0.99);
  assert.equal(createResponse.body.data.age, 46);
  assert.equal(createResponse.body.data.age_group, 'adult');
  assert.equal(createResponse.body.data.country_id, 'NG');
  assert.equal(createResponse.body.data.country_name, 'Nigeria');
  assert.equal(createResponse.body.data.country_probability, 0.85);
  assert.equal(createResponse.body.data.created_at, '2026-04-01T12:00:00Z');
  assert.equal('sample_size' in createResponse.body.data, false);
  assert.match(createResponse.body.data.id, /^[0-9a-f-]{36}$/i);
  assert.equal(createResponse.body.data.id[14], '7');

  const getResponse = await ctx.request.get(`/api/profiles/${createResponse.body.data.id}`).expect(200);
  assert.equal(getResponse.body.status, 'success');
  assert.equal(getResponse.body.data.id, createResponse.body.data.id);
  assert.equal(getResponse.body.data.country_name, 'Nigeria');
  assert.equal('sample_size' in getResponse.body.data, false);

  await ctx.request.delete(`/api/profiles/${createResponse.body.data.id}`).expect(204);
  await ctx.request.get(`/api/profiles/${createResponse.body.data.id}`).expect(404);
});

test('createProfile returns the existing record for duplicate names', async (t) => {
  const ctx = createSeededContext({
    'genderize.io': { body: { gender: 'male', probability: 0.88, count: 100 } },
    'agify.io': { body: { age: 28 } },
    'nationalize.io': { body: { country: [{ country_id: 'KE', probability: 0.66 }] } },
  });
  t.after(() => ctx.cleanup());

  const first = await ctx.request.post('/api/profiles').send({ name: 'Samuel Otieno' }).expect(201);
  const second = await ctx.request.post('/api/profiles').send({ name: 'samuel otieno' }).expect(200);

  assert.equal(second.body.message, 'Profile already exists');
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS total FROM profiles WHERE name = ?').get('samuel otieno').total, 1);
});

test('list profiles supports combined filters, sorting, and pagination', async (t) => {
  const ctx = createSeededContext();
  t.after(() => ctx.cleanup());

  getSampleProfile((profile) => profile.gender === 'female' && profile.age_group === 'senior' && profile.country_id === 'TZ');

  const response = await ctx.request
    .get('/api/profiles?gender=female&age_group=senior&country_id=tz&min_age=60&min_gender_probability=0.6&min_country_probability=0.5&sort_by=age&order=desc&page=1&limit=5')
    .expect(200);

  assert.equal(response.body.status, 'success');
  assert.equal(response.body.page, 1);
  assert.equal(response.body.limit, 5);
  assert.ok(response.body.total >= 1);
  assert.ok(response.body.data.length <= 5);
  assertSummaryShape(response.body.data[0]);

  for (let index = 0; index < response.body.data.length; index += 1) {
    const item = response.body.data[index];
    assert.equal(item.gender, 'female');
    assert.equal(item.age_group, 'senior');
    assert.equal(item.country_id, 'TZ');
    assert.ok(item.age >= 60);
    if (index > 0) {
      assert.ok(response.body.data[index - 1].age >= item.age);
    }
  }
});

test('searchProfiles interprets the documented natural language queries', async (t) => {
  const ctx = createSeededContext();
  t.after(() => ctx.cleanup());

  const cases = [
    {
      q: 'young males from nigeria',
      verify(item) {
        assert.equal(item.gender, 'male');
        assert.equal(item.country_id, 'NG');
        assert.ok(item.age >= 16 && item.age <= 24);
      },
    },
    {
      q: 'females above 30',
      verify(item) {
        assert.equal(item.gender, 'female');
        assert.ok(item.age >= 30);
      },
    },
    {
      q: 'people from angola',
      verify(item) {
        assert.equal(item.country_id, 'AO');
      },
    },
    {
      q: 'adult males from kenya',
      verify(item) {
        assert.equal(item.gender, 'male');
        assert.equal(item.age_group, 'adult');
        assert.equal(item.country_id, 'KE');
      },
    },
    {
      q: 'male and female teenagers above 17',
      verify(item) {
        assert.equal(item.age_group, 'teenager');
        assert.ok(item.age >= 17);
      },
    },
  ];

  for (const testCase of cases) {
    const response = await ctx.request
      .get(`/api/profiles/search?q=${encodeURIComponent(testCase.q)}&page=1&limit=50`)
      .expect(200);

    assert.equal(response.body.status, 'success');
    assert.equal(response.body.page, 1);
    assert.equal(response.body.limit, 50);
    assert.ok(response.body.total > 0, `Expected results for "${testCase.q}"`);
    assert.ok(response.body.data.length > 0, `Expected data for "${testCase.q}"`);
    assertSummaryShape(response.body.data[0]);

    for (const item of response.body.data) {
      testCase.verify(item);
    }
  }
});

test('query validation rejects invalid and uninterpretable queries', async (t) => {
  const ctx = createSeededContext();
  t.after(() => ctx.cleanup());

  await ctx.request.get('/api/profiles?sort_by=height').expect(422);
  await ctx.request.get('/api/profiles?min_age=abc').expect(422);
  await ctx.request.get('/api/profiles?gender=').expect(400);
  await ctx.request.get('/api/profiles/search?q=').expect(400);

  const uninterpretable = await ctx.request.get('/api/profiles/search?q=blue%20unicorns').expect(422);
  assert.equal(uninterpretable.body.message, 'Unable to interpret query');

  const ambiguous = await ctx.request.get('/api/profiles/search?q=male%20and%20female').expect(422);
  assert.equal(ambiguous.body.message, 'Unable to interpret query');
});

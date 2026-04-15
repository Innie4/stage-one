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

    return {
      ok: response.ok ?? true,
      json: async () => response.body,
    };
  };

  return { fetchImpl, calls };
}

function createTestContext(fetchResponses = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-one-'));
  const dbPath = path.join(dir, 'profiles.db');
  const db = openDatabase(dbPath);
  const repo = createProfileRepository(db);
  const mock = createMockFetch(fetchResponses);
  const service = createProfileService(repo, {
    fetchImpl: mock.fetchImpl,
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  });
  const { app } = createApp({
    db,
    repo,
    service,
  });

  return {
    db,
    dir,
    repo,
    request: supertest(app),
    mock,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

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
  const ctx = createTestContext();

  t.after(() => ctx.cleanup());

  const response = await ctx.request.get('/').expect(200);

  assert.equal(response.body.status, 'success');
  assert.equal(response.body.message, 'Stage One API is running');
});

test('createProfile returns 422 for non-object payloads', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-one-'));
  const dbPath = path.join(dir, 'profiles.db');
  const db = openDatabase(dbPath);
  const repo = createProfileRepository(db);
  const service = createProfileService(repo, {
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  });

  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const response = await service.createProfile(123);

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body, {
    status: 'error',
    message: 'Invalid type',
  });
  assert.equal(repo.list().length, 0);
});

test('creates a profile, returns the stored payload, and preserves CORS headers', async (t) => {
  const ctx = createTestContext({
    'genderize.io': { body: { gender: 'female', probability: 0.99, count: 1234 } },
    'agify.io': { body: { age: 46 } },
    'nationalize.io': { body: { country: [{ country_id: 'DRC', probability: 0.85 }] } },
  });

  t.after(() => ctx.cleanup());

  const createResponse = await ctx.request
    .post('/api/profiles')
    .send({ name: 'Ella' })
    .expect(201);

  assert.equal(createResponse.headers['access-control-allow-origin'], '*');
  assert.equal(createResponse.body.status, 'success');
  assert.equal(createResponse.body.data.name, 'ella');
  assert.equal(createResponse.body.data.gender, 'female');
  assert.equal(createResponse.body.data.gender_probability, 0.99);
  assert.equal(createResponse.body.data.sample_size, 1234);
  assert.equal(createResponse.body.data.age, 46);
  assert.equal(createResponse.body.data.age_group, 'adult');
  assert.equal(createResponse.body.data.country_id, 'DRC');
  assert.equal(createResponse.body.data.country_probability, 0.85);
  assert.equal(createResponse.body.data.created_at, '2026-04-01T12:00:00Z');
  assert.match(createResponse.body.data.id, /^[0-9a-f-]{36}$/i);
  assert.equal(createResponse.body.data.id[14], '7');

  const getResponse = await ctx.request
    .get(`/api/profiles/${createResponse.body.data.id}`)
    .expect(200);

  assert.equal(getResponse.body.data.id, createResponse.body.data.id);
  assert.equal(getResponse.body.data.name, 'ella');
});

test('returns the existing record for duplicate names without creating a second row', async (t) => {
  const ctx = createTestContext({
    'genderize.io': { body: { gender: 'male', probability: 0.88, count: 100 } },
    'agify.io': { body: { age: 28 } },
    'nationalize.io': { body: { country: [{ country_id: 'NG', probability: 0.66 }] } },
  });

  t.after(() => ctx.cleanup());

  const first = await ctx.request.post('/api/profiles').send({ name: 'Emmanuel' }).expect(201);
  const second = await ctx.request.post('/api/profiles').send({ name: 'emmanuel' }).expect(200);

  assert.equal(second.body.message, 'Profile already exists');
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(ctx.repo.list().length, 1);
});

test('filters profiles case-insensitively', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-one-'));
  const dbPath = path.join(dir, 'profiles.db');
  const db = openDatabase(dbPath);
  const repo = createProfileRepository(db);
  const fetchImpl = async (url) => {
    const name = new URL(url).searchParams.get('name');

    if (url.includes('genderize.io') && name === 'sarah') {
      return { ok: true, json: async () => ({ gender: 'female', probability: 0.95, count: 50 }) };
    }

    if (url.includes('agify.io') && name === 'sarah') {
      return { ok: true, json: async () => ({ age: 28 }) };
    }

    if (url.includes('nationalize.io') && name === 'sarah') {
      return { ok: true, json: async () => ({ country: [{ country_id: 'US', probability: 0.6 }] }) };
    }

    if (url.includes('genderize.io') && name === 'emmanuel') {
      return { ok: true, json: async () => ({ gender: 'male', probability: 0.98, count: 77 }) };
    }

    if (url.includes('agify.io') && name === 'emmanuel') {
      return { ok: true, json: async () => ({ age: 25 }) };
    }

    if (url.includes('nationalize.io') && name === 'emmanuel') {
      return { ok: true, json: async () => ({ country: [{ country_id: 'NG', probability: 0.91 }] }) };
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  };
  const service = createProfileService(repo, {
    fetchImpl,
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  });
  const { app } = createApp({ db, repo, service });
  const request = supertest(app);

  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await request.post('/api/profiles').send({ name: 'emmanuel' }).expect(201);
  await request.post('/api/profiles').send({ name: 'sarah' }).expect(201);

  const response = await request
    .get('/api/profiles?gender=FEMALE&country_id=us&age_group=ADULT')
    .expect(200);

  assert.equal(response.body.count, 1);
  assert.deepEqual(response.body.data.map((item) => item.name), ['sarah']);
});

test('ignores empty filter values and uses the first non-empty repeated value', async (t) => {
  const ctx = createTestContext({
    'genderize.io': { body: { gender: 'female', probability: 0.95, count: 50 } },
    'agify.io': { body: { age: 28 } },
    'nationalize.io': { body: { country: [{ country_id: 'US', probability: 0.6 }] } },
  });

  t.after(() => ctx.cleanup());

  await ctx.request.post('/api/profiles').send({ name: 'sarah' }).expect(201);

  const emptyFilterResponse = await ctx.request
    .get('/api/profiles?gender=%20%20%20&country_id=&age_group=')
    .expect(200);

  assert.equal(emptyFilterResponse.body.count, 1);

  const repeatedFilterResponse = await ctx.request
    .get('/api/profiles?gender=&gender=FEMALE&country_id=&country_id=us&age_group=adult')
    .expect(200);

  assert.equal(repeatedFilterResponse.body.count, 1);
  assert.equal(repeatedFilterResponse.body.data[0].name, 'sarah');
});

test('returns 502 when an upstream API response is invalid', async (t) => {
  const ctx = createTestContext({
    'genderize.io': { body: { gender: null, probability: 0.99, count: 0 } },
    'agify.io': { body: { age: 24 } },
    'nationalize.io': { body: { country: [{ country_id: 'NG', probability: 0.9 }] } },
  });

  t.after(() => ctx.cleanup());

  const response = await ctx.request.post('/api/profiles').send({ name: 'ada' }).expect(502);

  assert.equal(response.body.status, 'error');
  assert.equal(response.body.message, 'Genderize returned an invalid response');
  assert.equal(ctx.repo.list().length, 0);
});

test('returns 400, 422, 404, and 204 for the expected error paths', async (t) => {
  const ctx = createTestContext({
    'genderize.io': { body: { gender: 'male', probability: 0.9, count: 1 } },
    'agify.io': { body: { age: 33 } },
    'nationalize.io': { body: { country: [{ country_id: 'GB', probability: 0.7 }] } },
  });

  t.after(() => ctx.cleanup());

  await ctx.request.post('/api/profiles').send({ name: 'john' }).expect(201);

  await ctx.request.post('/api/profiles').send({}).expect(400);
  await ctx.request.post('/api/profiles').send({ name: 123 }).expect(422);
  await ctx.request.get('/api/profiles/does-not-exist').expect(404);

  const listResponse = await ctx.request.get('/api/profiles').expect(200);
  const deletedId = listResponse.body.data[0].id;
  await ctx.request.delete(`/api/profiles/${deletedId}`).expect(204);
  await ctx.request.delete(`/api/profiles/${deletedId}`).expect(404);
});

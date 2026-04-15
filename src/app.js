const express = require('express');
const { createProfileRepository } = require('./profileRepository');
const { createProfileService } = require('./profileService');
const { openDatabase } = require('./db');

function createCorsMiddleware() {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

function sendJson(res, statusCode, body) {
  if (statusCode === 204) {
    return res.status(204).end();
  }

  return res.status(statusCode).json(body);
}

function createApp(options = {}) {
  const app = express();
  const db = options.db ?? openDatabase(options.dbPath);
  const repo = options.repo ?? createProfileRepository(db);
  const service = options.service ?? createProfileService(repo, {
    fetchImpl: options.fetchImpl,
    now: options.now,
  });

  app.use(createCorsMiddleware());
  app.use(express.json({ strict: false }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/profiles', async (req, res, next) => {
    try {
      const result = await service.createProfile(req.body);
      return sendJson(res, result.statusCode, result.body);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/profiles', (req, res, next) => {
    try {
      const result = service.listProfiles(req.query);
      return sendJson(res, result.statusCode, result.body);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/profiles/:id', (req, res, next) => {
    try {
      const result = service.getProfileById(req.params.id);
      return sendJson(res, result.statusCode, result.body);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/profiles/:id', (req, res, next) => {
    try {
      const result = service.deleteProfile(req.params.id);
      return sendJson(res, result.statusCode, result.body);
    } catch (error) {
      next(error);
    }
  });

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid JSON payload',
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  });

  return {
    app,
    db,
    repo,
    service,
  };
}

module.exports = {
  createApp,
  sendJson,
};

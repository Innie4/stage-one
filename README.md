# Stage One Backend

This repository contains the Stage 2 implementation for the Backend Wizards assessment.

## What It Does

- Stores profile data in SQLite
- Seeds the database with the provided 2026 profiles
- Exposes CRUD endpoints for profiles
- Supports advanced filtering, sorting, pagination, and natural-language search
- Sends `Access-Control-Allow-Origin: *` on API responses

## Tech Stack

- Node.js
- Express
- SQLite via Node's built-in `node:sqlite`
- `node:test` for regression tests
- `supertest` for HTTP verification

## Seed Data

The seed file is committed at [`data/seed_profiles.json`](./data/seed_profiles.json).

Re-running the seed is safe. Existing rows are ignored by name, so duplicates are not created.

## Setup

```bash
npm install
```

## Seed the Database

```bash
npm run seed
```

## Run

```bash
npm start
```

Environment variables:

- `PORT` defaults to `3000`
- `DATABASE_PATH` defaults to `data/intelligence.db`

## Test

```bash
npm test
```

## API

### `POST /api/profiles`

Request body:

```json
{ "name": "ella" }
```

Success:

```json
{
  "status": "success",
  "data": {
    "id": "uuid-v7",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "age": 46,
    "age_group": "adult",
    "country_id": "NG",
    "country_name": "Nigeria",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

Duplicate name:

```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": {}
}
```

### `GET /api/profiles/:id`

Returns the full stored profile.

### `GET /api/profiles`

Default response:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": []
}
```

Supported query parameters:

- `gender`
- `age_group`
- `country_id`
- `min_age`
- `max_age`
- `min_gender_probability`
- `min_country_probability`
- `sort_by` with `age`, `created_at`, or `gender_probability`
- `order` with `asc` or `desc`
- `page`
- `limit` with a maximum of `50`

Filters are combinable and case-insensitive for string values.

### `GET /api/profiles/search`

Natural-language search examples:

- `young males from nigeria`
- `females above 30`
- `people from angola`
- `adult males from kenya`
- `male and female teenagers above 17`

Pagination, sorting, and validation rules follow the same conventions as `GET /api/profiles`.

If the query cannot be interpreted, the API returns:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

### `DELETE /api/profiles/:id`

Returns `204 No Content` on success.

## Error Format

All errors use this structure:

```json
{ "status": "error", "message": "<error message>" }
```

## Notes

- IDs are UUID v7
- Timestamps are UTC ISO 8601 strings
- The root path `/` returns a small status JSON payload for deployment checks

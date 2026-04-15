# Stage One Backend

This repository contains a complete implementation of the Backend Wizards Stage 1 task.

## What it does

- Accepts a name at `POST /api/profiles`
- Calls Genderize, Agify, and Nationalize
- Applies age-group classification
- Stores profiles in SQLite
- Prevents duplicate profiles by name
- Exposes retrieval, listing, and deletion endpoints
- Sends `Access-Control-Allow-Origin: *` on API responses

## Tech Stack

- Node.js
- Express
- SQLite via Node's built-in `node:sqlite`
- Built-in `node:test`
- `supertest` for regression tests

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Environment variables:

- `PORT` defaults to `3000`
- `DATABASE_PATH` defaults to `data/profiles.db`

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
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
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
  "data": {
    "id": "uuid-v7",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

### `GET /api/profiles/:id`

Returns a single stored profile.

### `GET /api/profiles`

Optional filters:

- `gender`
- `country_id`
- `age_group`

Filter values are case-insensitive.

### `DELETE /api/profiles/:id`

Returns `204 No Content` on success.

## Error Format

All JSON errors use this structure:

```json
{
  "status": "error",
  "message": "Profile not found"
}
```

Upstream API validation failures return `502` with:

```json
{
  "status": "error",
  "message": "Genderize returned an invalid response"
}
```

## Notes

- IDs are generated as UUID v7.
- Timestamps are stored in UTC ISO 8601 format.
- Duplicate detection is case-insensitive on name.

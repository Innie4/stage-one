const { createApp } = require('./app');
const { openDatabase } = require('./db');
const { seedDatabase } = require('./seed');
const { loadSeedData } = require('./seedData');

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.DATABASE_PATH;
const seedData = loadSeedData();

const db = openDatabase(dbPath);
seedDatabase(db, {
  profiles: seedData.profiles,
});

const { app } = createApp({
  db,
  seedData,
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const { createApp } = require('./app');

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.DATABASE_PATH;

const { app } = createApp({ dbPath });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

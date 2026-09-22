const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://attendance_user:attendance_pass@localhost:55432/attendance_db?schema=public',
});

(async () => {
  try {
    await client.connect();
    const r = await client.query('SELECT current_user, current_database(), current_schema()');
    console.log('Connected:', r.rows[0]);
    await client.query('CREATE TABLE _pg_smoke(id int)');
    await client.query('DROP TABLE _pg_smoke');
    console.log('CREATE/DROP works');
  } catch (e) {
    console.error('Failed:', e.message);
    console.error('Detail:', e);
  } finally {
    await client.end();
  }
})();

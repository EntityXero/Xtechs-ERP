const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp'
  });
  
  await client.connect();
  const res = await client.query("SELECT * FROM users WHERE email='admin@xtechs.local'");
  console.log('User count:', res.rows.length);
  if (res.rows.length > 0) {
    console.log('User status:', res.rows[0].status);
    console.log('User hash:', res.rows[0].password_hash);
  }
  
  const allUsers = await client.query("SELECT email FROM users");
  console.log('All emails:', allUsers.rows.map(r => r.email));
  
  await client.end();
}

check().catch(console.error);

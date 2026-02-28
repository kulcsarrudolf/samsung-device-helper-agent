import fs from 'fs';

if (fs.existsSync('.env')) {
  console.log('.env already exists — no changes made.');
} else {
  fs.copyFileSync('.env.example', '.env');
  console.log('.env created — replace the placeholder values with your actual tokens.');
}

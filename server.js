require('dotenv').config();
const app = require('./app');
const { setupDatabase } = require('./setup');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    console.log('🔧 Initializing database...');
    await setupDatabase();
    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║     QAS PREMIUM SCHOOL MANAGEMENT SYSTEM         ║');
      console.log('║     Version 2.0.0 - Premium Edition              ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║  🌐 Server:   http://localhost:${PORT}               ║`);
      console.log(`║  📚 School:   ${process.env.SCHOOL_NAME}    ║`);
      console.log(`║  📅 Year:     ${process.env.ACADEMIC_YEAR}                       ║`);
      console.log('║  👤 Login:    admin / admin123                   ║');
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

/**
 * ============================================================
 *  KAF AGENCY — DATABASE SEED SCRIPT
 *  Run with:  node seed.js
 *  ⚠️  WARNING: This will DELETE ALL existing data!
 * ============================================================
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User    = require('./models/User');
const Contact = require('./models/Contact');
const Project = require('./models/Project');
const Task    = require('./models/Task');

// ─── CHANGE THESE TO YOUR DESIRED ADMIN CREDENTIALS ───────────────────────
const ADMIN_NAME     = 'Admin';
const ADMIN_EMAIL    = 'admin@kafmarketingagency.com';
const ADMIN_PASSWORD = 'Kaf@2026Admin'; // ← Change this after first login!
// ──────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected!\n');

  // 1. Wipe all collections
  console.log('🗑️  Clearing all data...');
  await User.deleteMany({});
  await Contact.deleteMany({});
  await Project.deleteMany({});
  await Task.deleteMany({});
  console.log('✅ All data cleared.\n');

  // 2. Create the admin account
  console.log('👤 Creating admin account...');
  const salt           = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

  const admin = new User({
    name:     ADMIN_NAME,
    email:    ADMIN_EMAIL,
    password: hashedPassword,
    role:     'Admin',
    title:    'System Administrator'
  });

  await admin.save();

  console.log('✅ Admin account created!');
  console.log('────────────────────────────────────');
  console.log(`   Name     : ${ADMIN_NAME}`);
  console.log(`   Email    : ${ADMIN_EMAIL}`);
  console.log(`   Password : ${ADMIN_PASSWORD}`);
  console.log('────────────────────────────────────');
  console.log('⚠️  Please change your password after first login!\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB. Seed complete! 🎉\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // We will encrypt this later!
  role: { 
    type: String, 
    enum: ['Admin', 'Sales'], // The two access levels
    default: 'Sales' 
  },
  title: { type: String, default: 'Agent' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
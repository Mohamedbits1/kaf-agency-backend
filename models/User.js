const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['Admin', 'Sales', 'Manager', 'Designer', 'Developer', 'Finance', 'HR', 'Other'],
    default: 'Sales' 
  },
  title: { type: String, default: 'Agent' }, // Free-form job title e.g. "Senior Sales Rep"
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
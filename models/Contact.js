const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: false },
  phone: { type: String, required: false }, 
  service: { type: String, required: false, default: 'General Inquiry' },
  message: { type: String, required: false },
  status: { 
    type: String, 
    enum: ['New Lead', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed - Won', 'Closed - Lost'],
    default: 'New Lead' 
  },
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  value: { type: Number, default: 0 },
  source: { type: String, default: 'Website' },
  briefAnswers: { type: mongoose.Schema.Types.Mixed, default: null },
  socialMedia: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  additionalInfo: { type: String, default: '' },
  notes: [{
    text: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  calls: [{
    date: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }, // in minutes
    notes: { type: String },
    outcome: { type: String, enum: ['Connected', 'No Answer', 'Left Voicemail', 'Busy'], default: 'Connected' },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contact', contactSchema);
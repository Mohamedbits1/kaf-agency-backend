const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: false },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  type: { 
    type: String, 
    enum: ['Meeting', 'Call', 'Other'], 
    default: 'Meeting' 
  },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: false },
  meetingMinutes: { type: String, required: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);

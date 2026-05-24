const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Import your Database Models
const Contact = require('./models/Contact');
const User = require('./models/User');
const Project = require('./models/Project');
const Task = require('./models/Task');

// Load environment variables (.env file)
dotenv.config();

// Initialize the Express application
const app = express();

// Configure upload directory and Multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- MIDDLEWARE ---
// --- MIDDLEWARE ---
app.use(cors({
  origin: ['http://kafmarketingagency.com', 'https://kafmarketingagency.com', 'http://localhost:5173']
})); 
app.use(express.json());
app.use('/uploads', express.static(uploadDir)); 

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Database!'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));


// ==========================================
//        AUTHENTICATION API ROUTES
// ==========================================

// 1. REGISTER ROUTE (Create a new User/Admin)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, title } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

    // Encrypt the password before saving it
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'Sales', // Default to Sales if no role is provided
      title: title || 'Agent'
    });

    await newUser.save();
    res.status(201).json({ success: true, message: 'User created successfully!' });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// 2. LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Compare the typed password with the encrypted password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    // Create a secure login token that lasts for 1 day
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' }
    );

    // Send the token and user info back to React
    res.status(200).json({ success: true, token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});


// ==========================================
//             CRM API ROUTES
// ==========================================

// 1. POST ROUTE: Receive new lead from the public Contact Form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message } = req.body;

    const newContact = new Contact({
      name,
      email,
      phone,
      service,
      message,
      status: 'New Lead'
    });

    await newContact.save();
    res.status(201).json({ success: true, message: 'Message saved to CRM successfully!' });
    
  } catch (error) {
    console.error("Error saving contact:", error); 
    res.status(500).json({ success: false, message: 'Server error. Could not save message.' });
  }
});

// 1b. POST ROUTE: Receive brief questionnaire submission with optional file upload
app.post('/api/contact/brief', upload.single('logo'), async (req, res) => {
  try {
    const { name, email, phone, service, briefAnswers, socialMedia, additionalInfo } = req.body;

    let parsedBriefAnswers = null;
    if (briefAnswers) {
      try {
        parsedBriefAnswers = JSON.parse(briefAnswers);
      } catch (err) {
        parsedBriefAnswers = briefAnswers;
      }
    }

    let logoUrl = '';
    if (req.file) {
      logoUrl = `/uploads/${req.file.filename}`;
    }

    const newContact = new Contact({
      name,
      email,
      phone,
      service: service || 'General Inquiry',
      message: additionalInfo || 'Submitted via Brief Questionnaire',
      source: 'Brief Questionnaire',
      status: 'New Lead',
      briefAnswers: parsedBriefAnswers,
      socialMedia: socialMedia || '',
      logoUrl: logoUrl,
      additionalInfo: additionalInfo || ''
    });

    await newContact.save();
    res.status(201).json({ success: true, message: 'Brief questionnaire saved successfully!', data: newContact });
  } catch (error) {
    console.error("Error saving brief questionnaire:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not save brief questionnaire.' });
  }
});

// 2. GET ROUTE: Fetch all leads for the CRM Dashboard
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find()
      .populate('assignedTo', 'name email role')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: contacts });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch leads.' });
  }
});

// 3. GET ROUTE: Fetch single lead details
app.get('/api/contact/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('assignedTo', 'name email role')
      .populate('notes.createdBy', 'name')
      .populate('calls.loggedBy', 'name')
      .populate('history.changedBy', 'name');
    if (!contact) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.status(200).json({ success: true, data: contact });
  } catch (error) {
    console.error("Error fetching contact details:", error);
    res.status(500).json({ success: false, message: 'Server error fetching lead details.' });
  }
});

// 4. POST ROUTE: Add a manual lead inside the admin dashboard
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, email, phone, service, message, value, source, assignedTo } = req.body;
    const newContact = new Contact({
      name,
      email,
      phone,
      service,
      message,
      value: value || 0,
      source: source || 'Manual',
      assignedTo: assignedTo || null,
      status: 'New Lead'
    });
    await newContact.save();
    res.status(201).json({ success: true, data: newContact });
  } catch (error) {
    console.error("Error creating manual lead:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not create lead.' });
  }
});

// 5. PUT ROUTE: Update a lead's details & status in the CRM with history tracking
app.put('/api/contact/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, value, source, assignedTo, name, email, phone, service, message, userId } = req.body;

    const oldContact = await Contact.findById(id);
    if (!oldContact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const historyEntries = [];
    if (status && status !== oldContact.status) {
      historyEntries.push({
        action: `Changed status from "${oldContact.status}" to "${status}"`,
        changedBy: userId || null
      });
    }
    if (assignedTo !== undefined && String(assignedTo) !== String(oldContact.assignedTo)) {
      historyEntries.push({
        action: `Reassigned lead`,
        changedBy: userId || null
      });
    }

    const updateFields = {
      status: status !== undefined ? status : oldContact.status,
      value: value !== undefined ? value : oldContact.value,
      source: source !== undefined ? source : oldContact.source,
      assignedTo: assignedTo !== undefined ? (assignedTo === '' ? null : assignedTo) : oldContact.assignedTo,
      name: name !== undefined ? name : oldContact.name,
      email: email !== undefined ? email : oldContact.email,
      phone: phone !== undefined ? phone : oldContact.phone,
      service: service !== undefined ? service : oldContact.service,
      message: message !== undefined ? message : oldContact.message
    };

    const updatedContact = await Contact.findByIdAndUpdate(
      id, 
      { 
        $set: updateFields,
        $push: { history: { $each: historyEntries } }
      }, 
      { new: true }
    ).populate('assignedTo', 'name email role');

    res.status(200).json({ success: true, data: updatedContact });
  } catch (error) {
    console.error("Error updating lead status:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not update lead.' });
  }
});

// 6. POST ROUTE: Add a note to a lead
app.post('/api/contact/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, userId } = req.body;
    if (!text || !userId) return res.status(400).json({ success: false, message: 'Text and userId are required' });

    const contact = await Contact.findByIdAndUpdate(
      id,
      { 
        $push: { 
          notes: { text, createdBy: userId },
          history: { action: 'Added a note', changedBy: userId }
        } 
      },
      { new: true }
    ).populate('notes.createdBy', 'name');

    res.status(201).json({ success: true, data: contact.notes });
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not add note.' });
  }
});

// 7. POST ROUTE: Log a follow-up call for a lead
app.post('/api/contact/:id/calls', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, notes, outcome, userId, date } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const newCall = {
      date: date || Date.now(),
      duration: duration || 0,
      notes: notes || '',
      outcome: outcome || 'Connected',
      loggedBy: userId
    };

    const contact = await Contact.findByIdAndUpdate(
      id,
      { 
        $push: { 
          calls: newCall,
          history: { action: `Logged a call: ${outcome}`, changedBy: userId }
        } 
      },
      { new: true }
    ).populate('calls.loggedBy', 'name');

    res.status(201).json({ success: true, data: contact.calls });
  } catch (error) {
    console.error("Error logging call:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not log call.' });
  }
});

// ==========================================
//            PROJECT API ROUTES
// ==========================================

// 1. GET ALL PROJECTS
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('client', 'name email phone service')
      .populate('manager', 'name email role')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ success: false, message: 'Server error fetching projects.' });
  }
});

// 2. CREATE A NEW PROJECT (Usually triggered from winning a lead)
app.post('/api/projects', async (req, res) => {
  try {
    const { name, client, manager, status, description, startDate, endDate, budget } = req.body;
    const newProject = new Project({
      name,
      client,
      manager: manager || null,
      status: status || 'Not Started',
      description,
      startDate,
      endDate,
      budget: budget || 0
    });
    await newProject.save();

    // Auto-update the lead status to "Closed - Won"
    await Contact.findByIdAndUpdate(client, { status: 'Closed - Won' });

    res.status(201).json({ success: true, data: newProject });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ success: false, message: 'Server error creating project.' });
  }
});

// 3. UPDATE A PROJECT
app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = await Project.findByIdAndUpdate(id, req.body, { new: true })
      .populate('client', 'name email phone service')
      .populate('manager', 'name email role');
    res.status(200).json({ success: true, data: updatedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ success: false, message: 'Server error updating project.' });
  }
});

// ==========================================
//             TASK API ROUTES
// ==========================================

// 1. GET TASKS (Optionally filtered by project or assignee)
app.get('/api/tasks', async (req, res) => {
  try {
    const { project, assignee } = req.query;
    const query = {};
    if (project) query.project = project;
    if (assignee) query.assignee = assignee;

    const tasks = await Task.find(query)
      .populate('project', 'name status client')
      .populate('assignee', 'name email role')
      .populate('comments.createdBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ success: false, message: 'Server error fetching tasks.' });
  }
});

// 2. CREATE A TASK
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, project, assignee, status, priority, dueDate } = req.body;
    const newTask = new Task({
      title,
      description,
      project,
      assignee: assignee || null,
      status: status || 'Todo',
      priority: priority || 'Medium',
      dueDate
    });
    await newTask.save();
    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ success: false, message: 'Server error creating task.' });
  }
});

// 3. UPDATE A TASK
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedTask = await Task.findByIdAndUpdate(id, req.body, { new: true })
      .populate('project', 'name status client')
      .populate('assignee', 'name email role')
      .populate('comments.createdBy', 'name');
    res.status(200).json({ success: true, data: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ success: false, message: 'Server error updating task.' });
  }
});

// 4. POST A TASK COMMENT
app.post('/api/tasks/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, userId } = req.body;
    if (!text || !userId) return res.status(400).json({ success: false, message: 'Text and userId are required' });

    const task = await Task.findByIdAndUpdate(
      id,
      { $push: { comments: { text, createdBy: userId } } },
      { new: true }
    ).populate('comments.createdBy', 'name');

    res.status(201).json({ success: true, data: task.comments });
  } catch (error) {
    console.error("Error adding task comment:", error);
    res.status(500).json({ success: false, message: 'Server error adding comment.' });
  }
});

// ==========================================
//         ANALYTICS & STATS ROUTES
// ==========================================

// 1. GET GLOBAL DASHBOARD STATISTICS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalLeads = await Contact.countDocuments();
    const closedWonLeads = await Contact.countDocuments({ status: 'Closed - Won' });
    const winRate = totalLeads > 0 ? ((closedWonLeads / totalLeads) * 100).toFixed(1) : 0;

    const leads = await Contact.find();
    const totalPipelineValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const wonRevenue = leads
      .filter(lead => lead.status === 'Closed - Won')
      .reduce((sum, lead) => sum + (lead.value || 0), 0);

    const stages = ['New Lead', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed - Won', 'Closed - Lost'];
    const stageCounts = {};
    for (const stage of stages) {
      stageCounts[stage] = leads.filter(lead => lead.status === stage).length;
    }

    const sources = {};
    leads.forEach(lead => {
      const src = lead.source || 'Website';
      sources[src] = (sources[src] || 0) + 1;
    });

    const totalProjects = await Project.countDocuments();
    const activeProjects = await Project.countDocuments({ status: 'In Progress' });
    const completedProjects = await Project.countDocuments({ status: 'Completed' });

    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: 'Completed' });

    let allCalls = [];
    leads.forEach(lead => {
      if (lead.calls && lead.calls.length > 0) {
        lead.calls.forEach(call => {
          allCalls.push({
            leadId: lead._id,
            leadName: lead.name,
            date: call.date,
            notes: call.notes,
            outcome: call.outcome,
            duration: call.duration
          });
        });
      }
    });
    allCalls.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentCalls = allCalls.slice(0, 5);

    res.status(200).json({
      success: true,
      data: {
        totalLeads,
        closedWonLeads,
        winRate,
        totalPipelineValue,
        wonRevenue,
        stageCounts,
        sourceCounts: sources,
        projects: {
          total: totalProjects,
          active: activeProjects,
          completed: completedProjects
        },
        tasks: {
          total: totalTasks,
          completed: completedTasks
        },
        recentCalls
      }
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ success: false, message: 'Server error fetching dashboard stats.' });
  }
});

// GET Route: Fetch all team members for the Admin Panel
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch users.' });
  }
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is up and running on port ${PORT}`);
});
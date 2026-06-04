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
const Notification = require('./models/Notification');
const Company = require('./models/Company');
const Event = require('./models/Event');

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
  origin: ['http://kafmarketingagency.com', 'https://kafmarketingagency.com', 'http://www.kafmarketingagency.com', 'https://www.kafmarketingagency.com', 'http://localhost:5173', 'http://localhost:5174']
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
    const { name, password, role, title } = req.body;
    const email = req.body.email.toLowerCase().trim();

    // Check if user already exists (case insensitive)
    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
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
    const normalizedEmail = email.toLowerCase().trim();

    // Find the user by email (case insensitive)
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
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
      status: 'Inbox'
    });

    await newContact.save();

    // Notify all Admins and Managers
    const admins = await User.find({ role: { $in: ['Admin', 'Manager'] } });
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    for (const admin of admins) {
      await dispatchNotification(admin._id, null, 'New Message', 'New Website Message', `New message from ${name}`, '/admin/inbox', io, connectedUsers);
    }

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
      status: 'Inbox',
      briefAnswers: parsedBriefAnswers,
      socialMedia: socialMedia || '',
      logoUrl: logoUrl,
      additionalInfo: additionalInfo || ''
    });

    await newContact.save();

    // Notify all Admins and Managers
    const admins = await User.find({ role: { $in: ['Admin', 'Manager'] } });
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    for (const admin of admins) {
      await dispatchNotification(admin._id, null, 'New Brief', 'New Client Brief', `New brief from ${name}`, '/admin/inbox', io, connectedUsers);
    }

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
      .populate('company', 'name website')
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
      .populate('company')
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
    const { name, email, phone, service, message, value, source, assignedTo, companyName } = req.body;
    
    let companyId = null;
    if (companyName && companyName.trim() !== '') {
      let company = await Company.findOne({ name: { $regex: new RegExp(`^${companyName.trim()}$`, 'i') } });
      if (!company) {
        company = new Company({ name: companyName.trim() });
        await company.save();
      }
      companyId = company._id;
    }

    const newContact = new Contact({
      name,
      email,
      phone,
      service,
      message,
      value: value || 0,
      source: source || 'Manual',
      assignedTo: assignedTo || null,
      company: companyId,
      companyName: companyName ? companyName.trim() : '',
      status: 'New Lead'
    });
    await newContact.save();
    res.status(201).json({ success: true, data: newContact });
  } catch (error) {
    console.error("Error creating manual lead:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not create lead.' });
  }
});

// 4b. POST ROUTE: Merge an Inbox message/brief into an existing Lead
app.post('/api/contact/:id/merge', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetLeadId, userId } = req.body;
    
    if (!targetLeadId || !userId) {
      return res.status(400).json({ success: false, message: 'Target Lead ID and User ID are required.' });
    }

    const inboxMessage = await Contact.findById(id);
    if (!inboxMessage) return res.status(404).json({ success: false, message: 'Inbox message not found.' });
    
    const targetLead = await Contact.findById(targetLeadId);
    if (!targetLead) return res.status(404).json({ success: false, message: 'Target lead not found.' });

    // Append inbox data as a note to target lead
    let noteText = `Merged from Inbox:\nSource: ${inboxMessage.source}\nEmail: ${inboxMessage.email || 'N/A'}\nPhone: ${inboxMessage.phone || 'N/A'}\nMessage: ${inboxMessage.message || 'None'}`;
    
    if (inboxMessage.briefAnswers) {
      noteText += `\nBrief Answers: Attached.`;
      // Optionally merge briefAnswers if target doesn't have them
      if (!targetLead.briefAnswers) {
        targetLead.briefAnswers = inboxMessage.briefAnswers;
      }
    }

    targetLead.notes.push({ text: noteText, createdBy: userId });
    targetLead.history.push({ action: 'Merged message from Inbox', changedBy: userId });
    
    await targetLead.save();
    
    // Delete the inbox message
    await Contact.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: 'Message merged successfully!' });
  } catch (error) {
    console.error("Error merging message:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not merge message.' });
  }
});

// 5. PUT ROUTE: Update a lead's details & status in the CRM with history tracking
app.put('/api/contact/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, value, source, assignedTo, name, email, phone, service, message, userId, companyName, companyId } = req.body;

    const oldContact = await Contact.findById(id);
    if (!oldContact) return res.status(404).json({ success: false, message: 'Contact not found' });

    let finalCompanyId = oldContact.company;
    let finalCompanyName = oldContact.companyName;

    // Handle company assignment or creation
    if (companyId !== undefined) {
      finalCompanyId = companyId === '' ? null : companyId;
      if (companyId) {
        const c = await Company.findById(companyId);
        if (c) finalCompanyName = c.name;
      } else {
        finalCompanyName = '';
      }
    } else if (companyName !== undefined && companyName.trim() !== '') {
      let company = await Company.findOne({ name: { $regex: new RegExp(`^${companyName.trim()}$`, 'i') } });
      if (!company) {
        company = new Company({ name: companyName.trim() });
        await company.save();
      }
      finalCompanyId = company._id;
      finalCompanyName = company.name;
    }

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
      message: message !== undefined ? message : oldContact.message,
      company: finalCompanyId,
      companyName: finalCompanyName
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

// 5b. DELETE ROUTE: Delete a lead
app.delete('/api/contact/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Contact.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Lead deleted successfully.' });
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not delete lead.' });
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
//             COMPANY API ROUTES
// ==========================================

// 1. GET ALL COMPANIES
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: companies });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ success: false, message: 'Server error fetching companies.' });
  }
});

// 2. CREATE COMPANY
app.post('/api/companies', async (req, res) => {
  try {
    const { name, details, website, linkedLeads } = req.body;
    let company = await Company.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (company) {
      return res.status(400).json({ success: false, message: 'Company already exists' });
    }
    company = new Company({ name: name.trim(), details, website });
    await company.save();

    if (Array.isArray(linkedLeads) && linkedLeads.length > 0) {
      await Contact.updateMany(
        { _id: { $in: linkedLeads } },
        { $set: { companyName: company.name } }
      );
    }

    res.status(201).json({ success: true, data: company });
  } catch (error) {
    console.error("Error creating company:", error);
    res.status(500).json({ success: false, message: 'Server error creating company.' });
  }
});

// 3. UPDATE COMPANY
app.put('/api/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { linkedLeads, ...companyData } = req.body;

    const oldCompany = await Company.findById(id);
    const updatedCompany = await Company.findByIdAndUpdate(id, companyData, { new: true });

    if (oldCompany.name !== updatedCompany.name) {
      await Contact.updateMany(
        { companyName: oldCompany.name },
        { $set: { companyName: updatedCompany.name } }
      );
    }

    if (Array.isArray(linkedLeads)) {
      await Contact.updateMany(
        { companyName: updatedCompany.name, _id: { $nin: linkedLeads } },
        { $set: { companyName: '' } }
      );
      await Contact.updateMany(
        { _id: { $in: linkedLeads } },
        { $set: { companyName: updatedCompany.name } }
      );
    }

    res.status(200).json({ success: true, data: updatedCompany });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({ success: false, message: 'Server error updating company.' });
  }
});

// 4. DELETE COMPANY
app.delete('/api/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Company.findByIdAndDelete(id);
    // Remove company reference from contacts
    await Contact.updateMany({ company: id }, { $set: { company: null, companyName: '' } });
    res.status(200).json({ success: true, message: 'Company deleted successfully.' });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ success: false, message: 'Server error deleting company.' });
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

    // Notify Admins/Managers
    const admins = await User.find({ role: { $in: ['Admin', 'Manager'] } });
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    for (const admin of admins) {
      await dispatchNotification(admin._id, null, 'New Project', 'New Project Created', `Project: ${name}`, '/admin/projects', io, connectedUsers);
    }

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

// 4. DELETE A PROJECT
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Project.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Project deleted successfully.' });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ success: false, message: 'Server error deleting project.' });
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

    // Notify Assignee
    if (assignee) {
      const io = req.app.get('io');
      const connectedUsers = req.app.get('connectedUsers');
      await dispatchNotification(assignee, null, 'New Task', 'New Task Assigned', `You have been assigned: ${title}`, '/admin/tasks', io, connectedUsers);
    }

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
  app.post('/api/tasks/:id/comments', upload.single('attachment'), async (req, res) => {
    try {
      const { id } = req.params;
      const { text, userId } = req.body;
      
      let attachmentUrl = null;
      if (req.file) {
        attachmentUrl = `/uploads/${req.file.filename}`;
      }

      if (!text && !attachmentUrl) {
        return res.status(400).json({ success: false, message: 'Comment text or attachment is required' });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
      }
  
      const commentData = { createdBy: userId };
      if (text) commentData.text = text;
      if (attachmentUrl) commentData.attachmentUrl = attachmentUrl;

      const task = await Task.findByIdAndUpdate(
        id,
        { $push: { comments: commentData } },
        { new: true }
      ).populate('comments.createdBy', 'name');
  
      const io = req.app.get('io');
      const connectedUsers = req.app.get('connectedUsers');
      
      // Notify Assignee if they are not the commenter
      if (task.assignee && task.assignee.toString() !== userId) {
        await dispatchNotification(task.assignee, userId, 'Task Update', 'New Comment on Task', `New comment on: ${task.title}`, '/admin/tasks', io, connectedUsers);
      }

      // Handle Mentions: Extract @UserName
      if (text) {
        // e.g., @Ahmed or @JaneDoe
        const mentionRegex = /@([\p{L}\p{N}_.-]+)/gu;
        let match;
        const mentionedNames = [];
        while ((match = mentionRegex.exec(text)) !== null) {
          mentionedNames.push(match[1]);
        }
        
        if (mentionedNames.length > 0) {
          // Find any users whose name starts with these words (case insensitive)
          const nameRegexes = mentionedNames.map(name => new RegExp(`^${name}`, 'i'));
          const mentionedUsers = await User.find({ name: { $in: nameRegexes } });
          
          for (const mUser of mentionedUsers) {
            // Don't notify the commenter themselves
            if (mUser._id.toString() !== userId) {
              await dispatchNotification(mUser._id, userId, 'Mention', 'You were mentioned', `You were mentioned in task: ${task.title}`, '/admin/tasks', io, connectedUsers);
            }
          }
        }
      }

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

// PUT Route: Update a team member (role, title, name, password)
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, title, password } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (email !== undefined) updateFields.email = email;
    if (role !== undefined) updateFields.role = role;
    if (title !== undefined) updateFields.title = title;

    // If a new password is provided, hash it before saving
    if (password && password.length >= 6) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateFields, { new: true }).select('-password');
    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.status(200).json({ success: true, data: updatedUser, message: 'User updated successfully.' });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not update user.' });
  }
});

// DELETE Route: Remove a team member
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not delete user.' });
  }
});

// ==========================================
//          NOTIFICATIONS API ROUTES
// ==========================================

// GET Route: Fetch all notifications for a specific user
app.get('/api/notifications', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

    const notifications = await Notification.find({ recipient: userId })
      .populate('sender', 'name')
      .sort({ createdAt: -1 })
      .limit(50); // Get latest 50
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch notifications.' });
  }
});

// PUT Route: Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(id, { isRead: true }, { new: true });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* -------------------------------------------------------------------------- */
/*                        EVENT & CALENDAR ROUTES                             */
/* -------------------------------------------------------------------------- */

// Unified Calendar Feed (Events + Tasks + Projects)
app.get('/api/calendar', async (req, res) => {
  try {
    // Fetch normal events
    const events = await Event.find().populate('attendees', 'name email').populate('relatedLead', 'name companyName');
    
    // Fetch Tasks with dueDates
    const tasks = await Task.find({ dueDate: { $ne: null } }).populate('assignee', 'name');
    
    // Fetch Projects with endDates
    const projects = await Project.find({ endDate: { $ne: null } });

    // Normalize to a single array
    const calendarItems = [];

    events.forEach(e => {
      calendarItems.push({
        _id: e._id,
        title: e.title,
        start: e.start,
        end: e.end,
        type: e.type, // 'Meeting'
        description: e.description,
        attendees: e.attendees,
        relatedLead: e.relatedLead,
        meetingMinutes: e.meetingMinutes,
        createdBy: e.createdBy
      });
    });

    tasks.forEach(t => {
      calendarItems.push({
        _id: t._id,
        title: `Task Deadline: ${t.title}`,
        start: t.dueDate,
        end: t.dueDate,
        type: 'Task Deadline',
        description: t.description,
        status: t.status,
        assignee: t.assignee
      });
    });

    projects.forEach(p => {
      calendarItems.push({
        _id: p._id,
        title: `Project Deadline: ${p.name}`,
        start: p.endDate,
        end: p.endDate,
        type: 'Project Deadline',
        status: p.status
      });
    });

    res.json({ success: true, data: calendarItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find()
      .populate('attendees', 'name email')
      .populate('relatedLead', 'name companyName')
      .sort({ start: 1 });
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create Event
app.post('/api/events', async (req, res) => {
  try {
    const { title, description, start, end, type, attendees, relatedLead, userId } = req.body;
    
    // Find a fallback user if userId is not provided
    let creatorId = userId;
    if (!creatorId) {
      const defaultUser = await User.findOne();
      creatorId = defaultUser ? defaultUser._id : null;
    }

    const newEvent = new Event({
      title,
      description,
      start,
      end,
      type: type || 'Meeting',
      attendees: attendees || [],
      relatedLead: relatedLead || null,
      createdBy: creatorId
    });
    
    await newEvent.save();
    
    const populated = await Event.findById(newEvent._id)
      .populate('attendees', 'name')
      .populate('relatedLead', 'name');
      
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create event' });
  }
});

// Update Meeting Minutes
app.put('/api/events/:id/minutes', async (req, res) => {
  try {
    const { meetingMinutes } = req.body;
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { meetingMinutes },
      { new: true }
    ).populate('attendees', 'name').populate('relatedLead', 'name companyName');
    
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update minutes' });
  }
});

// Helper function to dispatch notifications
const dispatchNotification = async (recipientId, senderId, type, title, message, link, io, connectedUsers) => {
  try {
    const notif = new Notification({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      message,
      link
    });
    await notif.save();
    
    // Find populated sender name for real-time emit
    const populatedNotif = await Notification.findById(notif._id).populate('sender', 'name');

    // Emit if user is connected
    const socketId = connectedUsers.get(recipientId.toString());
    if (socketId && io) {
      io.to(socketId).emit('notification', populatedNotif);
    }
  } catch (error) {
    console.error('Error dispatching notification:', error);
  }
};


// --- SERVER STARTUP ---
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.set('io', io);

// Connected users map
const connectedUsers = new Map();
app.set('connectedUsers', connectedUsers);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on('register', (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is up and running on port ${PORT}`);
});
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Multer setup for feedback image uploads
const feedbackStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const feedbackUpload = multer({ storage: feedbackStorage });

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Application Schema
const applicationSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  program: String,
  experience: String,
  motivation: String,
  resume: String, // File path
  createdAt: { type: Date, default: Date.now },
});

const Application = mongoose.model('Application', applicationSchema);

// Certificate Schema
const certificateSchema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true },
  studentName: String,
  course: String,
  issueDate: String,
  expiryDate: String,
  grade: String,
  skills: [String],
  msmeRegistered: Boolean,
});
const Certificate = mongoose.model('Certificate', certificateSchema);

// Feedback Schema
const feedbackSchema = new mongoose.Schema({
  name: String,
  role: String,
  company: String,
  quote: String,
  badges: [String],
  rating: Number,
  linkedin: String,
  image: String,
  createdAt: { type: Date, default: Date.now },
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// POST /api/apply (with file upload)
app.post('/api/apply', upload.single('resume'), async (req, res) => {
  try {
    const data = req.body;
    const resumePath = req.file ? `/uploads/${req.file.filename}` : '';
    const application = new Application({ ...data, resume: resumePath });
    await application.save();

    // Send notification email
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: 'New Application Received',
      text: `A new application has been submitted.\n\nName: ${data.firstName} ${data.lastName}\nEmail: ${data.email}\nPhone: ${data.phone}\nProgram: ${data.program}\nExperience: ${data.experience}\nMotivation: ${data.motivation}\nResume: ${resumePath ? 'Attached' : 'Not provided'}`,
      attachments: req.file ? [{ filename: req.file.originalname, path: req.file.path }] : [],
    };
    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'Application submitted successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
});

// GET /api/verify-certificate?certificateId=IGN-2024-001
app.get('/api/verify-certificate', async (req, res) => {
  const { certificateId } = req.query;
  if (!certificateId) {
    return res.status(400).json({ error: 'certificateId is required' });
  }
  const cert = await Certificate.findOne({ certificateId });
  if (cert) {
    res.json({ valid: true, ...cert.toObject() });
  } else {
    res.json({ valid: false, id: certificateId });
  }
});

// POST /api/admin/upload-certificates
app.post('/api/admin/upload-certificates', async (req, res) => {
  try {
    const certs = req.body;
    if (!Array.isArray(certs)) {
      return res.status(400).json({ error: 'Expected an array of certificates.' });
    }
    await Certificate.insertMany(certs, { ordered: false });
    res.json({ message: 'Certificates uploaded successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload certificates.' });
  }
});

// POST /api/contact
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: `Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      replyTo: email,
    });
    res.json({ message: 'Message sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// POST /api/feedback (with image upload)
app.post('/api/feedback', feedbackUpload.single('image'), async (req, res) => {
  let { name, role, quote, badges, rating, linkedin } = req.body;
  if (!name || !role || !quote) {
    return res.status(400).json({ error: 'Name, role, and quote are required.' });
  }
  try {
    name = toTitleCase(name.trim());
    role = toTitleCase(role.trim());
    const company = 'IgnitAI';
    const image = req.file ? `/uploads/${req.file.filename}` : '';
    const feedback = new Feedback({
      name,
      role,
      company,
      quote,
      badges: Array.isArray(badges) ? badges : (typeof badges === 'string' ? badges.split(',').map(b => b.trim()) : []),
      rating: Number(rating) || 5,
      linkedin: linkedin || '',
      image,
    });
    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

// GET /api/feedback
app.get('/api/feedback', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedbacks.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
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
//new change
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

// AI Interview - In-memory storage (no database needed)
const activeInterviews = new Map();

const questionBanks = {
  frontend: [
    "What interests you most about creating user interfaces and web experiences?",
    "How would you approach learning React and modern JavaScript?",
    "Describe a website or app you admire and what makes it special.",
    "What motivates you to pursue frontend development?",
    "How do you handle challenges when learning new technologies?"
  ],
  backend: [
    "What interests you about server-side development and APIs?",
    "How would you approach learning Node.js and databases?",
    "Describe a backend system or API you find interesting.",
    "What motivates you to pursue backend development?",
    "How do you approach problem-solving in technical projects?"
  ],
  fullstack: [
    "What interests you about full-stack development?",
    "How would you approach learning both frontend and backend technologies?",
    "Describe a complete application you'd like to build.",
    "What motivates you to pursue full-stack development?",
    "How do you manage learning multiple technologies at once?"
  ]
};

const calculateScore = (answers, courseTrack) => {
  let score = 50;
  const keywords = {
    frontend: ['react', 'javascript', 'ui', 'ux', 'design', 'user', 'interface', 'css', 'html'],
    backend: ['api', 'database', 'server', 'node', 'express', 'mongodb', 'sql', 'backend'],
    fullstack: ['fullstack', 'complete', 'both', 'frontend', 'backend', 'full', 'stack', 'end-to-end']
  };
  
  const trackKeywords = keywords[courseTrack] || [];
  
  answers.forEach(answer => {
    const lowerAnswer = answer.toLowerCase();
    if (answer.length > 50) score += 5;
    if (answer.length > 100) score += 5;
    
    const foundKeywords = trackKeywords.filter(keyword => lowerAnswer.includes(keyword));
    score += foundKeywords.length * 3;
    
    const enthusiasmWords = ['excited', 'passionate', 'love', 'enjoy', 'interested', 'motivated'];
    const foundEnthusiasm = enthusiasmWords.filter(word => lowerAnswer.includes(word));
    score += foundEnthusiasm.length * 2;
  });
  
  return Math.min(Math.max(score, 20), 100);
};

const generateFeedback = (score, answers, courseTrack) => {
  const courseNames = {
    frontend: 'Frontend Development',
    backend: 'Backend Development',
    fullstack: 'Fullstack Development'
  };
  
  let strengths = [];
  let improvements = [];
  let feedback = '';
  
  if (score >= 80) {
    strengths = ['Strong communication skills', 'Clear learning goals', 'Good technical awareness'];
    improvements = ['Continue building projects', 'Join developer communities'];
    feedback = `Excellent! You show strong potential for ${courseNames[courseTrack]}. Your responses demonstrate clear goals and good technical understanding.`;
  } else if (score >= 60) {
    strengths = ['Good motivation', 'Willingness to learn', 'Basic understanding'];
    improvements = ['Build more hands-on projects', 'Practice technical concepts', 'Engage with coding communities'];
    feedback = `Great start! You have good motivation for ${courseNames[courseTrack]}. Focus on hands-on practice to strengthen your foundation.`;
  } else {
    strengths = ['Interest in technology', 'Willingness to start learning'];
    improvements = ['Start with basics', 'Practice regularly', 'Build simple projects', 'Join beginner-friendly communities'];
    feedback = `Good foundation! ${courseNames[courseTrack]} is perfect for building your skills from the ground up. Start with fundamentals and practice consistently.`;
  }
  
  return { strengths, improvements, feedback, recommendedCourse: courseNames[courseTrack] };
};

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
  let { name, role, company, quote, badges, rating, linkedin } = req.body;
  if (!name || !role || !quote) {
    return res.status(400).json({ error: 'Name, role, and quote are required.' });
  }
  try {
    name = toTitleCase(name.trim());
    role = toTitleCase(role.trim());
    company = company ? toTitleCase(company.trim()) : 'Ignivance';
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

// AI Interview Routes

// POST /api/ai-interview/start
app.post('/api/ai-interview/start', (req, res) => {
  try {
    const { courseTrack } = req.body;
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    activeInterviews.set(sessionId, {
      courseTrack,
      answers: [],
      startTime: new Date(),
      questions: questionBanks[courseTrack] || questionBanks.fullstack
    });
    
    // Auto-cleanup after 1 hour
    setTimeout(() => activeInterviews.delete(sessionId), 60 * 60 * 1000);
    
    res.json({
      sessionId,
      questions: questionBanks[courseTrack] || questionBanks.fullstack
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// POST /api/ai-interview/submit-answer
app.post('/api/ai-interview/submit-answer', (req, res) => {
  try {
    const { sessionId, answer, questionIndex } = req.body;
    const session = activeInterviews.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.answers[questionIndex] = answer;
    
    res.json({
      analysis: { length: answer.length, wordCount: answer.split(' ').length },
      nextQuestion: questionIndex + 1 < session.questions.length ? questionIndex + 1 : null
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// GET /api/ai-interview/results/:sessionId
app.get('/api/ai-interview/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeInterviews.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const score = calculateScore(session.answers, session.courseTrack);
    const feedbackData = generateFeedback(score, session.answers, session.courseTrack);
    
    const results = { score, ...feedbackData };
    activeInterviews.delete(sessionId); // Clean up session
    
    res.json(results);
  } catch (error) {
    console.error('Error getting results:', error);
    res.status(500).json({ error: 'Failed to get results' });
  }
});

// GET /api/ai-interview/stats (optional - for monitoring)
app.get('/api/ai-interview/stats', (req, res) => {
  res.json({
    activeSessions: activeInterviews.size,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
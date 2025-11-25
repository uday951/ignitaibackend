require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

// AI Quiz Generator Routes
const generateQuizWithGemini = async (topics) => {
  try {
    const topicString = topics.join(' and ');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Generate MCQs with randomization
    const randomSeed = Math.floor(Math.random() * 10000);
    const mcqPrompt = `You are an expert web developer. Generate 10 DIVERSE and UNIQUE MCQs on ${topicString}. 
RANDOM SEED: ${randomSeed}

Cover these areas randomly:
- Basic syntax and elements
- Advanced concepts and properties
- Best practices and common mistakes
- Browser compatibility and modern features
- Accessibility and semantic markup
- Performance optimization
- Responsive design concepts

Return JSON only, EXACT format:
[
{
"question": "",
"options": ["", "", "", ""],
"correct": ""
}
]
No explanations. No extra text. No markdown.
Ensure ALL questions are COMPLETELY DIFFERENT from typical basic questions.`;
    
    const mcqResult = await model.generateContent(mcqPrompt);
    const mcqResponse = mcqResult.response;
    let mcqText = mcqResponse.text();
    
    // Clean the response
    mcqText = mcqText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Generate Coding Tasks with variety
    const codingRandomSeed = Math.floor(Math.random() * 10000);
    const codingPrompt = `Generate 3 CREATIVE and DIVERSE HTML/CSS coding tasks for ${topicString}.
RANDOM SEED: ${codingRandomSeed}

Vary the difficulty and focus areas:
- Layout and positioning
- Styling and visual effects
- Forms and interactive elements
- Responsive design
- Animations and transitions
- Semantic HTML structure

Return JSON in this exact format:
[
{
"question": "",
"expectedHTML": ""
}
]
The 'expectedHTML' must be fully valid HTML/CSS.
Make each task UNIQUE and CREATIVE. No basic button/div examples.
No explanations. No markdown.`;
    
    const codingResult = await model.generateContent(codingPrompt);
    const codingResponse = codingResult.response;
    let codingText = codingResponse.text();
    
    // Clean the response
    codingText = codingText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const mcqs = JSON.parse(mcqText);
      const coding = JSON.parse(codingText);
      return { mcqs, coding };
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      throw new Error('Invalid response format from AI');
    }
    
  } catch (error) {
    console.error('Error generating quiz with Gemini:', error);
    
    // Fallback to mock data
    const mockMCQs = [
      {
        question: "Which HTML tag is used to create a hyperlink?",
        options: ["<link>", "<a>", "<href>", "<url>"],
        correct: "<a>"
      },
      {
        question: "What does CSS stand for?",
        options: ["Computer Style Sheets", "Creative Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets"],
        correct: "Cascading Style Sheets"
      },
      {
        question: "Which CSS property is used to change the text color?",
        options: ["color", "text-color", "font-color", "text-style"],
        correct: "color"
      },
      {
        question: "What is the correct HTML element for the largest heading?",
        options: ["<h6>", "<heading>", "<h1>", "<header>"],
        correct: "<h1>"
      },
      {
        question: "Which CSS property controls the text size?",
        options: ["font-style", "text-size", "font-size", "text-style"],
        correct: "font-size"
      },
      {
        question: "What is the correct HTML for creating a checkbox?",
        options: ['<input type="check">', '<input type="checkbox">', '<checkbox>', '<check>'],
        correct: '<input type="checkbox">'
      },
      {
        question: "Which CSS property is used to make text bold?",
        options: ["font-weight", "text-bold", "font-style", "text-weight"],
        correct: "font-weight"
      },
      {
        question: "What does HTML stand for?",
        options: ["Hyper Text Markup Language", "Home Tool Markup Language", "Hyperlinks Text Mark Language", "Hyper Text Making Language"],
        correct: "Hyper Text Markup Language"
      },
      {
        question: "Which HTML attribute specifies an alternate text for an image?",
        options: ["title", "alt", "src", "longdesc"],
        correct: "alt"
      },
      {
        question: "How do you select an element with id 'demo' in CSS?",
        options: ["#demo", ".demo", "demo", "*demo"],
        correct: "#demo"
      }
    ];
    
    const mockCoding = [
      {
        question: "Create a red button with white text that says 'Click Me'",
        expectedHTML: '<button style="background-color: red; color: white; padding: 10px 20px; border: none; border-radius: 5px;">Click Me</button>'
      },
      {
        question: "Create a div with blue background and centered text 'Hello World'",
        expectedHTML: '<div style="background-color: blue; color: white; text-align: center; padding: 20px;">Hello World</div>'
      },
      {
        question: "Create an unordered list with 3 items: Apple, Banana, Orange",
        expectedHTML: '<ul><li>Apple</li><li>Banana</li><li>Orange</li></ul>'
      }
    ];
    
    return { mcqs: mockMCQs, coding: mockCoding };
  }
};

const compareHTML = (userCode, expectedHTML) => {
  try {
    const userDOM = new JSDOM(userCode);
    const expectedDOM = new JSDOM(expectedHTML);
    
    const userBody = userDOM.window.document.body.innerHTML.trim().toLowerCase();
    const expectedBody = expectedDOM.window.document.body.innerHTML.trim().toLowerCase();
    
    // Simple comparison - in production, you'd want more sophisticated matching
    const similarity = userBody.includes(expectedBody.replace(/<[^>]*>/g, '')) || 
                      expectedBody.includes(userBody.replace(/<[^>]*>/g, ''));
    
    return { correct: similarity };
  } catch (error) {
    return { correct: false };
  }
};

// POST /api/quiz/generate
app.post('/api/quiz/generate', async (req, res) => {
  try {
    const { topics } = req.body;
    
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Topics array is required' });
    }
    
    const quiz = await generateQuizWithGemini(topics);
    res.json(quiz);
  } catch (error) {
    console.error('Error generating quiz:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// POST /api/quiz/check-code
app.post('/api/quiz/check-code', async (req, res) => {
  try {
    const { userCode, expectedHTML } = req.body;
    
    if (!userCode || !expectedHTML) {
      return res.status(400).json({ error: 'userCode and expectedHTML are required' });
    }
    
    const result = compareHTML(userCode, expectedHTML);
    res.json(result);
  } catch (error) {
    console.error('Error checking code:', error);
    res.status(500).json({ error: 'Failed to check code' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
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

// Real AI Interview Routes with Advanced Features

const realInterviewQuestions = {
  // Round 1: Technical Basics
  round1: {
    React: [
      "What is the difference between functional and class components in React?",
      "Explain the concept of React hooks and give examples.",
      "How does the virtual DOM work in React?"
    ],
    'Node.js': [
      "What is the event loop in Node.js and how does it work?",
      "Explain the difference between synchronous and asynchronous programming.",
      "What are middleware functions in Express.js?"
    ],
    'MERN Stack': [
      "Explain the MERN stack architecture.",
      "How do you handle state management in a MERN application?",
      "What is the role of MongoDB in the MERN stack?"
    ]
  },
  // Round 2: Problem Solving
  round2: {
    React: [
      "How would you optimize a React application that's rendering slowly?",
      "Design a component that fetches data from an API and handles loading states."
    ],
    'Node.js': [
      "How would you handle file uploads in a Node.js application?",
      "Design a REST API for a simple blog application."
    ],
    'MERN Stack': [
      "How would you implement user authentication in a MERN application?",
      "Design the database schema for an e-commerce application."
    ]
  },
  // Round 3: HR & Behavioral
  round3: [
    "Tell me about a challenging project you worked on and how you overcame difficulties.",
    "How do you stay updated with new technologies and trends?",
    "Describe a time when you had to work with a difficult team member."
  ]
};

// Hugging Face AI Integration
const generateAIResponse = async (answer, round, questionIndex, tech, question) => {
  try {
    const prompt = `You are an experienced technical interviewer. The candidate answered: "${answer}". Give a brief, natural response and ask a follow-up question about ${tech}. Keep it under 40 words and conversational.`;

    const response = await fetch('https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 50,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      let aiResponse = '';
      
      if (Array.isArray(data) && data[0]?.generated_text) {
        aiResponse = data[0].generated_text;
      } else if (data.generated_text) {
        aiResponse = data.generated_text;
      }
      
      // Clean up the response
      aiResponse = aiResponse.replace(prompt, '').trim();
      if (aiResponse.length > 10 && aiResponse.length < 200) {
        return aiResponse;
      }
    }
  } catch (error) {
    console.error('Hugging Face API error:', error);
  }
  
  // Fallback responses if API fails
  const fallbackResponses = {
    round1: [
      "That's a solid understanding. Can you give me a practical example?",
      "Good explanation. How would you implement this in a real project?",
      "I see. What challenges might you face with this approach?"
    ],
    round2: [
      "Interesting solution. What if we need to scale this to handle millions of users?",
      "Good thinking. Can you walk me through the edge cases?",
      "That's a start. How would you optimize this further?"
    ],
    round3: [
      "Thanks for sharing that. How did that experience change your approach?",
      "That shows good learning mindset. How do you stay updated with new technologies?",
      "Great attitude. How do you handle disagreements in technical discussions?"
    ]
  };
  
  const roundResponses = fallbackResponses[`round${round}`] || fallbackResponses.round1;
  return roundResponses[questionIndex % roundResponses.length];
};

// Enhanced AI conversation with context
const generateContextualResponse = async (conversationHistory, currentAnswer, tech, round) => {
  try {
    const context = conversationHistory.slice(-3).map(msg => `${msg.speaker}: ${msg.message}`).join('\n');
    const prompt = `Interview context:\n${context}\nCandidate: ${currentAnswer}\n\nAs a ${tech} interviewer, respond naturally and ask a relevant follow-up:`;

    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 60,
          temperature: 0.8,
          do_sample: true,
          pad_token_id: 50256
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      let aiResponse = data[0]?.generated_text || data.generated_text || '';
      
      // Extract only the new response
      aiResponse = aiResponse.replace(prompt, '').trim();
      if (aiResponse.length > 10) {
        return aiResponse;
      }
    }
  } catch (error) {
    console.error('Contextual AI error:', error);
  }
  
  return null;
};

const calculateAdvancedScore = (allAnswers, selectedTech) => {
  let scores = { round1: 0, round2: 0, round3: 0 };
  
  // Round 1: Technical knowledge
  if (allAnswers.round1) {
    let techScore = 50;
    allAnswers.round1.forEach(answer => {
      const lowerAnswer = answer.toLowerCase();
      if (lowerAnswer.length > 100) techScore += 10;
      if (lowerAnswer.includes(selectedTech.toLowerCase())) techScore += 15;
      
      // Technical keywords
      const techKeywords = ['component', 'function', 'api', 'database', 'framework', 'library'];
      const foundKeywords = techKeywords.filter(keyword => lowerAnswer.includes(keyword));
      techScore += foundKeywords.length * 5;
    });
    scores.round1 = Math.min(techScore, 100);
  }
  
  // Round 2: Problem solving
  if (allAnswers.round2) {
    let problemScore = 50;
    allAnswers.round2.forEach(answer => {
      const lowerAnswer = answer.toLowerCase();
      if (lowerAnswer.length > 150) problemScore += 15;
      
      // Problem-solving keywords
      const problemKeywords = ['optimize', 'scale', 'performance', 'solution', 'approach', 'implement'];
      const foundKeywords = problemKeywords.filter(keyword => lowerAnswer.includes(keyword));
      problemScore += foundKeywords.length * 8;
    });
    scores.round2 = Math.min(problemScore, 100);
  }
  
  // Round 3: Communication & HR
  if (allAnswers.round3) {
    let hrScore = 60;
    allAnswers.round3.forEach(answer => {
      const lowerAnswer = answer.toLowerCase();
      if (lowerAnswer.length > 120) hrScore += 10;
      
      // Soft skills keywords
      const softKeywords = ['team', 'communication', 'challenge', 'learn', 'collaborate', 'problem'];
      const foundKeywords = softKeywords.filter(keyword => lowerAnswer.includes(keyword));
      hrScore += foundKeywords.length * 6;
    });
    scores.round3 = Math.min(hrScore, 100);
  }
  
  const overallScore = Math.round((scores.round1 + scores.round2 + scores.round3) / 3);
  return { overallScore, roundScores: scores };
};

// POST /api/real-ai-interview/start
app.post('/api/real-ai-interview/start', (req, res) => {
  try {
    const { courseTrack, selectedTech } = req.body;
    const sessionId = 'real-' + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    activeInterviews.set(sessionId, {
      courseTrack,
      selectedTech,
      allAnswers: {},
      currentRound: 1,
      startTime: new Date(),
      questions: realInterviewQuestions
    });
    
    setTimeout(() => activeInterviews.delete(sessionId), 2 * 60 * 60 * 1000); // 2 hours
    
    res.json({
      sessionId,
      message: 'Advanced AI interview session started',
      rounds: 3,
      questionsPerRound: 3
    });
  } catch (error) {
    console.error('Error starting real AI interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// POST /api/real-ai-interview/submit-answer
app.post('/api/real-ai-interview/submit-answer', (req, res) => {
  try {
    const { sessionId, answer, round, questionIndex, selectedTech } = req.body;
    const session = activeInterviews.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Store answer
    if (!session.allAnswers[`round${round}`]) {
      session.allAnswers[`round${round}`] = [];
    }
    session.allAnswers[`round${round}`].push(answer);
    
    // Generate contextual AI response
    const conversationHistory = session.conversationHistory || [];
    let aiResponse = await generateContextualResponse(conversationHistory, answer, selectedTech, round);
    
    if (!aiResponse) {
      aiResponse = await generateAIResponse(answer, round, questionIndex, selectedTech, 'current question');
    }
    
    // Store conversation history
    if (!session.conversationHistory) session.conversationHistory = [];
    session.conversationHistory.push(
      { speaker: 'user', message: answer },
      { speaker: 'ai', message: aiResponse }
    );
    
    res.json({
      aiResponse,
      analysis: {
        length: answer.length,
        wordCount: answer.split(' ').length,
        round: round,
        questionIndex: questionIndex
      }
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// GET /api/real-ai-interview/results/:sessionId
app.get('/api/real-ai-interview/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeInterviews.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const { overallScore, roundScores } = calculateAdvancedScore(session.allAnswers, session.selectedTech);
    
    const results = {
      overallScore,
      roundScores: [
        { round: 'Technical Basics', score: roundScores.round1, feedback: roundScores.round1 >= 80 ? 'Excellent technical knowledge' : roundScores.round1 >= 60 ? 'Good understanding of concepts' : 'Need to strengthen fundamentals' },
        { round: 'Problem Solving', score: roundScores.round2, feedback: roundScores.round2 >= 80 ? 'Strong problem-solving skills' : roundScores.round2 >= 60 ? 'Good analytical thinking' : 'Practice more coding problems' },
        { round: 'HR & Behavioral', score: roundScores.round3, feedback: roundScores.round3 >= 80 ? 'Excellent communication skills' : roundScores.round3 >= 60 ? 'Good interpersonal skills' : 'Work on communication and teamwork' }
      ],
      strengths: overallScore >= 80 ? ['Strong technical skills', 'Good problem-solving', 'Clear communication'] : overallScore >= 60 ? ['Basic technical knowledge', 'Willing to learn', 'Good attitude'] : ['Interest in technology', 'Potential for growth'],
      improvements: overallScore >= 80 ? ['Advanced system design', 'Leadership skills'] : overallScore >= 60 ? ['Deepen technical knowledge', 'Practice coding problems'] : ['Strengthen fundamentals', 'Build more projects', 'Practice communication'],
      recommendation: `${overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : 'Developing'} candidate for ${session.selectedTech}. ${overallScore >= 80 ? 'Ready for advanced roles.' : overallScore >= 60 ? 'Focus on hands-on practice.' : 'Start with fundamentals and build projects.'}`,
      nextSteps: overallScore >= 80 ? ['Apply for senior positions', 'Mentor others', 'Contribute to open source'] : overallScore >= 60 ? ['Build portfolio projects', 'Practice system design', 'Join coding communities'] : ['Complete online courses', 'Build basic projects', 'Practice daily coding']
    };
    
    activeInterviews.delete(sessionId);
    res.json(results);
  } catch (error) {
    console.error('Error getting results:', error);
    res.status(500).json({ error: 'Failed to get results' });
  }
});

// Original AI Interview Routes (keeping for backward compatibility)

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
  const realSessions = Array.from(activeInterviews.keys()).filter(key => key.startsWith('real-')).length;
  const basicSessions = Array.from(activeInterviews.keys()).filter(key => !key.startsWith('real-')).length;
  
  res.json({
    totalActiveSessions: activeInterviews.size,
    realAIInterviews: realSessions,
    basicInterviews: basicSessions,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
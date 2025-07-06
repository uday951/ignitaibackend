# Backend Setup

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
MONGO_URI=your_mongodb_connection_string
PORT=5000 # or any port you prefer

# Email (SMTP) settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true # true for port 465, false for 587
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password_or_app_password
SMTP_FROM=your_email@example.com # optional, defaults to SMTP_USER
NOTIFY_EMAIL=your_notification_email@example.com
```

- Replace the values with your actual MongoDB and SMTP credentials.
- `NOTIFY_EMAIL` is the address where you want to receive notifications.
- The `uploads` folder will be created automatically for resumes.

## Certificate Verification

To test certificate verification, you need to add certificates to the database. You can do this with a MongoDB GUI (like MongoDB Compass) or by adding a script to seed certificates.

Example certificate document:
```
{
  "certificateId": "IGN-2024-001",
  "studentName": "Priya Sharma",
  "course": "Full Stack Development with AI",
  "issueDate": "2024-06-15",
  "expiryDate": "2026-06-15",
  "grade": "A+",
  "skills": ["React", "Node.js", "Python", "MongoDB", "AI/ML"],
  "msmeRegistered": true
}
```

## Running the Server

```
node index.js
```

## Deployment on Render

### 1. Environment Variables
Set the following environment variables in your Render dashboard:
- `PORT` (Render sets this automatically, but your app already uses it)
- `MONGO_URI`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE` ("true" or "false")
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional)
- `NOTIFY_EMAIL`

### 2. Start Command
```
npm start
```

### 3. Build Command
No build step is required for this backend (Node.js/Express).

### 4. Persistent Storage
If you want to persist uploads, configure a Render Disk and mount it to `/backend/uploads`.

### 5. Web Service
- Make sure your service is set as a Web Service in Render.
- Expose the port provided by the `PORT` environment variable. 
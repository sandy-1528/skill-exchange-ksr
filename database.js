const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    bio TEXT,
    skills_offered TEXT,   -- Comma-separated: "Python, Flask"
    skills_wanted TEXT,    -- Comma-separated: "UI/UX, Figma"
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS swap_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    skill_offered TEXT NOT NULL,
    skill_requested TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Initial Data if empty
const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
if (count.cnt === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, bio, skills_offered, skills_wanted, avatar)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'Aarav Sharma',
    'aarav@college.edu',
    'CS Sophomore passionate about backend & data science.',
    'Python, Machine Learning, SQL',
    'Figma, UI Design, React',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop'
  );

  insertUser.run(
    'Pooja Patel',
    'pooja@college.edu',
    'Design enthusiast who loves wireframing and prototyping.',
    'Figma, UI Design, Illustrator',
    'Python, Machine Learning',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop'
  );

  insertUser.run(
    'Rohan Verma',
    'rohan@college.edu',
    'Web dev building full-stack apps. Looking to learn music/guitar.',
    'JavaScript, Node.js, React',
    'Guitar, Music Theory',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop'
  );

  insertUser.run(
    'Sneha Kulkarni',
    'sneha@college.edu',
    'Acoustic guitarist and vocalist. Wanting to build my portfolio site.',
    'Guitar, Music Theory, Vocals',
    'JavaScript, Node.js',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop'
  );

  // Add initial reviews
  const insertReview = db.prepare(`
    INSERT INTO reviews (reviewer_id, target_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `);
  insertReview.run(2, 1, 5, 'Great Python mentor! Explains complex concepts very clearly.');
  insertReview.run(1, 2, 5, 'Taught me Figma auto-layouts in 2 sessions. Highly recommended!');
}

module.exports = db;
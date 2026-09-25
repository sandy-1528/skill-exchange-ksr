const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT,
    skills_offered TEXT NOT NULL,
    skills_wanted TEXT NOT NULL,
    credits INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS swap_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    skill_offered TEXT NOT NULL,
    skill_requested TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    meet_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS swap_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    swap_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (swap_id) REFERENCES swap_requests(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS swap_notes (
    swap_id INTEGER PRIMARY KEY,
    notes_content TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (swap_id) REFERENCES swap_requests(id)
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

// Auto-add 'credits' column if table already exists without it
try {
  db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 5;`);
} catch (e) {
  // Column already exists, ignore
}

// Auto-add 'meet_link' column if table already exists without it
try {
  db.exec(`ALTER TABLE swap_requests ADD COLUMN meet_link TEXT;`);
} catch (e) {
  // Column already exists, ignore
}

module.exports = db;
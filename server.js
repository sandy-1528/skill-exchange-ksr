const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Register API
app.post('/api/register', (req, res) => {
  const { name, email, password, bio, skills_offered, skills_wanted } = req.body;
  if (!name || !email || !password || !skills_offered || !skills_wanted) {
    return res.status(400).json({ error: 'Please fill in all mandatory fields.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password, bio, skills_offered, skills_wanted, credits)
      VALUES (?, ?, ?, ?, ?, ?, 5)
    `);
    const result = stmt.run(name, email, password, bio || '', skills_offered, skills_wanted);
    const newUser = db.prepare('SELECT id, name, email, bio, skills_offered, skills_wanted, credits FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ message: 'Registration successful', user: newUser });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(400).json({ error: 'Email already exists. Please login.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Login API (Cleaned & Case-insensitive)
app.post('/api/login', (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password.' });
  }

  email = email.trim().toLowerCase();
  password = String(password).trim();

  // Case-insensitive match on email
  const user = db.prepare(`
    SELECT id, name, email, bio, skills_offered, skills_wanted, credits 
    FROM users 
    WHERE LOWER(TRIM(email)) = ? AND TRIM(password) = ?
  `).get(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password. Please check your credentials.' });
  }
  res.json({ message: 'Login successful', user });
});

// Quick switch API for instant switching without re-entering password
app.get('/api/users/quick-switch/:id', (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, bio, skills_offered, skills_wanted, credits 
    FROM users 
    WHERE id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Switched successfully', user });
});

// 3. Edit Profile
app.put('/api/profile/:id', (req, res) => {
  const { name, bio, skills_offered, skills_wanted } = req.body;
  const userId = req.params.id;

  try {
    db.prepare(`
      UPDATE users 
      SET name = ?, bio = ?, skills_offered = ?, skills_wanted = ? 
      WHERE id = ?
    `).run(name, bio || '', skills_offered, skills_wanted, userId);

    const updatedUser = db.prepare('SELECT id, name, email, bio, skills_offered, skills_wanted, credits FROM users WHERE id = ?').get(userId);
    res.json({ message: 'Profile updated', user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Smart Matching API
app.get('/api/match/:userId', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const peers = db.prepare(`
    SELECT u.id, u.name, u.email, u.bio, u.skills_offered, u.skills_wanted, u.credits,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as review_count
    FROM users u
    LEFT JOIN reviews r ON u.id = r.target_id
    WHERE u.id != ?
    GROUP BY u.id
  `).all(req.params.userId);

  const clean = (str) => (str || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const myOffered = clean(current.skills_offered);
  const myWanted = clean(current.skills_wanted);

  const scored = peers.map((peer) => {
    const peerOffered = clean(peer.skills_offered);
    const peerWanted = clean(peer.skills_wanted);

    const canTeachMe = peerOffered.filter(s => myWanted.some(w => w.includes(s) || s.includes(w)));
    const canLearnFromMe = peerWanted.filter(s => myOffered.some(o => o.includes(s) || s.includes(o)));

    let score = 0;
    if (canTeachMe.length > 0 && canLearnFromMe.length > 0) score = 100;
    else if (canTeachMe.length > 0) score = 60;
    else if (canLearnFromMe.length > 0) score = 30;

    return { ...peer, matchScore: score, canTeachMe, canLearnFromMe };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  res.json(scored);
});

// 5. Browse All Users
app.get('/api/users', (req, res) => {
  const { search, excludeId } = req.query;
  let query = `
    SELECT u.id, u.name, u.email, u.bio, u.skills_offered, u.skills_wanted, u.credits,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as review_count
    FROM users u
    LEFT JOIN reviews r ON u.id = r.target_id
    WHERE u.id != ?
  `;
  const params = [excludeId || 0];

  if (search) {
    query += ` AND (u.skills_offered LIKE ? OR u.skills_wanted LIKE ? OR u.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` GROUP BY u.id`;
  const data = db.prepare(query).all(...params);
  res.json(data);
});

// 6. Swap Requests
app.post('/api/requests', (req, res) => {
  const { sender_id, receiver_id, skill_offered, skill_requested } = req.body;
  const roomName = `SkillSwap_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const meet_link = `https://meet.jit.si/${roomName}`;

  const stmt = db.prepare(`
    INSERT INTO swap_requests (sender_id, receiver_id, skill_offered, skill_requested, meet_link)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(sender_id, receiver_id, skill_offered, skill_requested, meet_link);
  res.json({ message: 'Swap request dispatched!' });
});

app.get('/api/requests/:userId', (req, res) => {
  const data = db.prepare(`
    SELECT sr.*, 
           sender.name as sender_name, receiver.name as receiver_name
    FROM swap_requests sr
    JOIN users sender ON sr.sender_id = sender.id
    JOIN users receiver ON sr.receiver_id = receiver.id
    WHERE sr.sender_id = ? OR sr.receiver_id = ?
    ORDER BY sr.created_at DESC
  `).all(req.params.userId, req.params.userId);
  res.json(data);
});

app.patch('/api/requests/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE swap_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Status updated' });
});

// Single swap details endpoint
app.get('/api/swap-details/:id', (req, res) => {
  const swap = db.prepare(`
    SELECT sr.*, 
           sender.name as sender_name, receiver.name as receiver_name
    FROM swap_requests sr
    JOIN users sender ON sr.sender_id = sender.id
    JOIN users receiver ON sr.receiver_id = receiver.id
    WHERE sr.id = ?
  `).get(req.params.id);
  res.json(swap);
});

// 7. Messages
app.get('/api/messages/:swapId', (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name
    FROM swap_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.swap_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.swapId);
  res.json(messages);
});

app.post('/api/messages', (req, res) => {
  const { swap_id, sender_id, message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  db.prepare(`
    INSERT INTO swap_messages (swap_id, sender_id, message)
    VALUES (?, ?, ?)
  `).run(swap_id, sender_id, message);

  res.json({ message: 'Message sent' });
});

// 8. Shared Collaborative Notes APIs
app.get('/api/notes/:swapId', (req, res) => {
  let note = db.prepare('SELECT notes_content FROM swap_notes WHERE swap_id = ?').get(req.params.swapId);
  if (!note) {
    db.prepare('INSERT INTO swap_notes (swap_id, notes_content) VALUES (?, ?)').run(req.params.swapId, '');
    note = { notes_content: '' };
  }
  res.json(note);
});

app.post('/api/notes/:swapId', (req, res) => {
  const { notes_content } = req.body;
  db.prepare(`
    INSERT INTO swap_notes (swap_id, notes_content, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(swap_id) DO UPDATE SET notes_content = excluded.notes_content, updated_at = CURRENT_TIMESTAMP
  `).run(req.params.swapId, notes_content);
  res.json({ message: 'Notes saved' });
});

// 9. Reviews
app.post('/api/reviews', (req, res) => {
  const { reviewer_id, target_id, rating, comment } = req.body;
  db.prepare(`
    INSERT INTO reviews (reviewer_id, target_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `).run(reviewer_id, target_id, rating, comment);
  res.json({ message: 'Review saved' });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
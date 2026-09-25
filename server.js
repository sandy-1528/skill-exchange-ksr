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
      INSERT INTO users (name, email, password, bio, skills_offered, skills_wanted)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, password, bio || '', skills_offered, skills_wanted);
    const newUser = db.prepare('SELECT id, name, email, bio, skills_offered, skills_wanted FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ message: 'Registration successful', user: newUser });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(400).json({ error: 'Email already exists. Please login.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Login API
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT id, name, email, bio, skills_offered, skills_wanted FROM users WHERE email = ? AND password = ?').get(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  res.json({ message: 'Login successful', user });
});

// 3. Smart Matching API for the logged in user
app.get('/api/match/:userId', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const peers = db.prepare(`
    SELECT u.id, u.name, u.email, u.bio, u.skills_offered, u.skills_wanted,
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

// 4. Browse / Search Peers
app.get('/api/users', (req, res) => {
  const { search, excludeId } = req.query;
  let query = `
    SELECT u.id, u.name, u.email, u.bio, u.skills_offered, u.skills_wanted,
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

// 5. Swap Requests
app.post('/api/requests', (req, res) => {
  const { sender_id, receiver_id, skill_offered, skill_requested } = req.body;
  const stmt = db.prepare(`
    INSERT INTO swap_requests (sender_id, receiver_id, skill_offered, skill_requested)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(sender_id, receiver_id, skill_offered, skill_requested);
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
  db.prepare('UPDATE swap_requests SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ message: 'Status updated' });
});

// 6. Reviews
app.post('/api/reviews', (req, res) => {
  const { reviewer_id, target_id, rating, comment } = req.body;
  db.prepare(`
    INSERT INTO reviews (reviewer_id, target_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `).run(reviewer_id, target_id, rating, comment);
  res.json({ message: 'Review saved' });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
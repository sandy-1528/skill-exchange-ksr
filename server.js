const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Get all users or filter by skill search
app.get('/api/users', (req, res) => {
  const { search } = req.query;
  let query = `
    SELECT u.*, 
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.id) as review_count
    FROM users u
    LEFT JOIN reviews r ON u.id = r.target_id
  `;
  const params = [];

  if (search) {
    query += ` WHERE u.skills_offered LIKE ? OR u.skills_wanted LIKE ? OR u.name LIKE ?`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` GROUP BY u.id`;
  const users = db.prepare(query).all(...params);
  res.json(users);
});

// 2. Intelligent Matchmaking API
// Finds users whose offered skills overlap with current user's wanted skills
// AND (optionally) current user's offered skills overlap with their wanted skills
app.get('/api/match/:userId', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const allOthers = db.prepare(`
    SELECT u.*, 
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

  const scoredMatches = allOthers.map((peer) => {
    const peerOffered = clean(peer.skills_offered);
    const peerWanted = clean(peer.skills_wanted);

    // Mutual match calculation
    const canTeachMe = peerOffered.filter((skill) =>
      myWanted.some((mw) => mw.includes(skill) || skill.includes(mw))
    );
    const canLearnFromMe = peerWanted.filter((skill) =>
      myOffered.some((mo) => mo.includes(skill) || skill.includes(mo))
    );

    let score = 0;
    if (canTeachMe.length > 0 && canLearnFromMe.length > 0) {
      score = 100; // Perfect 2-way match!
    } else if (canTeachMe.length > 0) {
      score = 60; // 1-way match: they have what you need
    } else if (canLearnFromMe.length > 0) {
      score = 30; // 1-way match: you have what they need
    }

    return {
      ...peer,
      matchScore: score,
      canTeachMe,
      canLearnFromMe
    };
  });

  // Sort descending by match score
  scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
  res.json(scoredMatches);
});

// 3. Create Swap Request
app.post('/api/requests', (req, res) => {
  const { sender_id, receiver_id, skill_offered, skill_requested } = req.body;
  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: 'Missing required IDs' });
  }

  const stmt = db.prepare(`
    INSERT INTO swap_requests (sender_id, receiver_id, skill_offered, skill_requested)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(sender_id, receiver_id, skill_offered, skill_requested);
  res.json({ id: info.lastInsertRowid, message: 'Swap request submitted!' });
});

// 4. View incoming & outgoing swap requests
app.get('/api/requests/:userId', (req, res) => {
  const requests = db.prepare(`
    SELECT sr.*, 
           sender.name as sender_name, sender.email as sender_email,
           receiver.name as receiver_name, receiver.email as receiver_email
    FROM swap_requests sr
    JOIN users sender ON sr.sender_id = sender.id
    JOIN users receiver ON sr.receiver_id = receiver.id
    WHERE sr.sender_id = ? OR sr.receiver_id = ?
    ORDER BY sr.created_at DESC
  `).all(req.params.userId, req.params.userId);

  res.json(requests);
});

// 5. Update Request Status (Accept / Reject)
app.patch('/api/requests/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE swap_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: `Request marked as ${status}` });
});

// 6. Submit Rating & Feedback
app.post('/api/reviews', (req, res) => {
  const { reviewer_id, target_id, rating, comment } = req.body;
  if (!reviewer_id || !target_id || !rating) {
    return res.status(400).json({ error: 'Missing rating details' });
  }

  db.prepare(`
    INSERT INTO reviews (reviewer_id, target_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `).run(reviewer_id, target_id, rating, comment);

  res.json({ message: 'Review saved!' });
});

// 7. Get user's received reviews
app.get('/api/reviews/:userId', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name 
    FROM reviews r
    JOIN users u ON r.reviewer_id = u.id
    WHERE r.target_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.userId);
  res.json(reviews);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('../db');
const optionalAuth = require('../middleware/optionalAuth');
const { logEvent } = require('../logger');

const router = express.Router();
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

router.post('/google', async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        return res.status(400).json({ error: "Missing credential" });
    }

    try {
        // 1. Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.VITE_GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;

        // 2. Find or Create User in DB
        let user = await db.get('SELECT * FROM users WHERE google_id = ?', [googleId]);

        if (!user) {
            // Fallback: Check if user exists by email (legacy mapping) or username?
            user = await db.get('SELECT * FROM users WHERE username = ?', [email]);

            if (user) {
                // Link existing user & update picture
                await db.run('UPDATE users SET google_id = ?, email = ?, picture = ? WHERE id = ?', [googleId, email, payload.picture, user.id]);
            } else {
                // Create new "pending" user
                const info = await db.run('INSERT INTO users (username, email, google_id, level, approved, picture, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                    payload.name || email, // Use name if available
                    email,
                    googleId,
                    'user',
                    0, // Not approved by default
                    payload.picture,
                    '{}' // Default empty JSON object for preferences
                ]);
                user = await db.get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);
                // Log: NEW USER REGISTERED
                logEvent(req, 'USER REGISTER', `New user registered: ${email}`, user);
            }
        }

        if (!user.approved) {
            // Log: LOGIN FAILED (UNAPPROVED)
            logEvent(req, 'LOGIN ATTEMPT', `Unapproved user tried to login: ${email}`, user);
            return res.status(403).json({ error: "Account not approved yet." });
        }

        // ALWAYS refresh the picture from Google
        if (payload.picture) {
            await db.run('UPDATE users SET picture = ? WHERE id = ?', [payload.picture, user.id]);
            user.picture = payload.picture; // Update local object
        }

        // 3. Create Session JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email || user.username,
                level: user.level
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                level: user.level,
                email: user.email,
                picture: user.picture, // Include picture
                preferences: user.preferences ? JSON.parse(user.preferences) : {} // Include preferences
            }
        });

        // Log: LOGIN SUCCESS
        logEvent(req, 'LOGIN', `User logged in successfully: ${email}`, user);

    } catch (error) {
        console.error("Auth Error:", error);
        res.status(400).json({ error: 'Authentication failed' });
    }
});

// 4. Get Current User (Session Refresh)
router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "No token" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT id, username, email, level, picture, approved, preferences FROM users WHERE id = ?', [decoded.userId]);

        if (!user) return res.status(404).json({ error: "User not found" });

        // Parse preferences string to JSON
        user.preferences = user.preferences ? JSON.parse(user.preferences) : {};

        res.json(user);
    } catch (err) {
        return res.status(403).json({ error: "Invalid token" });
    }
});

// 5. Update Preferences
router.put('/preferences', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "No token" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { preferences } = req.body;

        if (!preferences) return res.status(400).json({ error: "No preferences provided" });

        const preferencesString = JSON.stringify(preferences);

        await db.run('UPDATE users SET preferences = ? WHERE id = ?', [preferencesString, decoded.userId]);

        res.json({ success: true, preferences });
    } catch (error) {
        console.error("Update Preferences Error:", error);
        res.status(500).json({ error: "Failed to update preferences" });
    }
});

// 6. Logout (for logging purposes)
router.post('/logout', optionalAuth, (req, res) => {
    if (req.user) {
        logEvent(req, 'LOGOUT', `User logged out: ${req.user.email}`);
    }
    res.json({ success: true });
});

module.exports = router;

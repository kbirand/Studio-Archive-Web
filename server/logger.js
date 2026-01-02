const Database = require('better-sqlite3');
const path = require('path');

const logsDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'user_logs.db');
const logsDb = new Database(logsDbPath);

// Create table if it doesn't exist (matching provided schema)
logsDb.prepare(`
    CREATE TABLE IF NOT EXISTS user_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT,
        action_desc TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

const logEvent = (req, action, action_desc, userOverride = null) => {
    try {
        const user = userOverride || req.user;
        const user_id = user ? (user.id || user.userId) : null;
        const username = user ? (user.email || user.username) : 'anonymous';

        // Robust IP detection
        const ip_address = req.ip ||
            (req.headers ? req.headers['x-forwarded-for'] : null) ||
            (req.socket ? req.socket.remoteAddress : null) ||
            'unknown';

        const user_agent = (req.headers ? req.headers['user-agent'] : null) || 'unknown';

        const stmt = logsDb.prepare(`
            INSERT INTO user_logs (user_id, username, action, action_desc, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(user_id, username, action, action_desc, ip_address, user_agent);
    } catch (err) {
        console.error("Failed to log event:", err);
    }
};

const getLogs = (filters = {}) => {
    try {
        const { q, action, timeframe, startDate, endDate, limit = 500 } = filters;
        let query = "SELECT * FROM user_logs";
        const params = [];
        const where = [];

        if (q) {
            where.push("(username LIKE ? OR action_desc LIKE ?)");
            params.push(`%${q}%`, `%${q}%`);
        }
        if (action) {
            where.push("action = ?");
            params.push(action);
        }
        if (timeframe && timeframe !== 'custom') {
            if (timeframe === 'today') {
                where.push("timestamp >= date('now')");
            } else if (timeframe === '7d') {
                where.push("timestamp >= date('now', '-7 days')");
            } else if (timeframe === '30d') {
                where.push("timestamp >= date('now', '-30 days')");
            }
        } else if (timeframe === 'custom') {
            if (startDate) {
                where.push("timestamp >= ?");
                params.push(startDate);
            }
            if (endDate) {
                where.push("timestamp <= ?");
                // End date usually means the end of that day, so we add 23:59:59 or use date() comparison
                params.push(endDate + " 23:59:59");
            }
        }

        if (where.length > 0) {
            query += " WHERE " + where.join(" AND ");
        }

        query += " ORDER BY timestamp DESC";
        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        return logsDb.prepare(query).all(...params);
    } catch (err) {
        console.error("Failed to fetch logs:", err);
        return [];
    }
};

const getActions = () => {
    try {
        return logsDb.prepare("SELECT DISTINCT action FROM user_logs ORDER BY action ASC").all().map(a => a.action);
    } catch (err) {
        console.error("Failed to fetch actions:", err);
        return [];
    }
};

module.exports = { logEvent, getLogs, getActions };

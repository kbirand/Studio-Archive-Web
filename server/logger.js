const db = require('./db');

// Create table if it doesn't exist (using the SAME connection as the app)
// NOTE: Migration script already created it, but for safety/dev we can check.
// Using async IIFE since we can't do top-level await easily in CommonJS without thinking
const initLogger = async () => {
    try {
        await db.run(`
        CREATE TABLE IF NOT EXISTS user_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            username VARCHAR(255),
            action VARCHAR(255),
            action_desc TEXT,
            ip_address VARCHAR(255),
            user_agent TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    } catch (err) {
        console.error("Logger init error:", err);
    }
};

initLogger();

const logEvent = async (req, action, action_desc, userOverride = null) => {
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

        await db.run(`
            INSERT INTO user_logs (user_id, username, action, action_desc, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [user_id, username, action, action_desc, ip_address, user_agent]);

    } catch (err) {
        console.error("Failed to log event:", err);
    }
};

const getLogs = async (filters = {}) => {
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
                where.push("timestamp >= CURDATE()");
            } else if (timeframe === '7d') {
                where.push("timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
            } else if (timeframe === '30d') {
                where.push("timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
            }
        } else if (timeframe === 'custom') {
            if (startDate) {
                where.push("timestamp >= ?");
                params.push(startDate);
            }
            if (endDate) {
                where.push("timestamp <= ?");
                // End date usually means the end of that day
                params.push(endDate + " 23:59:59");
            }
        }

        if (where.length > 0) {
            query += " WHERE " + where.join(" AND ");
        }

        query += " ORDER BY timestamp DESC";
        if (limit) {
            query += ` LIMIT ${limit}`; // Be careful with direct interpolation, but limit is usually safe if ensured number
        }

        return await db.all(query, params);
    } catch (err) {
        console.error("Failed to fetch logs:", err);
        return [];
    }
};

const getActions = async () => {
    try {
        const rows = await db.all("SELECT DISTINCT action FROM user_logs ORDER BY action ASC");
        return rows.map(a => a.action);
    } catch (err) {
        console.error("Failed to fetch actions:", err);
        return [];
    }
};

module.exports = { logEvent, getLogs, getActions };

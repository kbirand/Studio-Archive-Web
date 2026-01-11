const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'kB12711271!', // Fallback if env not readable/set
    database: process.env.DB_NAME || 'studioarchive',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

// Helper to keep similar API or just export pool
// We will export pool directly, but maybe add a query wrapper for logging if needed
// original used: new Database(path, { verbose: console.log })

const db = {
    pool,
    // Helper for simple queries that returns [rows]
    query: async (sql, params) => {
        try {
            const [results] = await pool.query(sql, params);
            return results;
        } catch (err) {
            console.error('Database Query Error:', err.message, '\nSQL:', sql, '\nParams:', params);
            throw err;
        }
    },
    // Helper to get a single row (mimics better-sqlite3 .get())
    get: async (sql, params) => {
        const [rows] = await pool.query(sql, params);
        return rows[0];
    },
    // Helper to get all rows (mimics better-sqlite3 .all())
    all: async (sql, params) => {
        const [rows] = await pool.query(sql, params);
        return rows;
    },
    // Helper to run an insert/update (mimics better-sqlite3 .run())
    run: async (sql, params) => {
        const [result] = await pool.query(sql, params);
        // Map MySQL result to better-sqlite3 structure if possible, or just return result
        // better-sqlite3: { changes: number, lastInsertRowid: number }
        // MySQL: { affectedRows: number, insertId: number }
        return {
            changes: result.affectedRows,
            lastInsertRowid: result.insertId,
            ...result
        };
    },
    // Transaction helper
    // Note: This is tricky. better-sqlite3 transaction returns a callable function.
    // We can't easily mimic that identically without a lot of generic wrapper code.
    // We will handle transactions explicitly in the routes instead.
    transaction: () => {
        throw new Error("Generic transaction wrapper not implemented. Use pool.getConnection() and beginTransaction() manually.");
    }
};

// Check connection
pool.getConnection()
    .then(conn => {
        console.log("Connected to MySQL Database");
        conn.release();
    })
    .catch(err => {
        console.error("Error connecting to MySQL:", err);
    });

module.exports = db;

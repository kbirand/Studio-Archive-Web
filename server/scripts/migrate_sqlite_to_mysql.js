const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3'); // Keep this for reading source
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const worksDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'works.db');
const logsDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'user_logs.db');

const mysqlConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'kB12711271!', // As provided by user
    database: 'studioarchive',
    multipleStatements: true
};

async function migrate() {
    console.log('Starting migration...');

    // Connect to MySQL
    const connection = await mysql.createConnection(mysqlConfig);
    console.log('Connected to MySQL');

    // Open SQLite DBs
    const worksDb = new Database(worksDbPath);
    const logsDb = new Database(logsDbPath); // Might fail if file doesn't exist, handle gracefully

    // 1. Create Tables
    const createTablesSql = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255),
            password VARCHAR(255),
            approved TINYINT DEFAULT 1,
            google_id VARCHAR(255) UNIQUE,
            email VARCHAR(255),
            preferences TEXT
        );

        CREATE TABLE IF NOT EXISTS works (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            work_period VARCHAR(255),
            talent VARCHAR(255),
            stylist VARCHAR(255),
            hair VARCHAR(255),
            makeup VARCHAR(255),
            description TEXT,
            path VARCHAR(255),
            visible TINYINT DEFAULT 1,
            ordered INT
        );

        CREATE TABLE IF NOT EXISTS files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workid INT,
            file VARCHAR(255),
            ordered INT,
            visible TINYINT DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workid) REFERENCES works(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            username VARCHAR(255),
            action VARCHAR(255),
            action_desc TEXT,
            ip_address VARCHAR(255),
            user_agent TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await connection.query(createTablesSql);
    console.log('Tables created in MySQL');

    // 2. Migrate Users
    console.log('Migrating Users...');
    const users = worksDb.prepare('SELECT * FROM users').all();
    if (users.length > 0) {
        const userValues = users.map(u => [u.id, u.username, u.password, u.approved, u.google_id || null, u.email || null, u.preferences || null]);
        await connection.query('INSERT IGNORE INTO users (id, username, password, approved, google_id, email, preferences) VALUES ?', [userValues]);
    }
    console.log(`Migrated ${users.length} users`);

    // 3. Migrate Works
    console.log('Migrating Works...');
    const works = worksDb.prepare('SELECT * FROM works').all();
    if (works.length > 0) {
        // SQLite doesn't have created_at/updated_at usually unless specified, but schema showed ID/PATH/...
        // We'll map fields carefully
        const workValues = works.map(w => [
            w.id,
            w.work_period,
            w.talent,
            w.stylist,
            w.hair,
            w.makeup,
            w.path,
            w.visible,
            w.ordered
        ]);
        // Note: Skipping created_at/updated_at/description if not in source or letting defaults handle it
        await connection.query('INSERT IGNORE INTO works (id, work_period, talent, stylist, hair, makeup, path, visible, ordered) VALUES ?', [workValues]);
    }
    console.log(`Migrated ${works.length} works`);

    // 4. Migrate Files
    console.log('Migrating Files...');
    const files = worksDb.prepare('SELECT * FROM files').all();
    if (files.length > 0) {
        // Batch insert files to avoid packet limit issues if too many
        const batchSize = 1000;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const fileValues = batch.map(f => [f.id, f.workid, f.file, f.ordered, f.visible]);
            await connection.query('INSERT IGNORE INTO files (id, workid, file, ordered, visible) VALUES ?', [fileValues]);
            console.log(`Migrated files batch ${i} - ${i + batch.length}`);
        }
    }
    console.log(`Migrated ${files.length} files`);

    // 5. Migrate Logs
    console.log('Migrating Logs...');
    try {
        const logs = logsDb.prepare('SELECT * FROM user_logs').all();
        if (logs.length > 0) {
            const batchSize = 1000;
            for (let i = 0; i < logs.length; i += batchSize) {
                const batch = logs.slice(i, i + batchSize);
                const logValues = batch.map(l => [l.id, l.user_id, l.username, l.action, l.action_desc, l.ip_address, l.user_agent, l.timestamp]);
                await connection.query('INSERT IGNORE INTO user_logs (id, user_id, username, action, action_desc, ip_address, user_agent, timestamp) VALUES ?', [logValues]);
            }
            console.log(`Migrated ${logs.length} logs`);
        }
    } catch (e) {
        console.log('Error migrating logs (maybe db empty or missing):', e.message);
    }

    console.log('Migration completed successfully');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

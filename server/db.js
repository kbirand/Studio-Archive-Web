const Database = require('better-sqlite3');
const path = require('path');

const worksDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'works.db');
console.log("WORKS DB Path: ", worksDbPath);
// const logsDbPath = path.resolve(__dirname, '../../00_PhotoArchive/user_logs.db'); 

// Check if DB exists, if not, it will be created, but we expect it to exist
const db = new Database(worksDbPath, { verbose: console.log });

// Migrations / Schema Updates
const initDb = () => {
    // Add google_id column if it doesn't exist
    const tableInfo = db.pragma('table_info(users)');
    const googleIdExists = tableInfo.some(col => col.name === 'google_id');

    if (!googleIdExists) {
        console.log("Adding google_id column to users table...");
        try {
            db.prepare("ALTER TABLE users ADD COLUMN google_id TEXT").run();
            db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)").run();
            console.log("Added google_id column and unique index.");
        } catch (e) {
            console.error("Error adding google_id column:", e);
        }
    }

    // Ensure email column exists (original schema had username, maybe we map email to username or add email)
    const emailExists = tableInfo.some(col => col.name === 'email');
    if (!emailExists) {
        console.log("Adding email column to users table...");
        try {
            db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
            console.log("Added email column.");
        } catch (e) {
            console.error("Error adding email column:", e);
        }
    }

    // Add preferences column for storing UI settings like sidebar width
    const preferencesExists = tableInfo.some(col => col.name === 'preferences');
    if (!preferencesExists) {
        console.log("Adding preferences column to users table...");
        try {
            db.prepare("ALTER TABLE users ADD COLUMN preferences TEXT").run();
            console.log("Added preferences column.");
        } catch (e) {
            console.error("Error adding preferences column:", e);
        }
    }
};

initDb();

module.exports = db;

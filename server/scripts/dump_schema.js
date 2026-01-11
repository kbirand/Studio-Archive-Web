const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const worksDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'works.db');
const logsDbPath = path.join(process.env.PHOTO_ARCHIVE_PATH, 'user_logs.db');

function dumpSchema(dbPath, name) {
    console.log(`--- Schema for ${name} ---`);
    try {
        const db = new Database(dbPath);
        const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        tables.forEach(table => {
            console.log(table.sql);
        });
    } catch (e) {
        console.error(`Error reading ${name}:`, e.message);
    }
}

dumpSchema(worksDbPath, 'works.db');
dumpSchema(logsDbPath, 'user_logs.db');

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysqlConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'kB12711271!',
    database: process.env.DB_NAME || 'studioarchive',
    multipleStatements: true
};

async function addIndexes() {
    try {
        console.log('Connecting to MySQL...');
        const connection = await mysql.createConnection(mysqlConfig);

        console.log('Adding indexes...');

        // Index on works for filtering and sorting
        try {
            await connection.query('CREATE INDEX idx_works_visible_ordered ON works(visible, ordered)');
            console.log('Added index: idx_works_visible_ordered');
        } catch (e) {
            console.log('Index idx_works_visible_ordered might already exist or failed:', e.message);
        }

        // Index on files for joining and filtering visible files
        try {
            await connection.query('CREATE INDEX idx_files_workid_visible ON files(workid, visible)');
            console.log('Added index: idx_files_workid_visible');
        } catch (e) {
            console.log('Index idx_files_workid_visible might already exist or failed:', e.message);
        }

        // Optimized Index for "First Image" query (workid + visible + ordered)
        try {
            await connection.query('CREATE INDEX idx_files_lookup_ordered ON files(workid, visible, ordered)');
            console.log('Added index: idx_files_lookup_ordered');
        } catch (e) {
            console.log('Index idx_files_lookup_ordered might already exist or failed:', e.message);
        }

        console.log('Performance indexes added successfully.');
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('Failed to add indexes:', err);
        process.exit(1);
    }
}

addIndexes();

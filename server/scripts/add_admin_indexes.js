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

async function addAdminIndexes() {
    try {
        console.log('Connecting to MySQL...');
        const connection = await mysql.createConnection(mysqlConfig);

        console.log('Adding Admin-optimized indexes...');

        // 1. Files: Simple (workid, ordered) for Admin lookups (ignoring visibility)
        // This allows "ORDER BY ordered" to use the index even when "visible" is not in WHERE
        try {
            await connection.query('CREATE INDEX idx_files_admin_lookup ON files(workid, ordered)');
            console.log('Added index: idx_files_admin_lookup');
        } catch (e) {
            console.log('Index idx_files_admin_lookup might already exist or failed:', e.message);
        }

        // 2. Works: Simple (ordered) for Admin sorting
        try {
            await connection.query('CREATE INDEX idx_works_ordered_only ON works(ordered)');
            console.log('Added index: idx_works_ordered_only');
        } catch (e) {
            console.log('Index idx_works_ordered_only might already exist or failed:', e.message);
        }

        console.log('Admin indexes added successfully.');
        await connection.end();
    } catch (err) {
        console.error('Failed to add indexes:', err);
    }
}

addAdminIndexes();

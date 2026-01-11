const express = require('express');
const db = require('../db');
const optionalAuth = require('../middleware/optionalAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { logEvent } = require('../logger');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto'); // Added for DELETE route
sharp.cache(false);
const router = express.Router();
// In-memory cache for works list -- REMOVED
// let worksCache = { admin: null };

// CACHE MANIPULATION HELPERS -- REMOVED
// const cacheOps = { ... };

const PHOTO_ARCHIVE_PATH = process.env.PHOTO_ARCHIVE_PATH;

// Helper function to sanitize folder name
const sanitizeFolderName = (name) => {
    return name
        .replace(/[\/\\:*?"<>|]/g, '_')  // Replace problematic chars
        .replace(/\s+/g, '_')             // Replace spaces with underscore
        .replace(/_+/g, '_')              // Collapse multiple underscores
        .replace(/^_|_$/g, '');           // Trim underscores from start/end
};

// Helper function to get next folder index
const getNextFolderIndex = async () => {
    // Query database for max folder index (fast - single query)
    const result = await db.get(`
        SELECT MAX(CAST(SUBSTR(path, 1, 6) AS UNSIGNED)) as maxIndex
        FROM works
    `);

    // Note: CAST AS UNSIGNED matches MySQL
    return (result && result.maxIndex ? result.maxIndex : 0) + 2;
};

// Helper function to ensure unique folder path
const ensureUniqueFolderPath = (baseIndex, sanitizedName) => {
    let index = baseIndex;
    let folderPath = `${String(index).padStart(6, '0')}_${sanitizedName}`;
    let fullPath = path.join(PHOTO_ARCHIVE_PATH, folderPath);

    // Check if folder exists, increment if needed (rare case)
    while (fs.existsSync(fullPath)) {
        index += 2;
        folderPath = `${String(index).padStart(6, '0')}_${sanitizedName}`;
        fullPath = path.join(PHOTO_ARCHIVE_PATH, folderPath);
    }

    return { index, folderPath, fullPath };
};

// CREATE new work (Admin only)
router.post('/create', optionalAuth, requireAdmin, async (req, res) => {
    console.log("Create Initiated");
    const start = process.hrtime();
    let fsDuration = 0;
    let dbDuration = 0;

    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Work name is required" });
        }

        const dbStart1 = process.hrtime();
        // Get next folder index from database
        const nextIndex = await getNextFolderIndex();
        const dbEnd1 = process.hrtime(dbStart1);

        // Sanitize name
        const sanitizedName = sanitizeFolderName(name.trim());
        // Ensure unique folder path (handles edge case of manually added folders)
        const { index, folderPath, fullPath } = ensureUniqueFolderPath(nextIndex, sanitizedName);

        const fsStart = process.hrtime();
        // Create folder
        fs.mkdirSync(fullPath, { recursive: true });
        fs.chmodSync(fullPath, 0o777);
        const fsEnd = process.hrtime(fsStart);
        fsDuration = (fsEnd[0] * 1000 + fsEnd[1] / 1e6).toFixed(2);

        const dbStart2 = process.hrtime();
        // Get max ordered value
        const maxOrderedRow = await db.get('SELECT MAX(ordered) as maxOrdered FROM works');
        const nextOrdered = (maxOrderedRow && maxOrderedRow.maxOrdered ? maxOrderedRow.maxOrdered : 0) + 1;

        // Insert into database
        const result = await db.run(`
            INSERT INTO works (path, work_period, talent, stylist, hair, makeup, visible, ordered)
            VALUES (?, ?, NULL, NULL, NULL, NULL, 1, ?)
        `, [folderPath, name.trim(), nextOrdered]);

        const dbEnd2 = process.hrtime(dbStart2);
        const dbTotal = (dbEnd1[0] * 1000 + dbEnd1[1] / 1e6) + (dbEnd2[0] * 1000 + dbEnd2[1] / 1e6);
        dbDuration = dbTotal.toFixed(2);

        const newWorkId = result.lastInsertRowid;

        // Log: WORK CREATE
        await logEvent(req, 'WORK CREATE', `Created work: ${name.trim()} (Folder: ${folderPath})`);

        const end = process.hrtime(start);
        const totalDuration = (end[0] * 1000 + end[1] / 1e6).toFixed(2);

        res.set('Server-Timing', `fs;dur=${fsDuration};desc="Filesystem", db;dur=${dbDuration};desc="Database", total;dur=${totalDuration}`);
        console.log(`[POST /create] Total: ${totalDuration}ms | DB: ${dbDuration}ms | FS: ${fsDuration}ms`);

        res.json({
            success: true,
            id: newWorkId,
            path: folderPath
        });

    } catch (err) {
        console.error("Create work error:", err);
        res.status(500).json({ error: "Failed to create work" });
    }
});

// GET all visible works, grouped by period
router.get('/', optionalAuth, async (req, res) => {
    const start = process.hrtime();
    let dbDuration = 0;

    try {
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;

        const dbStart = process.hrtime();
        console.log("Get works Initiated");
        // Optimized Query: Fetch works + cover image + file counts in one go
        const sql = `
            SELECT 
                w.*,
                (SELECT file FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'}) ORDER BY f.ordered ASC LIMIT 1) as cover_image,
                (SELECT COUNT(*) FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'})) as file_count
            FROM works w
            WHERE ${isAdmin ? '1=1' : 'w.visible = 1'}
            ORDER BY w.ordered DESC
        `;
        const works = await db.all(sql);
        console.log("Get works Completed");
        const dbEnd = process.hrtime(dbStart);
        dbDuration = (dbEnd[0] * 1000 + dbEnd[1] / 1e6).toFixed(2);

        // Group by Period
        console.log("Grouping works Initiated");
        const grouped = works.reduce((acc, work) => {
            const period = work.work_period || 'Unknown';
            if (!acc[period]) {
                acc[period] = [];
            }
            // Ensure numeric values for frontend consistency
            // work.visible = work.visible === 1; // REVERTED: Frontend expects 1/0

            acc[period].push(work);
            return acc;
        }, {});
        console.log("Grouping works Completed");
        const end = process.hrtime(start);
        const totalDuration = (end[0] * 1000 + end[1] / 1e6).toFixed(2);

        // Add Server-Timing header
        res.set('Server-Timing', `db;dur=${dbDuration};desc="Database Query", total;dur=${totalDuration};desc="Total Request Time"`);

        // Also log to console for Docker logs
        console.log(`[GET /works] Total: ${totalDuration}ms | DB: ${dbDuration}ms`);

        return res.json(grouped);

    } catch (err) {
        console.error("Error fetching works:", err);
        res.status(500).json({ error: "Failed to fetch works" });
    }
});

// GET all works and their files for a specific period (Not cached currently, usually fast enough or rarely used)
router.get('/period/:period', optionalAuth, async (req, res) => {
    try {
        const { period } = req.params;
        const decodedPeriod = decodeURIComponent(period);
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;
        console.log("Get works Initiated");
        const worksSql = `SELECT * FROM works WHERE work_period = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY ordered DESC`;
        const works = await db.all(worksSql, [decodedPeriod]);
        console.log("Get works Completed");
        const result = await Promise.all(works.map(async work => {
            const fileSql = `SELECT * FROM files WHERE workid = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY CAST(ordered AS UNSIGNED) DESC`;
            const files = await db.all(fileSql, [work.id]);
            return {
                ...work,
                files
            };
        }));
        console.log("Get works Completed");
        res.json(result);
    } catch (err) {
        console.error("Error fetching period details:", err);
        res.status(500).json({ error: "Failed to fetch period details" });
    }
});

// MULTER CONFIG for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tmpDir = path.join(PHOTO_ARCHIVE_PATH, 'tmp_uploads');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
            fs.chmodSync(tmpDir, 0o777);
        }
        cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// UPLOAD files to a work (Admin only)
router.post('/:id/upload', optionalAuth, requireAdmin, upload.array('photos'), async (req, res) => {
    try {
        const { id } = req.params;
        const work = await db.get("SELECT path FROM works WHERE id = ?", [id]);

        if (!work) {
            return res.status(404).json({ error: "Work not found" });
        }

        // cacheOps.clear(); // Invalidate cache (file count and cover image might change)


        const workDirPath = path.join(PHOTO_ARCHIVE_PATH, work.path);
        const previewDir = path.join(workDirPath, 'previews');
        const thumbDir = path.join(workDirPath, 'thumbs');

        if (!fs.existsSync(previewDir)) {
            fs.mkdirSync(previewDir, { recursive: true });
            fs.chmodSync(previewDir, 0o777);
        }
        if (!fs.existsSync(thumbDir)) {
            fs.mkdirSync(thumbDir, { recursive: true });
            fs.chmodSync(thumbDir, 0o777);
        }

        const maxOrderedRow = await db.get('SELECT MAX(ordered) as maxOrdered FROM files WHERE workid = ?', [id]);
        let nextOrdered = (maxOrderedRow && maxOrderedRow.maxOrdered ? maxOrderedRow.maxOrdered : 0) + 1;

        const results = [];

        for (const file of req.files) {
            const originalFilename = file.originalname;
            const targetPath = path.join(workDirPath, originalFilename);

            // Move from tmp to final original location
            fs.renameSync(file.path, targetPath);
            fs.chmodSync(targetPath, 0o666);

            // Generate Preview (3500x3500)
            const previewPath = path.join(previewDir, originalFilename);
            await sharp(targetPath)
                .resize(3500, 3500, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(previewPath);
            fs.chmodSync(previewPath, 0o666);

            // Generate Thumbnail (1024x1024)
            const thumbPath = path.join(thumbDir, originalFilename);
            await sharp(targetPath)
                .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(thumbPath);
            fs.chmodSync(thumbPath, 0o666);

            // Add to database
            await db.run(`
                INSERT INTO files (workid, file, ordered, visible)
                VALUES (?, ?, ?, 1)
            `, [id, originalFilename, nextOrdered++]);

            results.push({ name: originalFilename, status: 'success' });
        }

        // Log: FILE UPLOAD
        const filenames = results.map(r => r.name).join(', ');
        logEvent(req, 'IMAGE ADDED', `Added ${results.length} photos (${filenames}) to work ID ${id} (${work.path})`);

        res.json({ success: true, files: results });

    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Failed to upload files: " + err.message });
    }
});

// GET details for a specific work (images)
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;

        const work = await db.get("SELECT * FROM works WHERE id = ?", [id]);

        if (!work) {
            return res.status(404).json({ error: "Work not found" });
        }

        // Access check
        if (!isAdmin && work.visible !== 1) {
            return res.status(403).json({ error: "Access denied" });
        }

        const fileSql = `SELECT * FROM files WHERE workid = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY CAST(ordered AS UNSIGNED) DESC`;
        const files = await db.all(fileSql, [id]);

        res.json({ work, files });

    } catch (err) {
        console.error("Error fetching work details:", err);
        res.status(500).json({ error: "Failed to fetch work details" });
    }
});

// Search works
router.get('/search/query', optionalAuth, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;
        const visibilityClause = isAdmin ? '1=1' : 'w.visible = 1';

        const sql = `
          SELECT 
              w.*,
              (SELECT file FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'}) ORDER BY CAST(f.ordered AS UNSIGNED) ASC LIMIT 1) as cover_image
          FROM works w
          WHERE ${visibilityClause} 
          AND (
              w.work_period LIKE ? OR
              w.talent LIKE ? OR 
              w.stylist LIKE ? OR 
              w.hair LIKE ? OR 
              w.makeup LIKE ? OR
              w.path LIKE ?
          )
          ORDER BY w.ordered DESC
      `;
        const term = `%${q}%`;
        const works = await db.all(sql, [term, term, term, term, term, term]);
        res.json(works);
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

// Reorder files
router.post('/:id/reorder', async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { fileIds } = req.body;

        if (!Array.isArray(fileIds)) {
            return res.status(400).json({ error: "Invalid fileIds format" });
        }

        // cacheOps.clear(); // Invalidate cache because cover image might change


        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        // Capture old order for logging
        const [oldFiles] = await conn.query("SELECT id, file FROM files WHERE workid = ? ORDER BY CAST(ordered AS UNSIGNED) ASC", [id]);
        const oldIds = oldFiles.map(f => f.id);

        for (let i = 0; i < fileIds.length; i++) {
            await conn.query("UPDATE files SET ordered = ? WHERE id = ? AND workid = ?", [i + 1, fileIds[i], id]);
        }

        await conn.commit();

        // Try to identify the moved item
        let movedInfo = "";
        if (oldIds.length === fileIds.length) {
            const diffs = fileIds.map((fid, idx) => ({ id: fid, oldIdx: oldIds.indexOf(fid), newIdx: idx }))
                .filter(d => d.oldIdx !== d.newIdx);

            if (diffs.length > 0) {
                const moved = diffs[0];
                const fileObj = oldFiles.find(f => f.id === moved.id);
                movedInfo = `: Moved "${fileObj ? fileObj.file : moved.id}" (Pos ${moved.oldIdx + 1} → ${moved.newIdx + 1})`;
            }
        }

        // Fetch work info for logging
        const work = await db.get("SELECT talent, path FROM works WHERE id = ?", [id]);
        logEvent(req, 'ORDER CHANGED', `Reordered photos in work: ${work ? (work.talent || work.path) : id}${movedInfo}`);

        res.json({ success: true, message: "Files reordered successfully" });

    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Reorder error:", err);
        res.status(500).json({ error: "Failed to reorder files" });
    } finally {
        if (conn) conn.release();
    }
});

// Reorder works
router.post('/reorder', async (req, res) => {
    let conn;
    try {
        const { workIds } = req.body;

        if (!Array.isArray(workIds)) {
            return res.status(400).json({ error: "Invalid workIds format" });
        }

        // clearWorksCache(); // Invalidate cache - REMOVED


        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        const count = workIds.length;
        for (let i = 0; i < count; i++) {
            // Reverse order for works usually, or based on frontend logic.
            // Original logic: updateStmt.run(count - index, workId);
            await conn.query("UPDATE works SET ordered = ? WHERE id = ?", [count - i, workIds[i]]);
        }

        // Capture old order
        const [oldWorks] = await conn.query("SELECT id, talent, path FROM works ORDER BY ordered DESC");
        const oldWorkIds = oldWorks.map(w => w.id);

        await conn.commit();

        // Let's NOT wait for oldWorks inside transaction if we can facilitate logging outside, 
        // but here we already have it.

        let movedInfo = "";
        if (oldWorkIds.length === workIds.length) {
            const diffs = workIds.map((wid, idx) => ({ id: wid, oldIdx: oldWorkIds.indexOf(wid), newIdx: idx }))
                .filter(d => d.oldIdx !== d.newIdx);
            if (diffs.length > 0) {
                const moved = diffs[0];
                const workObj = oldWorks.find(w => w.id === moved.id);
                movedInfo = `: Moved "${workObj ? (workObj.talent || workObj.path) : moved.id}" (Pos ${moved.oldIdx + 1} → ${moved.newIdx + 1})`;
            }
        }

        // OPTIMISTIC CACHE UPDATE - REMOVED


        // Log: WORK REORDER
        logEvent(req, 'ORDER CHANGED', `Reordered works in the gallery${movedInfo}`);

        res.json({ success: true, message: "Works reordered successfully" });

    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Works reorder error:", err);
        res.status(500).json({ error: "Failed to reorder works" });
    } finally {
        if (conn) conn.release();
    }
});

// Toggle visibility
router.put('/:id/visibility', async (req, res) => {
    try {
        const { id } = req.params;
        const { visible } = req.body;

        // clearWorksCache(); // Old method


        const visibleValue = visible ? 1 : 0;

        const result = await db.run("UPDATE works SET visible = ? WHERE id = ?", [visibleValue, id]);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Work not found" });
        }

        // OPTIMISTIC CACHE UPDATE - REMOVED


        const work = await db.get("SELECT talent, path FROM works WHERE id = ?", [id]);
        logEvent(req, 'VISIBILITY TOGGLE', `Work "${work ? (work.talent || work.path) : id}" visibility set to ${visibleValue ? 'VISIBLE' : 'HIDDEN'}`);

        res.json({ success: true, visible: visibleValue });
    } catch (err) {
        console.error("Visibility update error:", err);
        res.status(500).json({ error: "Failed to update visibility" });
    }
});

// Toggle file visibility
router.put('/files/:id/visibility', optionalAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { visible } = req.body;

        // cacheOps.clear(); // Invalidate cache (changes cover image count)



        const visibleValue = visible ? 1 : 0;
        await db.run("UPDATE files SET visible = ? WHERE id = ?", [visibleValue, id]);

        const file = await db.get("SELECT f.file, w.talent, w.path FROM files f JOIN works w ON f.workid = w.id WHERE f.id = ?", [id]);
        logEvent(req, 'IMAGE VISIBILITY', `Image "${file ? file.file : id}" in work "${file ? (file.talent || file.path) : ''}" set to ${visibleValue ? 'VISIBLE' : 'HIDDEN'}`);

        res.json({ success: true, visible: visibleValue });
    } catch (err) {
        console.error("File visibility update error:", err);
        res.status(500).json({ error: "Failed to update file visibility" });
    }
});

// In-memory job store (Note: In a production app with multiple instances, use Redis)
const zipJobs = new Map();
const archiver = require('archiver');
const os = require('os');

// Start Zip Job
router.post('/:id/download/start', async (req, res) => {
    try {
        const { id } = req.params;
        const { fileIds } = req.body;

        const work = await db.get("SELECT * FROM works WHERE id = ?", [id]);

        if (!work) return res.status(404).json({ error: "Work not found" });

        let sql = "SELECT * FROM files WHERE workid = ? AND visible = 1";
        const params = [id];

        if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
            const placeholders = fileIds.map(() => '?').join(',');
            sql += ` AND id IN (${placeholders})`;
            params.push(...fileIds);
        }

        sql += " ORDER BY CAST(ordered AS UNSIGNED) ASC";

        const files = await db.all(sql, params);
        const totalFiles = files.length;

        if (totalFiles === 0) return res.status(404).json({ error: "No files found" });

        const jobId = crypto.randomUUID();
        const tempFilePath = path.join(os.tmpdir(), `work_${id}_${jobId}.zip`);
        const zipName = (work.work_period || work.talent || 'download').replace(/[^a-z0-9]/gi, '_') + '.zip';

        // Initialize Job
        zipJobs.set(jobId, {
            status: 'processing',
            current: 0,
            total: totalFiles,
            files: files.map(f => f.file),
            workPath: work.path,
            workName: work.work_period || work.talent || work.path,
            user: req.user ? { email: req.user.email, userId: req.user.userId } : null,
            tempPath: tempFilePath,
            filename: zipName,
            startTime: Date.now(),
            archive: null
        });

        // Start Archiving in Background
        const output = fs.createWriteStream(tempFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        const job = zipJobs.get(jobId);
        if (job) job.archive = archive;

        output.on('close', () => {
            const job = zipJobs.get(jobId);
            if (job) job.status = 'ready';
        });

        archive.on('progress', (progress) => {
            const job = zipJobs.get(jobId);
            if (job) job.current = progress.entries.processed;
        });

        archive.on('error', (err) => {
            console.error("Archive error:", err);
            const job = zipJobs.get(jobId);
            if (job) job.status = 'error';
        });

        archive.pipe(output);

        const BASE_PATH = path.resolve(__dirname, '../../../00_PhotoArchive');
        const workDir = path.join(BASE_PATH, work.path);

        for (const file of files) {
            const filePath = path.join(workDir, file.file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file.file });
            }
        }

        archive.finalize();

        res.json({ jobId, total: totalFiles });

    } catch (err) {
        console.error("Download start error:", err);
        res.status(500).json({ error: "Failed to start download" });
    }
});

// Check Job Status
router.get('/download/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = zipJobs.get(jobId);

    if (!job) return res.status(404).json({ error: "Job not found" });

    res.json({
        status: job.status,
        current: job.current,
        total: job.total
    });
});

// Cancel Job
router.post('/download/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = zipJobs.get(jobId);

    if (job) {
        try {
            if (job.archive) {
                job.archive.abort();
            }
            if (fs.existsSync(job.tempPath)) {
                fs.unlinkSync(job.tempPath);
            }
            zipJobs.delete(jobId);
        } catch (e) {
            console.error("Cancel job error", e);
        }
    }
    res.json({ success: true });
});

// Download Finished File
router.get('/download/file/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = zipJobs.get(jobId);

    if (!job || job.status !== 'ready') {
        return res.status(404).send("File not ready or expired");
    }

    res.download(job.tempPath, job.filename, (err) => {
        if (!err) {
            // Log: ZIP DOWNLOAD
            const filenames = job.files.join(', ');
            logEvent(req, 'ZIP DOWNLOAD', `Downloaded ${job.files.length} files (${filenames}) from work: ${job.workName}`, job.user);

            // Cleanup temp file and job
            try {
                fs.unlinkSync(job.tempPath);
                zipJobs.delete(jobId);
            } catch (cleanupErr) {
                console.error("Cleanup error:", cleanupErr);
            }
        }
    });
});

// RENAME / UPDATE METADATA (Admin only)
router.put('/:id', optionalAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { work_period, talent, stylist, hair, makeup } = req.body;

        // clearWorksCache(); // Invalidate cache


        const updates = [];
        const values = [];

        if (work_period !== undefined) { updates.push('work_period = ?'); values.push(work_period); }
        if (talent !== undefined) { updates.push('talent = ?'); values.push(talent); }
        if (stylist !== undefined) { updates.push('stylist = ?'); values.push(stylist); }
        if (hair !== undefined) { updates.push('hair = ?'); values.push(hair); }
        if (makeup !== undefined) { updates.push('makeup = ?'); values.push(makeup); }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        values.push(id);
        const sql = `UPDATE works SET ${updates.join(', ')} WHERE id = ?`;

        const oldWork = await db.get("SELECT * FROM works WHERE id = ?", [id]);
        await db.run(sql, values);

        const changes = [];
        if (work_period !== undefined && oldWork.work_period !== work_period) changes.push(`period: "${oldWork.work_period}" -> "${work_period}"`);
        if (talent !== undefined && oldWork.talent !== talent) changes.push(`talent: "${oldWork.talent}" -> "${talent}"`);
        if (stylist !== undefined && oldWork.stylist !== stylist) changes.push(`stylist: "${oldWork.stylist}" -> "${stylist}"`);
        if (hair !== undefined && oldWork.hair !== hair) changes.push(`hair: "${oldWork.hair}" -> "${hair}"`);
        if (makeup !== undefined && oldWork.makeup !== makeup) changes.push(`makeup: "${oldWork.makeup}" -> "${makeup}"`);

        if (changes.length > 0) {
            logEvent(req, 'WORK EDIT', `Updated metadata for "${oldWork.talent || oldWork.path}": ${changes.join(', ')}`);
        }

        // OPTIMISTIC CACHE UPDATE - REMOVED

        res.json({ success: true });
    } catch (err) {
        console.error("Update failed", err);
        res.status(500).json({ error: "Failed to update work" });
    }
});

// DELETE (Admin only)
router.delete('/:id', optionalAuth, requireAdmin, async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const work = await db.get("SELECT talent, path FROM works WHERE id = ?", [id]);

        if (!work) {
            return res.status(404).json({ error: "Work not found" });
        }

        // clearWorksCache(); // Invalidate cache


        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        // Rename folder on filesystem to preserve it (as requested)
        const workDirPath = path.join(PHOTO_ARCHIVE_PATH, work.path);
        if (fs.existsSync(workDirPath)) {
            const uniqueSuffix = crypto.randomUUID().split('-')[0].toUpperCase();
            const newFolderName = `${work.path}_${uniqueSuffix}`;
            const newPath = path.join(PHOTO_ARCHIVE_PATH, newFolderName);

            try {
                fs.renameSync(workDirPath, newPath);
                console.log(`Renamed deleted folder: ${work.path} -> ${newFolderName}`);
            } catch (fsErr) {
                console.error("Failed to rename folder during delete:", fsErr);
            }
        }

        await conn.query('DELETE FROM files WHERE workid = ?', [id]);
        await conn.query('DELETE FROM works WHERE id = ?', [id]);

        await conn.commit();

        logEvent(req, 'WORK DELETED', `Deleted work: ${work.talent || work.path} (ID: ${id}) - Folder renamed`);

        // OPTIMISTIC CACHE UPDATE - REMOVED


        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Delete failed", err);
        res.status(500).json({ error: "Failed to delete work" });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE FILES (Admin only)
router.post('/:id/files/delete', optionalAuth, requireAdmin, async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { fileIds } = req.body;

        if (!fileIds || !Array.isArray(fileIds)) {
            return res.status(400).json({ error: "No files selected" });
        }

        // cacheOps.clear(); // Invalidate cache (affects file counts and covers - too complex to optimize)



        const work = await db.get("SELECT talent, path FROM works WHERE id = ?", [id]);

        // Use separate query to finding files since IN (?) with array doesn't work simply
        const placeholders = fileIds.map(() => '?').join(',');
        const deletedFiles = await db.all(`SELECT file FROM files WHERE id IN (${placeholders})`, fileIds);
        const deletedFilenames = deletedFiles.map(f => f.file).join(', ');

        conn = await db.pool.getConnection();
        await conn.beginTransaction();

        // Bulk delete or loop
        // DELETE FROM files WHERE id IN (...)
        await conn.query(`DELETE FROM files WHERE id IN (${placeholders}) AND workid = ?`, [...fileIds, id]);

        await conn.commit();

        logEvent(req, 'IMAGE DELETED', `Deleted ${fileIds.length} images (${deletedFilenames}) from work: ${work ? (work.talent || work.path) : id}`);

        res.json({ success: true, message: `Deleted ${fileIds.length} files` });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Delete files failed", err);
        res.status(500).json({ error: "Failed to delete files" });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;

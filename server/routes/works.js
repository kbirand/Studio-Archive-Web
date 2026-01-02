const express = require('express');
const db = require('../db');
const optionalAuth = require('../middleware/optionalAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { logEvent } = require('../logger');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
sharp.cache(false);
const router = express.Router();

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
const getNextFolderIndex = () => {
    const entries = fs.readdirSync(PHOTO_ARCHIVE_PATH, { withFileTypes: true });
    let maxIndex = 0;

    entries.forEach(entry => {
        if (entry.isDirectory()) {
            const match = entry.name.match(/^(\d{6})_/);
            if (match) {
                const index = parseInt(match[1], 10);
                if (index > maxIndex) {
                    maxIndex = index;
                }
            }
        }
    });

    return maxIndex + 2; // Add 2 as per user requirement
};

// CREATE new work (Admin only)
router.post('/create', optionalAuth, requireAdmin, (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Work name is required" });
        }

        // Get next folder index
        const nextIndex = getNextFolderIndex();
        const indexStr = String(nextIndex).padStart(6, '0');

        // Sanitize name
        const sanitizedName = sanitizeFolderName(name.trim());

        // Generate path
        const folderPath = `${indexStr}_${sanitizedName}`;
        const fullPath = path.join(PHOTO_ARCHIVE_PATH, folderPath);

        // Create folder
        fs.mkdirSync(fullPath, { recursive: true });
        fs.chmodSync(fullPath, 0o777);

        // Get max ordered value
        const maxOrderedRow = db.prepare('SELECT MAX(ordered) as maxOrdered FROM works').get();
        const nextOrdered = (maxOrderedRow.maxOrdered || 0) + 1;

        // Insert into database
        const result = db.prepare(`
            INSERT INTO works (path, work_period, talent, stylist, hair, makeup, visible, ordered)
            VALUES (?, ?, NULL, NULL, NULL, NULL, 1, ?)
        `).run(folderPath, name.trim(), nextOrdered);

        const newWorkId = result.lastInsertRowid;

        // Log: WORK CREATE
        logEvent(req, 'WORK CREATE', `Created work: ${name.trim()} (Folder: ${folderPath})`);

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
router.get('/', optionalAuth, (req, res) => {
    try {
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;
        const visibilityClause = isAdmin ? '1=1' : 'w.visible = 1';

        const sql = `
            SELECT 
                w.*,
                (SELECT file FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'}) ORDER BY CAST(f.ordered AS INTEGER) ASC LIMIT 1) as cover_image,
                (SELECT COUNT(*) FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'})) as file_count
            FROM works w
            WHERE ${visibilityClause}
            ORDER BY w.ordered DESC
        `;

        const works = db.prepare(sql).all();

        // Group by Work Period
        const grouped = works.reduce((acc, work) => {
            const period = work.work_period || 'Unknown';
            if (!acc[period]) {
                acc[period] = [];
            }
            acc[period].push(work);
            return acc;
        }, {});

        res.json(grouped);

    } catch (err) {
        console.error("Error fetching works:", err);
        res.status(500).json({ error: "Failed to fetch works" });
    }
});

// GET all works and their files for a specific period
router.get('/period/:period', optionalAuth, (req, res) => {
    try {
        const { period } = req.params;
        // Decode because it might have spaces/special chars
        const decodedPeriod = decodeURIComponent(period);
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;

        const worksSql = `SELECT * FROM works WHERE work_period = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY ordered DESC`;
        const works = db.prepare(worksSql).all(decodedPeriod);

        const result = works.map(work => {
            const fileSql = `SELECT * FROM files WHERE workid = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY CAST(ordered AS INTEGER) DESC`;
            const files = db.prepare(fileSql).all(work.id);
            return {
                ...work,
                files
            };
        });

        res.json(result);
    } catch (err) {
        console.error("Error fetching period details:", err);
        res.status(500).json({ error: "Failed to fetch period details" });
    }
});

// MULTER CONFIG for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // We'll move them to the final destination manually in the route
        // to have better control over work path and subfolders
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
        const work = db.prepare("SELECT path FROM works WHERE id = ?").get(id);

        if (!work) {
            return res.status(404).json({ error: "Work not found" });
        }

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

        // Get max ordered value for this work
        const maxOrderedRow = db.prepare('SELECT MAX(ordered) as maxOrdered FROM files WHERE workid = ?').get(id);
        let nextOrdered = (maxOrderedRow.maxOrdered || 0) + 1;

        const results = [];

        for (const file of req.files) {
            const originalFilename = file.originalname;
            const targetPath = path.join(workDirPath, originalFilename);

            // If file already exists, we might need to handle naming conflict
            // For now, let's just overwrite or rename if needed. 
            // The prompt says "Copies them to related work", usually means keep original name if possible.

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
            db.prepare(`
                INSERT INTO files (workid, file, ordered, visible)
                VALUES (?, ?, ?, 1)
            `).run(id, originalFilename, nextOrdered++);

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
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const { id } = req.params;
        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;

        const work = db.prepare("SELECT * FROM works WHERE id = ?").get(id);

        if (!work) {
            return res.status(404).json({ error: "Work not found" });
        }

        // Access check
        if (!isAdmin && work.visible !== 1) {
            return res.status(403).json({ error: "Access denied" });
        }

        const fileSql = `SELECT * FROM files WHERE workid = ? AND (${isAdmin ? '1=1' : 'visible = 1'}) ORDER BY CAST(ordered AS INTEGER) DESC`;
        const files = db.prepare(fileSql).all(id);

        res.json({ work, files });

    } catch (err) {
        console.error("Error fetching work details:", err);
        res.status(500).json({ error: "Failed to fetch work details" });
    }
});

// Search works
router.get('/search/query', optionalAuth, (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const isPreview = req.query.preview === '1';
        const isAdmin = req.user && req.user.level === 'admin' && !isPreview;
        const visibilityClause = isAdmin ? '1=1' : 'w.visible = 1';

        const sql = `
          SELECT 
              w.*,
              (SELECT file FROM files f WHERE f.workid = w.id AND (${isAdmin ? '1=1' : 'f.visible = 1'}) ORDER BY CAST(f.ordered AS INTEGER) ASC LIMIT 1) as cover_image
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
        const works = db.prepare(sql).all(term, term, term, term, term, term);
        res.json(works);
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

// Reorder files
router.post('/:id/reorder', (req, res) => {
    try {
        const { id } = req.params;
        const { fileIds } = req.body;

        if (!Array.isArray(fileIds)) {
            return res.status(400).json({ error: "Invalid fileIds format" });
        }

        const updateStmt = db.prepare("UPDATE files SET ordered = ? WHERE id = ? AND workid = ?");

        const reorderTransaction = db.transaction((files) => {
            files.forEach((fileId, index) => {
                updateStmt.run(index + 1, fileId, id);
            });
        });

        // Capture old order for logging
        const oldFiles = db.prepare("SELECT id, file FROM files WHERE workid = ? ORDER BY CAST(ordered AS INTEGER) ASC").all(id);
        const oldIds = oldFiles.map(f => f.id);

        reorderTransaction(fileIds);

        // Try to identify the moved item
        let movedInfo = "";
        if (oldIds.length === fileIds.length) {
            // Find first index where they differ
            const firstDiff = fileIds.findIndex((fid, idx) => fid !== oldIds[idx]);
            if (firstDiff !== -1) {
                const movedId = fileIds.find((fid, idx) => fid !== oldIds[idx] && fileIds.indexOf(fid) !== oldIds.indexOf(fid)); // simplistic
                // Better: find which ID is at a different index
                const diffs = fileIds.map((fid, idx) => ({ id: fid, oldIdx: oldIds.indexOf(fid), newIdx: idx }))
                    .filter(d => d.oldIdx !== d.newIdx);

                if (diffs.length > 0) {
                    // Usually the one with the biggest jump or just the one that changed
                    const moved = diffs[0];
                    const fileObj = oldFiles.find(f => f.id === moved.id);
                    movedInfo = `: Moved "${fileObj ? fileObj.file : moved.id}" (Pos ${moved.oldIdx + 1} → ${moved.newIdx + 1})`;
                }
            }
        }

        // Fetch work info for logging
        const work = db.prepare("SELECT talent, path FROM works WHERE id = ?").get(id);
        logEvent(req, 'ORDER CHANGED', `Reordered photos in work: ${work ? (work.talent || work.path) : id}${movedInfo}`);

        res.json({ success: true, message: "Files reordered successfully" });

    } catch (err) {
        console.error("Reorder error:", err);
        res.status(500).json({ error: "Failed to reorder files" });
    }
});

// Reorder works
router.post('/reorder', (req, res) => {
    try {
        const { workIds } = req.body;

        if (!Array.isArray(workIds)) {
            return res.status(400).json({ error: "Invalid workIds format" });
        }

        const updateStmt = db.prepare("UPDATE works SET ordered = ? WHERE id = ?");

        const reorderTransaction = db.transaction((works) => {
            const count = works.length;
            works.forEach((workId, index) => {
                updateStmt.run(count - index, workId);
            });
        });

        // Capture old order
        const oldWorks = db.prepare("SELECT id, talent, path FROM works ORDER BY ordered DESC").all();
        const oldWorkIds = oldWorks.map(w => w.id);

        reorderTransaction(workIds);

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

        // Log: WORK REORDER
        logEvent(req, 'ORDER CHANGED', `Reordered works in the gallery${movedInfo}`);

        res.json({ success: true, message: "Works reordered successfully" });

    } catch (err) {
        console.error("Works reorder error:", err);
        res.status(500).json({ error: "Failed to reorder works" });
    }
});

// Toggle visibility
router.put('/:id/visibility', async (req, res) => {
    try {
        const { id } = req.params;
        const { visible } = req.body;

        // Ensure visible is 0 or 1
        const visibleValue = visible ? 1 : 0;

        const update = db.prepare("UPDATE works SET visible = ? WHERE id = ?");
        const result = update.run(visibleValue, id);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Work not found" });
        }

        const work = db.prepare("SELECT talent, path FROM works WHERE id = ?").get(id);
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

        const visibleValue = visible ? 1 : 0;
        const update = db.prepare("UPDATE files SET visible = ? WHERE id = ?");
        update.run(visibleValue, id);

        const file = db.prepare("SELECT f.file, w.talent, w.path FROM files f JOIN works w ON f.workid = w.id WHERE f.id = ?").get(id);
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
const crypto = require('crypto');
const os = require('os');

// Start Zip Job
router.post('/:id/download/start', (req, res) => {
    try {
        const { id } = req.params;
        const { fileIds } = req.body; // Optional list of file IDs to download

        const work = db.prepare("SELECT * FROM works WHERE id = ?").get(id);

        if (!work) return res.status(404).json({ error: "Work not found" });

        let sql = "SELECT * FROM files WHERE workid = ? AND visible = 1";
        const params = [id];

        if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
            const placeholders = fileIds.map(() => '?').join(',');
            sql += ` AND id IN (${placeholders})`;
            params.push(...fileIds);
        }

        sql += " ORDER BY CAST(ordered AS INTEGER) ASC";

        const files = db.prepare(sql).all(...params);
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
            archive: null // Will be set shortly
        });

        // Start Archiving in Background
        const output = fs.createWriteStream(tempFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Store archive instance
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
router.put('/:id', optionalAuth, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { work_period, talent, stylist, hair, makeup } = req.body;

        // Build dynamic update query
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

        // Log: METADATA UPDATE
        const oldWork = db.prepare("SELECT * FROM works WHERE id = ?").get(id);
        db.prepare(sql).run(...values);

        const changes = [];
        if (work_period !== undefined && oldWork.work_period !== work_period) changes.push(`period: "${oldWork.work_period}" -> "${work_period}"`);
        if (talent !== undefined && oldWork.talent !== talent) changes.push(`talent: "${oldWork.talent}" -> "${talent}"`);
        if (stylist !== undefined && oldWork.stylist !== stylist) changes.push(`stylist: "${oldWork.stylist}" -> "${stylist}"`);
        if (hair !== undefined && oldWork.hair !== hair) changes.push(`hair: "${oldWork.hair}" -> "${hair}"`);
        if (makeup !== undefined && oldWork.makeup !== makeup) changes.push(`makeup: "${oldWork.makeup}" -> "${makeup}"`);

        if (changes.length > 0) {
            logEvent(req, 'WORK EDIT', `Updated metadata for "${oldWork.talent || oldWork.path}": ${changes.join(', ')}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Update failed", err);
        res.status(500).json({ error: "Failed to update work" });
    }
});

// DELETE (Admin only)
router.delete('/:id', optionalAuth, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;

        // Transaction handling (if supported by better-sqlite3 normally, or just sequential)
        const deleteTransaction = db.transaction(() => {
            // Delete files
            db.prepare('DELETE FROM files WHERE workid = ?').run(id);
            // Delete work
            db.prepare('DELETE FROM works WHERE id = ?').run(id);
        });

        const work = db.prepare("SELECT talent, path FROM works WHERE id = ?").get(id);
        deleteTransaction();

        // Log: WORK DELETE
        logEvent(req, 'WORK DELETED', `Deleted work: ${work ? (work.talent || work.path) : id} (ID: ${id})`);

        res.json({ success: true });
    } catch (err) {
        console.error("Delete failed", err);
        res.status(500).json({ error: "Failed to delete work" });
    }
});

// DELETE FILES (Admin only)
router.post('/:id/files/delete', optionalAuth, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { fileIds } = req.body;

        if (!fileIds || !Array.isArray(fileIds)) {
            return res.status(400).json({ error: "No files selected" });
        }

        const deleteStmt = db.prepare('DELETE FROM files WHERE id = ? AND workid = ?');

        const transaction = db.transaction((ids) => {
            ids.forEach(fileId => {
                deleteStmt.run(fileId, id);
            });
        });

        // Log: FILE DELETE
        const work = db.prepare("SELECT talent, path FROM works WHERE id = ?").get(id);
        // GET FILENAMES BEFORE DELETION
        const deletedFiles = db.prepare(`SELECT file FROM files WHERE id IN (${fileIds.join(',')})`).all();
        const deletedFilenames = deletedFiles.map(f => f.file).join(', ');

        transaction(fileIds);

        logEvent(req, 'IMAGE DELETED', `Deleted ${fileIds.length} images (${deletedFilenames}) from work: ${work ? (work.talent || work.path) : id}`);

        res.json({ success: true, message: `Deleted ${fileIds.length} files` });
    } catch (err) {
        console.error("Delete files failed", err);
        res.status(500).json({ error: "Failed to delete files" });
    }
});

module.exports = router;

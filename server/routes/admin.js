const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);
const optionalAuth = require('../middleware/optionalAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { logEvent, getLogs, getActions } = require('../logger');
const router = express.Router();

const PHOTO_ARCHIVE_PATH = process.env.PHOTO_ARCHIVE_PATH;

// Apply auth middleware to all admin routes
router.use(optionalAuth);
router.use(requireAdmin);

// GET all users
router.get('/users', async (req, res) => {
    try {
        const users = await db.all("SELECT id, username, email, level, approved, picture FROM users ORDER BY id DESC");
        res.json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// UPDATE user (approve/ban, change role)
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { level, approved } = req.body;

        // Prevent self-demotion or self-ban just in case (optional safety)
        if (parseInt(id) === req.user.userId) {
            // You might want to allow it, but usually bad UI experience. 
            // Let's verify if they send level.
        }

        const updates = [];
        const params = [];

        if (level !== undefined) {
            updates.push("level = ?");
            params.push(level);
        }
        if (approved !== undefined) {
            updates.push("approved = ?");
            params.push(approved); // 0 or 1
        }

        if (updates.length === 0) return res.json({ success: true });

        params.push(id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;


        // Fetch old user info for logging
        const oldUser = await db.get("SELECT * FROM users WHERE id = ?", [id]);
        await db.run(sql, params);

        // Fetch user info for logging
        const targetUser = await db.get("SELECT username, email FROM users WHERE id = ?", [id]);
        if (targetUser && oldUser) {
            if (approved === 1 && oldUser.approved !== 1) logEvent(req, 'USER APPROVED', `Approved user: ${targetUser.email || targetUser.username}`);
            if (approved === 0 && oldUser.approved !== 0) logEvent(req, 'USER BANNED', `Banned user: ${targetUser.email || targetUser.username}`);
            if (level && oldUser.level !== level) logEvent(req, 'USER LEVEL UPDATED', `Updated user ${targetUser.email || targetUser.username} level: "${oldUser.level}" -> "${level}"`);
        }

        res.json({ success: true });

    } catch (err) {
        console.error("Error updating user:", err);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// DELETE user
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: "Cannot delete yourself" });
        }
        const targetUser = await db.get("SELECT username, email FROM users WHERE id = ?", [id]);

        await db.run("DELETE FROM users WHERE id = ?", [id]);

        if (targetUser) {
            logEvent(req, 'USER DELETED', `Deleted user: ${targetUser.email || targetUser.username}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting user:", err);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// GET asset health status
router.get('/assets/status', async (req, res) => {
    try {
        const works = await db.all("SELECT id, path, work_period, talent FROM works ORDER BY ordered DESC");
        const healthStatus = [];

        for (const work of works) {
            const files = await db.all("SELECT file FROM files WHERE workid = ?", [work.id]);
            const workDirPath = path.join(PHOTO_ARCHIVE_PATH, work.path);
            const previewDir = path.join(workDirPath, 'previews');
            const thumbDir = path.join(workDirPath, 'thumbs');

            let missingPreviews = 0;
            let missingThumbs = 0;

            for (const f of files) {
                if (!fs.existsSync(path.join(previewDir, f.file))) missingPreviews++;
                if (!fs.existsSync(path.join(thumbDir, f.file))) missingThumbs++;
            }

            if (missingPreviews > 0 || missingThumbs > 0) {
                healthStatus.push({
                    id: work.id,
                    path: work.path,
                    work_period: work.work_period,
                    talent: work.talent,
                    missingPreviews,
                    missingThumbs,
                    totalFiles: files.length
                });
            }
        }

        res.json(healthStatus);
    } catch (err) {
        console.error("Error checking asset health:", err);
        res.status(500).json({ error: "Failed to check asset health" });
    }
});

// REGENERATE missing assets for a work
router.post('/assets/regenerate/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const work = await db.get("SELECT path FROM works WHERE id = ?", [id]);
        if (!work) return res.status(404).json({ error: "Work not found" });

        const files = await db.all("SELECT file FROM files WHERE workid = ?", [id]);
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

        let regeneratedCount = 0;
        let pCount = 0;
        let tCount = 0;

        for (const f of files) {
            const originalPath = path.join(workDirPath, f.file);
            const previewPath = path.join(previewDir, f.file);
            const thumbPath = path.join(thumbDir, f.file);

            if (!fs.existsSync(originalPath)) continue;

            let needed = false;

            if (!fs.existsSync(previewPath)) {
                await sharp(originalPath)
                    .resize(3500, 3500, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(previewPath);
                fs.chmodSync(previewPath, 0o666);
                needed = true;
                pCount++;
            }

            if (!fs.existsSync(thumbPath)) {
                await sharp(originalPath)
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toFile(thumbPath);
                fs.chmodSync(thumbPath, 0o666);
                needed = true;
                tCount++;
            }

            if (needed) regeneratedCount++;
        }

        if (regeneratedCount > 0) {
            logEvent(req, 'ASSET REGENERATE', `Regenerated assets for work: ${work.path} (${pCount} previews, ${tCount} thumbnails)`);
        }

        res.json({ success: true, regeneratedCount });
    } catch (err) {
        console.error("Error regenerating assets:", err);
        res.status(500).json({ error: "Failed to regenerate assets: " + err.message });
    }
});

// GET Activity Logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await getLogs(req.query);
        res.json(logs);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

// EXPORT Activity Logs as CSV
router.get('/logs/export', async (req, res) => {
    try {
        // For export, we might want higher limit or no limit
        const exportFilters = { ...req.query, limit: 10000 };
        const logs = await getLogs(exportFilters);

        // Generate CSV
        const headers = ["ID", "Timestamp", "User", "Action", "Description", "IP", "User Agent"];
        const rows = logs.map(l => [
            l.id,
            l.timestamp,
            l.username,
            l.action,
            `"${(l.action_desc || '').replace(/"/g, '""')}"`, // Escape quotes
            l.ip_address,
            `"${(l.user_agent || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=logs_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);
    } catch (err) {
        console.error("Error exporting logs:", err);
        res.status(500).json({ error: "Failed to export logs" });
    }
});

// GET Log Categories (for filter)
router.get('/logs/actions', async (req, res) => {
    try {
        const actions = await getActions();
        res.json(actions);
    } catch (err) {
        console.error("Error fetching log actions:", err);
        res.status(500).json({ error: "Failed to fetch log actions" });
    }
});

module.exports = router;

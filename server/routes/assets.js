const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const optionalAuth = require('../middleware/optionalAuth');
const { logEvent } = require('../logger');
const router = express.Router();

// Base path for assets (../00_PhotoArchive)
const BASE_PATH = process.env.PHOTO_ARCHIVE_PATH;

// Helper to safely resolve paths and prevent directory traversal
const resolveAssetPath = (relativePath) => {
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(BASE_PATH, safePath);
};

// Ensure directory exists
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        fs.chmodSync(dirPath, 0o777);
    }
}

// GET /api/assets?path=WorkPath&file=filename.jpg&type=thumb|preview|original
router.get('/', optionalAuth, (req, res) => {
    const { path: workPathVal, file, type } = req.query;

    if (!workPathVal || !file) {
        return res.status(400).send("Missing path or file parameter");
    }

    const workDir = resolveAssetPath(workPathVal);
    const originalFile = path.join(workDir, file);

    // Check if original exists
    if (!fs.existsSync(originalFile)) {
        return res.status(404).send("Original file not found");
    }

    if (type === 'original') {
        logEvent(req, 'IMAGE DOWNLOAD', `Downloaded original file: ${file} from work: ${workPathVal}`);
        return res.download(originalFile);
    }

    // Define target paths for generated assets
    let targetDir;
    let targetFile;
    let convertArgs;

    if (type === 'thumb') {
        targetDir = path.join(workDir, 'thumbs');
        targetFile = path.join(targetDir, file);
        // PHP: /usr/bin/convert source -colorspace sRGB -thumbnail 512x512 -unsharp 0x.5 target
        convertArgs = `-colorspace sRGB -thumbnail 512x512 -unsharp 0x.5`;
    } else if (type === 'preview') {
        targetDir = path.join(workDir, 'previews');
        targetFile = path.join(targetDir, file);
        // PHP: /usr/bin/convert source -colorspace sRGB -thumbnail 3500x3500 -unsharp 0x.5 target
        convertArgs = `-colorspace sRGB -thumbnail 3500x3500 -quality 85 -unsharp 0x.5`;
    } else {
        return res.status(400).send("Invalid type");
    }

    // If generated file exists, serve it
    if (fs.existsSync(targetFile)) {
        return res.sendFile(targetFile);
    }

    // Generate on the fly
    ensureDir(targetDir);

    // NOTE: This assumes 'convert' is in the system PATH or at /usr/bin/convert.
    // On Windows, ImageMagick might be 'magick convert' or just 'magick'.
    // The PHP code used /usr/bin/convert. We'll try to use 'magick' first (common on Windows) or fall back to 'convert'.
    // Given the USER is on Windows, we'll try a generic command.

    // Quote paths for safety
    const cmd = `magick "${originalFile}" ${convertArgs} "${targetFile}"`;

    console.log(`Generating asset: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            // Fallback for systems where 'magick' isn't the command (old IM)
            const fallbackCmd = `convert "${originalFile}" ${convertArgs} "${targetFile}"`;
            console.log(`Retrying with: ${fallbackCmd}`);

            exec(fallbackCmd, (err2, stdout2, stderr2) => {
                if (err2) {
                    console.error(`Fallback Exec error: ${err2}`);
                    return res.status(500).send("Image generation failed");
                }
                return res.sendFile(targetFile);
            });
            return;
        }
        res.sendFile(targetFile);
    });
});

module.exports = router;

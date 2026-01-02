const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.level !== 'admin') {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }
    next();
};

module.exports = requireAdmin;

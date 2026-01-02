require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const worksRoutes = require('./routes/works');
// const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/assets', require('./routes/assets'));
app.use('/api/admin', require('./routes/admin'));

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));
    
    // Handle React routing - serve index.html for all non-API routes
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(__dirname, '../client/dist/index.html'));
        }
    });
} else {
    app.get('/', (req, res) => {
        res.send('Photo Archive API Running');
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
// Force restart

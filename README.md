# Works Interface - Photo Archive Management System

A modern, full-stack web application for managing and browsing large photo archives. Built for photographers, studios, and creative professionals who need to organize, preview, and share their work efficiently.

![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)
![React](https://img.shields.io/badge/React-18+-blue.svg)
![SQLite](https://img.shields.io/badge/SQLite-3+-lightgrey.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 📋 Table of Contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
  - [Local Development](#local-development)
  - [Docker Deployment](#docker-deployment)
  - [Synology NAS Deployment](#synology-nas-deployment)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### Core Functionality
- **Photo Archive Browser** - Navigate through organized photo collections with an intuitive sidebar
- **Thumbnail Generation** - Automatic on-demand thumbnail and preview generation using Sharp
- **Lightbox View** - Full-screen image preview with keyboard navigation
- **Drag & Drop Reordering** - Reorder photos and works with smooth drag-and-drop (powered by dnd-kit)
- **Multi-Select & Batch Download** - Select multiple files and download as ZIP archive

### User Management
- **Google OAuth Authentication** - Secure sign-in with Google accounts
- **Role-Based Access Control** - Admin, Editor, and Viewer permission levels
- **User Approval System** - Admin approval required for new user access
- **Activity Logging** - Track user actions and file access

### Admin Features
- **User Management Panel** - Approve, edit, or remove users
- **Work Management** - Add, edit, delete, and reorder photo collections
- **File Management** - Upload, rename, delete, and reorder individual files
- **Visibility Controls** - Show/hide works and files from non-admin users

### Technical Features
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **Dark Theme** - Easy on the eyes for extended browsing sessions
- **Lazy Loading** - Efficient loading of thumbnails as you scroll
- **Real-time Updates** - Instant UI updates when making changes
- **SQLite Database** - Lightweight, file-based database requiring no separate server

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Browser   │  │    Auth     │  │    Admin Panel      │  │
│  │  Component  │  │  Component  │  │     Component       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                  │
│                    Axios API Client                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/REST
┌───────────────────────────┴─────────────────────────────────┐
│                     Server (Express.js)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Auth API   │  │  Works API  │  │    Assets API       │  │
│  │  /api/auth  │  │ /api/works  │  │   /api/assets       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   JWT Auth  │  │   SQLite    │  │   Sharp (Images)    │  │
│  │ Middleware  │  │  Database   │  │   Processing        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                    File System Storage                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  /PhotoArchive                                          ││
│  │  ├── works.db          (SQLite database)                ││
│  │  ├── user_logs.db      (Activity logs)                  ││
│  │  ├── 000001_Project_Name/                               ││
│  │  │   ├── image1.jpg                                     ││
│  │  │   ├── image2.jpg                                     ││
│  │  │   ├── thumbs/       (auto-generated)                 ││
│  │  │   └── previews/     (auto-generated)                 ││
│  │  └── 000002_Another_Project/                            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 📦 Prerequisites

### For Local Development
- **Node.js** 18.x or higher (20.x recommended)
- **npm** 9.x or higher
- **Python 3** (required for Sharp native compilation)
- **Build tools** (for Sharp):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` package
  - Windows: Visual Studio Build Tools

### For Docker Deployment
- **Docker** 20.x or higher
- **Docker Compose** 2.x or higher

### For Synology NAS
- **DSM 7.0** or higher
- **Container Manager** package installed
- SSH access (recommended)

## 🚀 Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/works-interface.git
   cd works-interface
   ```

2. **Install server dependencies**
   ```bash
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Create environment file**
   ```bash
   cp .env.example .env
   ```

5. **Configure environment variables**
   Edit `.env` with your settings:
   ```env
   PORT=3002
   PHOTO_ARCHIVE_PATH=/path/to/your/photo/archive
   JWT_SECRET=your_super_secret_key_change_this
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   ```

6. **Create client environment file**
   ```bash
   cp client/.env.example client/.env
   ```

   Edit `client/.env`:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   VITE_API_URL=http://localhost:3002
   ```

7. **Initialize the database**
   
   The application expects a SQLite database at `PHOTO_ARCHIVE_PATH/works.db`. If you don't have one, you'll need to create the schema:
   ```sql
   -- works table
   CREATE TABLE works (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       path TEXT NOT NULL,
       name TEXT NOT NULL,
       ordered INTEGER DEFAULT 0,
       visible INTEGER DEFAULT 1,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );

   -- files table
   CREATE TABLE files (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       workid INTEGER NOT NULL,
       file TEXT NOT NULL,
       ordered INTEGER DEFAULT 0,
       visible INTEGER DEFAULT 1,
       FOREIGN KEY (workid) REFERENCES works(id)
   );

   -- users table
   CREATE TABLE users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT UNIQUE NOT NULL,
       username TEXT,
       picture TEXT,
       level INTEGER DEFAULT 0,
       approved INTEGER DEFAULT 0,
       preferences TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```

8. **Start the development server**
   ```bash
   npm run dev
   ```

   This starts both the backend (port 3002) and frontend (port 5173) concurrently.

9. **Access the application**
   
   Open your browser and navigate to: `http://localhost:5173`

### Docker Deployment

1. **Build the Docker image**
   ```bash
   docker build -t works-interface .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   
   Open your browser and navigate to: `http://localhost:3002`

### Synology NAS Deployment

See [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) for detailed Synology-specific instructions.

**Quick Start:**

1. Copy files to NAS:
   ```bash
   scp -r . user@nas-ip:/volume1/docker/works-interface
   ```

2. SSH into NAS and configure:
   ```bash
   ssh user@nas-ip
   cd /volume1/docker/works-interface
   nano .env  # Configure your settings
   ```

3. Update `docker-compose.yml` volume paths to match your NAS structure

4. Build and run:
   ```bash
   docker-compose up -d --build
   ```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | `3002` |
| `NODE_ENV` | Environment (`development` or `production`) | No | `development` |
| `PHOTO_ARCHIVE_PATH` | Absolute path to photo archive directory | **Yes** | - |
| `JWT_SECRET` | Secret key for JWT token signing | **Yes** | - |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | **Yes** | - |

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client IDs**
5. Configure the consent screen if prompted
6. Set application type to **Web application**
7. Add authorized JavaScript origins:
   - `http://localhost:5173` (development)
   - `http://localhost:3002` (production/Docker)
   - Your production domain
8. Add authorized redirect URIs:
   - `http://localhost:5173` (development)
   - `http://localhost:3002` (production/Docker)
   - Your production domain
9. Copy the Client ID to your `.env` files

### Photo Archive Structure

The application expects your photo archive to follow this structure:

```
/PhotoArchive/
├── works.db                    # SQLite database
├── user_logs.db               # Activity logs database
├── 000001_Project_Name/       # Work folder (ID_Name format)
│   ├── photo1.jpg             # Original images
│   ├── photo2.jpg
│   ├── photo3.png
│   ├── thumbs/                # Auto-generated thumbnails
│   │   ├── photo1.jpg
│   │   ├── photo2.jpg
│   │   └── photo3.png
│   └── previews/              # Auto-generated previews
│       ├── photo1.jpg
│       ├── photo2.jpg
│       └── photo3.png
├── 000002_Another_Project/
│   └── ...
└── ...
```

**Supported Image Formats:** JPG, JPEG, PNG, GIF, WEBP, TIFF

## 📖 Usage

### First-Time Setup

1. **Sign in with Google** - Click the Google sign-in button
2. **Wait for approval** - An admin must approve your account
3. **Browse works** - Once approved, you can browse the photo archive

### User Roles

| Role | Level | Permissions |
|------|-------|-------------|
| Viewer | 0 | Browse visible works and files, download |
| Editor | 1 | All Viewer permissions + reorder files |
| Admin | 2 | Full access including user management, add/edit/delete works |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Navigate images in lightbox |
| `Escape` | Close lightbox |
| `Click outside` | Close lightbox |

### Admin Panel

Access the admin panel by clicking the gear icon (visible to admins only):

- **Users Tab** - Manage user accounts and permissions
- **Works Tab** - Add, edit, delete, and reorder works
- **Files Tab** - Manage files within selected work

## 📚 API Reference

### Authentication

#### `POST /api/auth/google`
Authenticate with Google OAuth token.

**Request Body:**
```json
{
  "credential": "google_id_token"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "User Name",
    "level": 0,
    "approved": 1
  }
}
```

### Works

#### `GET /api/works`
Get all works (filtered by visibility for non-admins).

#### `GET /api/works/:id`
Get single work with files.

#### `POST /api/works` (Admin)
Create new work.

#### `PUT /api/works/:id` (Admin)
Update work.

#### `DELETE /api/works/:id` (Admin)
Delete work.

### Assets

#### `GET /api/assets`
Get image asset (thumbnail, preview, or original).

**Query Parameters:**
- `path` - Work folder path
- `file` - Filename
- `type` - `thumb`, `preview`, or `original`

### Downloads

#### `POST /api/works/download/start`
Start ZIP archive generation for selected files.

#### `GET /api/works/download/status/:jobId`
Check ZIP generation progress.

#### `GET /api/works/download/file/:jobId`
Download generated ZIP file.

## 📁 Project Structure

```
works-interface/
├── client/                    # React frontend
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js      # API client configuration
│   │   ├── components/
│   │   │   └── AdminPanel.jsx
│   │   ├── pages/
│   │   │   ├── Browser.jsx   # Main browser component
│   │   │   └── Login.jsx     # Login page
│   │   ├── App.jsx           # Root component
│   │   └── main.jsx          # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── server/                    # Express backend
│   ├── routes/
│   │   ├── admin.js          # Admin API routes
│   │   ├── assets.js         # Asset serving routes
│   │   ├── auth.js           # Authentication routes
│   │   └── works.js          # Works API routes
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── db.js                 # Database connection
│   ├── logger.js             # Activity logging
│   └── index.js              # Server entry point
├── .env.example              # Environment template
├── .dockerignore
├── docker-compose.yml
├── Dockerfile
├── DOCKER_DEPLOY.md          # Docker deployment guide
├── nodemon.json
├── package.json
└── README.md
```

## 🔧 Troubleshooting

### Common Issues

#### "Cannot open database because the directory does not exist"
- Ensure `PHOTO_ARCHIVE_PATH` in `.env` points to an existing directory
- Check that the path is absolute, not relative
- Verify the `works.db` file exists in that directory

#### Thumbnails not loading (404 errors)
- Check that the server is running on the correct port
- Verify `VITE_API_URL` matches your server URL
- Ensure the photo archive path is correctly mounted (Docker)

#### Google Sign-in not working
- Verify `VITE_GOOGLE_CLIENT_ID` is set correctly in both `.env` files
- Check that your domain is added to authorized origins in Google Console
- Clear browser cache and cookies

#### Sharp installation fails
- Install build tools for your platform:
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt-get install build-essential`
  - Windows: Install Visual Studio Build Tools

#### Docker container won't start
- Check logs: `docker-compose logs`
- Verify volume mounts are correct
- Ensure ports aren't already in use

### Getting Help

1. Check the [Issues](https://github.com/yourusername/works-interface/issues) page
2. Search existing issues before creating a new one
3. Include relevant logs and environment details when reporting issues

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits atomic and well-described

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [React](https://reactjs.org/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Express.js](https://expressjs.com/) - Server framework
- [Sharp](https://sharp.pixelplumbing.com/) - Image processing
- [dnd-kit](https://dndkit.com/) - Drag and drop
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite driver

---

**Made with ❤️ for photographers and creative professionals**

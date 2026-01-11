# Docker Deployment for Synology NAS

## Prerequisites
- Synology NAS with Docker package installed (Container Manager)
- SSH access to your NAS
- Your photo archive copied to the NAS
- **MySQL Database** (MariaDB package on Synology or external)

## Directory Structure on NAS
```
/volume1/
├── PhotoArchive/          # Your photo archive (00_PhotoArchive contents)
├── PhotoArchive/          # Your photo archive (00_PhotoArchive contents)
│   ├── 000001_All_06-07/
│   ├── 000003_Boyner_SS07/
│   └── ...
└── docker/
    └── works-interface/   # This application
        ├── Dockerfile
        ├── docker-compose.yml
        ├── .env
        ├── package.json
        ├── server/
        └── client/
```

## Setup Steps

### 1. Copy files to NAS
Copy the entire `Interface` folder to your NAS:
```bash
scp -r /Volumes/Works/Interface user@nas-ip:/volume1/docker/works-interface
```

### 2. Create .env file on NAS
SSH into your NAS and create the environment file:
```bash
ssh user@nas-ip
cd /volume1/docker/works-interface
nano .env
```

Add the following content:
```env
PORT=3002
NODE_ENV=production
PHOTO_ARCHIVE_PATH=/data/PhotoArchive
JWT_SECRET=your_super_secret_key_change_this_to_something_random
VITE_GOOGLE_CLIENT_ID=your_google_client_id

# Database Settings
DB_HOST=192.168.1.50   # REPLACE WITH YOUR NAS IP
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=studioarchive
```

### 3. Update docker-compose.yml paths
Edit `docker-compose.yml` and adjust the volume paths. 

**Note on Networking:** The configuration uses `network_mode: "host"`. This means the application shares the network IP of your NAS directly.
-   `DB_HOST=127.0.0.1` will work because "localhost" is now the NAS itself.
-   The app will bind directly to port `3002` on your NAS.

```yaml
volumes:
  # Change the first part to your actual NAS path
  - /volume1/Works/00_PhotoArchive:/data/PhotoArchive:rw
```

### 4. Build and run with Docker Compose
```bash
cd /volume1/docker/works-interface
docker-compose up -d --build
```

### 5. Check logs
```bash
docker-compose logs -f
```

### 6. Access the application
Open your browser and navigate to:
```
http://nas-ip:3002
```

## Alternative: Using Synology Container Manager UI

1. Open **Container Manager** in DSM
2. Go to **Project** → **Create**
3. Set project name: `works-interface`
4. Set path: `/volume1/docker/works-interface`
5. Select `docker-compose.yml`
6. Click **Build** and then **Start**

## Updating the Application

```bash
cd /volume1/docker/works-interface
git pull  # if using git, or copy new files
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Container won't start
Check logs:
```bash
docker-compose logs
```

### Permission issues
Ensure the photo archive is readable:
```bash
chmod -R 755 /volume1/PhotoArchive
```

### Database locked errors
Make sure only one instance is running:
```bash
docker-compose down
docker ps -a  # check for orphaned containers
```

### Port already in use
Change the port in `docker-compose.yml`:
```yaml
ports:
  - "3003:3002"  # Use 3003 externally
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3002) | No |
| `PHOTO_ARCHIVE_PATH` | Path to photo archive inside container | Yes |
| `JWT_SECRET` | Secret for JWT tokens | Yes |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `DB_HOST` | MySQL Host IP (Use NAS IP, not localhost) | Yes |
| `DB_USER` | MySQL User | Yes |
| `DB_PASSWORD` | MySQL Password | Yes |
| `DB_NAME` | Database Name | Yes |
| `NODE_ENV` | Set to `production` | Yes |

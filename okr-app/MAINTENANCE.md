# OKR Tracker - Maintenance Playbook

Operations guide for deploying, maintaining, and backing up the OKR Tracker.

## Table of Contents

- [Deployment](#deployment)
- [HTTPS Setup](#https-setup)
- [Multiple Services](#multiple-services)
- [Database Backup](#database-backup)
- [Nextcloud Integration](#nextcloud-integration)
- [Raspberry Pi Deployment](#raspberry-pi-deployment)
- [Behind a Firewall](#behind-a-firewall)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Deployment

### Quick Start (Docker)

```bash
# Clone and enter directory
cd /opt/okr-tracker

# Create data directory
mkdir -p data

# Create environment file
cat > .env << 'EOF'
ADMIN_USERNAME=youruser
ORIGIN=https://okr.yourdomain.com
EOF

# Start the service
docker compose up -d
```

### Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
services:
  okr:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - ADMIN_USERNAME=${ADMIN_USERNAME:-}
      - ORIGIN=${ORIGIN:-http://localhost:3000}
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Systemd Service (Without Docker)

Create `/etc/systemd/system/okr-tracker.service`:

```ini
[Unit]
Description=OKR Tracker
After=network.target

[Service]
Type=simple
User=okr
WorkingDirectory=/opt/okr-tracker
ExecStart=/usr/bin/node build
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=ORIGIN=https://okr.yourdomain.com
Environment=ADMIN_USERNAME=youruser

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable okr-tracker
sudo systemctl start okr-tracker
```

---

## HTTPS Setup

### Option 1: Caddy (Recommended - Easiest)

Caddy automatically handles SSL certificates via Let's Encrypt.

Install Caddy:
```bash
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:
```
okr.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

Done. Caddy automatically obtains and renews certificates.

### Option 2: Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/okr`:
```nginx
server {
    listen 80;
    server_name okr.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/okr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d okr.yourdomain.com
```

### Option 3: Cloudflare Tunnel (No Port Forwarding)

Best for home servers behind NAT/firewall.

```bash
# Install cloudflared
curl -L https://pkg.cloudflare.com/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create okr-tracker

# Configure tunnel
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /home/youruser/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: okr.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Run as service
sudo cloudflared service install
sudo systemctl start cloudflared
```

---

## Multiple Services

Run multiple services behind a single reverse proxy. One Caddy/Nginx instance handles HTTPS for all your apps.

### Caddy: Multiple Domains

```
# /etc/caddy/Caddyfile

okr.yourdomain.com {
    reverse_proxy localhost:3000
}

nextcloud.yourdomain.com {
    reverse_proxy localhost:8080
}

homeassistant.yourdomain.com {
    reverse_proxy localhost:8123
}

grafana.yourdomain.com {
    reverse_proxy localhost:3001
}
```

Caddy automatically obtains and renews SSL certificates for each domain.

### Caddy: Path-Based Routing (Single Domain)

```
# /etc/caddy/Caddyfile

yourdomain.com {
    # OKR Tracker at /okr
    handle /okr/* {
        uri strip_prefix /okr
        reverse_proxy localhost:3000
    }

    # Grafana at /grafana
    handle /grafana/* {
        reverse_proxy localhost:3001
    }

    # Default - Home Assistant
    handle {
        reverse_proxy localhost:8123
    }
}
```

**Note:** Path-based routing requires apps to support running under a subpath. OKR Tracker needs `ORIGIN=https://yourdomain.com/okr` in this case.

### Nginx: Multiple Domains

```nginx
# /etc/nginx/sites-available/okr
server {
    listen 443 ssl http2;
    server_name okr.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/okr.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/okr.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# /etc/nginx/sites-available/nextcloud
server {
    listen 443 ssl http2;
    server_name nextcloud.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/nextcloud.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nextcloud.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10G;  # For file uploads
    }
}
```

Get certificates for each domain:
```bash
sudo certbot --nginx -d okr.yourdomain.com
sudo certbot --nginx -d nextcloud.yourdomain.com
```

### Nginx: Wildcard Certificate

Use a single wildcard certificate for all subdomains:

```bash
# Get wildcard cert (requires DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns \
    -d "yourdomain.com" -d "*.yourdomain.com"
```

Then reference the wildcard cert in all server blocks:
```nginx
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

### Cloudflare Tunnel: Multiple Services

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /home/youruser/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: okr.yourdomain.com
    service: http://localhost:3000
  - hostname: nextcloud.yourdomain.com
    service: http://localhost:8080
  - hostname: homeassistant.yourdomain.com
    service: http://localhost:8123
  - service: http_status:404
```

### Tailscale: Multiple Services

With Tailscale Serve, expose multiple services:

```bash
# Serve OKR on port 443 (default)
tailscale serve https / http://localhost:3000

# Or use different paths
tailscale serve https /okr http://localhost:3000
tailscale serve https /grafana http://localhost:3001
```

### Docker Compose: All Services Together

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

  okr:
    build: ./okr-tracker
    restart: unless-stopped
    expose:
      - "3000"
    volumes:
      - ./okr-data:/app/data
    environment:
      - ORIGIN=https://okr.yourdomain.com

  nextcloud:
    image: nextcloud
    restart: unless-stopped
    expose:
      - "80"
    volumes:
      - ./nextcloud-data:/var/www/html

volumes:
  caddy_data:
  caddy_config:
```

With Caddyfile:
```
okr.yourdomain.com {
    reverse_proxy okr:3000
}

nextcloud.yourdomain.com {
    reverse_proxy nextcloud:80
}
```

### Port Allocation Reference

Keep track of which ports your services use:

| Service | Port | Domain |
|---------|------|--------|
| OKR Tracker | 3000 | okr.yourdomain.com |
| Nextcloud | 8080 | nextcloud.yourdomain.com |
| Home Assistant | 8123 | ha.yourdomain.com |
| Grafana | 3001 | grafana.yourdomain.com |
| Portainer | 9000 | portainer.yourdomain.com |

---

## Database Backup

The database is a single SQLite file at `./data/okr.db`.

### Manual Backup

```bash
# Stop writes (optional but safest)
sqlite3 ./data/okr.db "PRAGMA wal_checkpoint(TRUNCATE);"

# Copy database
cp ./data/okr.db ./backups/okr-$(date +%Y%m%d-%H%M%S).db
```

### Automated Backup Script

Create `/opt/okr-tracker/backup.sh`:

```bash
#!/bin/bash
set -e

DB_PATH="/opt/okr-tracker/data/okr.db"
BACKUP_DIR="/opt/okr-tracker/backups"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Checkpoint WAL to main database
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"

# Create backup with timestamp
BACKUP_FILE="$BACKUP_DIR/okr-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Remove old backups
find "$BACKUP_DIR" -name "okr-*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup created: ${BACKUP_FILE}.gz"
```

```bash
chmod +x /opt/okr-tracker/backup.sh
```

### Cron Schedule

```bash
# Edit crontab
crontab -e

# Add daily backup at 3 AM
0 3 * * * /opt/okr-tracker/backup.sh >> /var/log/okr-backup.log 2>&1
```

### Restore from Backup

```bash
# Stop the service
sudo systemctl stop okr-tracker

# Restore
gunzip -c backups/okr-20250111-030000.db.gz > data/okr.db

# Start the service
sudo systemctl start okr-tracker
```

---

## Nextcloud Integration

### Option 1: Nextcloud Sync Client (Easiest)

Install the Nextcloud sync client and sync the backup directory.

```bash
# Install Nextcloud client
sudo apt install -y nextcloud-desktop-cmd

# Create Nextcloud config
mkdir -p ~/.config/Nextcloud

# Sync backups to Nextcloud
nextcloudcmd -u YOUR_USERNAME -p YOUR_PASSWORD \
  /opt/okr-tracker/backups \
  https://your-nextcloud.com/remote.php/webdav/OKR-Backups/
```

### Option 2: WebDAV Mount (Recommended)

Mount Nextcloud as a local directory via WebDAV.

```bash
# Install davfs2
sudo apt install -y davfs2

# Create mount point
sudo mkdir -p /mnt/nextcloud

# Add to /etc/fstab
echo "https://your-nextcloud.com/remote.php/webdav/ /mnt/nextcloud davfs user,noauto,_netdev 0 0" | sudo tee -a /etc/fstab

# Create credentials file
sudo mkdir -p /etc/davfs2
echo "/mnt/nextcloud YOUR_USERNAME YOUR_PASSWORD" | sudo tee -a /etc/davfs2/secrets
sudo chmod 600 /etc/davfs2/secrets

# Mount
sudo mount /mnt/nextcloud
```

Update backup script to use Nextcloud:

```bash
#!/bin/bash
set -e

DB_PATH="/opt/okr-tracker/data/okr.db"
BACKUP_DIR="/mnt/nextcloud/OKR-Backups"
RETENTION_DAYS=30

# Mount Nextcloud if not mounted
mountpoint -q /mnt/nextcloud || mount /mnt/nextcloud

mkdir -p "$BACKUP_DIR"

# Checkpoint and backup
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
BACKUP_FILE="$BACKUP_DIR/okr-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# Cleanup old backups
find "$BACKUP_DIR" -name "okr-*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup synced to Nextcloud: ${BACKUP_FILE}.gz"
```

### Option 3: Rclone (Most Flexible)

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure Nextcloud remote
rclone config
# Choose: n (new remote)
# Name: nextcloud
# Type: webdav
# URL: https://your-nextcloud.com/remote.php/webdav/
# Vendor: nextcloud
# User: YOUR_USERNAME
# Password: YOUR_PASSWORD

# Test connection
rclone ls nextcloud:

# Sync backups
rclone sync /opt/okr-tracker/backups nextcloud:OKR-Backups/
```

Backup script with rclone:

```bash
#!/bin/bash
set -e

DB_PATH="/opt/okr-tracker/data/okr.db"
LOCAL_BACKUP="/opt/okr-tracker/backups"

mkdir -p "$LOCAL_BACKUP"

# Backup locally first
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
BACKUP_FILE="$LOCAL_BACKUP/okr-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# Sync to Nextcloud
rclone sync "$LOCAL_BACKUP" nextcloud:OKR-Backups/ --max-age 30d

# Local cleanup
find "$LOCAL_BACKUP" -name "okr-*.db.gz" -mtime +7 -delete

echo "Backup complete and synced to Nextcloud"
```

---

## Raspberry Pi Deployment

### Prerequisites

- Raspberry Pi 4 (2GB+ RAM recommended) or Pi 5
- Raspberry Pi OS (64-bit recommended)
- SD card or SSD (SSD recommended for database performance)

### Installation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build dependencies (for bcrypt)
sudo apt install -y build-essential python3

# Create user and directory
sudo useradd -r -m -d /opt/okr-tracker okr
sudo -u okr mkdir -p /opt/okr-tracker

# Clone or copy your app
cd /opt/okr-tracker
sudo -u okr git clone https://github.com/yourusername/okr-tracker.git .

# Install dependencies
sudo -u okr npm ci

# Build
sudo -u okr npm run build

# Push database schema
sudo -u okr npm run db:push
```

### Performance Optimizations

```bash
# Use external SSD for database (recommended)
# Mount SSD to /mnt/ssd, then symlink data directory
sudo -u okr ln -s /mnt/ssd/okr-data /opt/okr-tracker/data

# Reduce memory usage - add to .env
echo "NODE_OPTIONS=--max-old-space-size=512" >> /opt/okr-tracker/.env

# Enable swap if needed
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Docker on Raspberry Pi

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# For ARM64, use the standard docker-compose.yml
# The Dockerfile should work as-is on ARM64

docker compose up -d
```

### Caddy on Raspberry Pi

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

---

## Behind a Firewall

### Option 1: Cloudflare Tunnel (Recommended)

No port forwarding required. See [HTTPS Setup - Cloudflare Tunnel](#option-3-cloudflare-tunnel-no-port-forwarding).

### Option 2: Tailscale (Private Access)

Access your OKR tracker from anywhere via Tailscale VPN.

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up

# Your Pi gets a Tailscale IP (e.g., 100.x.y.z)
# Access via http://100.x.y.z:3000 from any Tailscale device
```

For HTTPS on Tailscale:

```bash
# Enable HTTPS certificates
sudo tailscale cert okr-pi.tail-net.ts.net

# Configure Caddy to use Tailscale certs
cat > /etc/caddy/Caddyfile << 'EOF'
okr-pi.tail-net.ts.net {
    reverse_proxy localhost:3000
    tls /var/lib/tailscale/certs/okr-pi.tail-net.ts.net.crt /var/lib/tailscale/certs/okr-pi.tail-net.ts.net.key
}
EOF
```

### Option 3: WireGuard VPN

```bash
# Install WireGuard
sudo apt install -y wireguard

# Generate keys
wg genkey | tee privatekey | wg pubkey > publickey

# Configure /etc/wireguard/wg0.conf on both server and client
# Then access OKR via the WireGuard IP
```

### Option 4: SSH Tunnel (Quick & Dirty)

From your local machine:

```bash
# Forward local port 3000 to Pi's port 3000
ssh -L 3000:localhost:3000 user@your-pi-local-ip

# Access at http://localhost:3000
```

### Local Network Only (No External Access)

If you only need access within your home network:

```bash
# Bind to all interfaces
# In docker-compose.yml, change:
ports:
  - "3000:3000"  # Instead of 127.0.0.1:3000:3000

# Or for systemd, set ORIGIN to your local IP
Environment=ORIGIN=http://192.168.1.100:3000
```

Access via `http://raspberry-pi-hostname.local:3000` or `http://192.168.1.x:3000`.

---

## Monitoring & Troubleshooting

### Health Check Endpoint

Add a simple health check (if not present):

```bash
# Test health
curl http://localhost:3000/api/health
```

### View Logs

```bash
# Docker
docker compose logs -f okr

# Systemd
sudo journalctl -u okr-tracker -f
```

### Database Maintenance

```bash
# Check database integrity
sqlite3 ./data/okr.db "PRAGMA integrity_check;"

# Vacuum (reclaim space)
sqlite3 ./data/okr.db "VACUUM;"

# Analyze (optimize queries)
sqlite3 ./data/okr.db "ANALYZE;"
```

### Common Issues

**App won't start:**
```bash
# Check if port is in use
sudo lsof -i :3000

# Check Node.js version
node --version  # Should be 20+
```

**Database locked:**
```bash
# Check for stale WAL files
ls -la ./data/

# Force checkpoint
sqlite3 ./data/okr.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

**Out of memory (Raspberry Pi):**
```bash
# Check memory usage
free -h

# Restart the service
sudo systemctl restart okr-tracker
```

**SSL certificate issues:**
```bash
# Caddy - check logs
sudo journalctl -u caddy -f

# Certbot - renew manually
sudo certbot renew --dry-run
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start service | `docker compose up -d` or `sudo systemctl start okr-tracker` |
| Stop service | `docker compose down` or `sudo systemctl stop okr-tracker` |
| View logs | `docker compose logs -f` or `journalctl -u okr-tracker -f` |
| Backup now | `/opt/okr-tracker/backup.sh` |
| Restore backup | `gunzip -c backup.db.gz > data/okr.db` |
| Check DB health | `sqlite3 data/okr.db "PRAGMA integrity_check;"` |
| Update app | `git pull && npm ci && npm run build && sudo systemctl restart okr-tracker` |

---

## Backup Checklist

- [ ] Backup script created and tested
- [ ] Cron job scheduled
- [ ] Nextcloud/remote sync configured
- [ ] Test restore procedure documented
- [ ] Retention policy set (default: 30 days)

#!/usr/bin/env bash
# StaffSync - Setup Script for New PC (Linux/macOS)
# Usage: chmod +x setup-new-pc.sh && ./setup-new-pc.sh

set -e

echo "====================================================="
echo "  StaffSync - Automated Setup for New PC (Unix)"
echo "====================================================="

# 1. Check Node.js
echo -e "\n[1/6] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 18 or 20 LTS."
    exit 1
fi
echo "      Node.js OK: $(node -v)"

# 2. Check Docker
echo -e "\n[2/6] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not running."
    exit 1
fi
echo "      Docker OK"

# 3. Setup Environment Files (.env)
echo -e "\n[3/6] Setting up environment files (.env)..."
if [ ! -f "apps/backend/.env" ]; then
    cp apps/backend/.env.example apps/backend/.env
    echo "      Created apps/backend/.env from .env.example"
fi

if [ ! -f "apps/frontend/.env.local" ]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > apps/frontend/.env.local
    echo "      Created apps/frontend/.env.local"
fi

# 4. Install Dependencies
echo -e "\n[4/6] Installing npm dependencies..."
npm install

# 5. Start Docker Containers
echo -e "\n[5/6] Starting Docker containers (Postgres, Redis)..."
docker compose -f infra/docker/docker-compose.yml up -d

echo "      Waiting for PostgreSQL to be healthy..."
until [ "`docker inspect -f {{.State.Health.Status}} attendance-postgres 2>/dev/null`"=="healthy" ]; do
    sleep 1
done
echo "      Postgres is ready!"

# 6. Database Initialization
echo -e "\n[6/6] Initializing Database..."
cd apps/backend
npx prisma generate

LATEST_BACKUP="../../backups/latest-db-backup.sql"
if [ -f "$LATEST_BACKUP" ]; then
    echo "      Restoring database from existing backup..."
    docker exec -i attendance-postgres psql -U attendance_user -d attendance_db < "$LATEST_BACKUP"
    echo "      Database backup restored successfully!"
else
    echo "      Running Prisma db push and initial seed..."
    npx prisma db push
    npm run seed
    echo "      Fresh database schema initialized with seed data!"
fi

cd ../..

echo ""
echo "====================================================="
echo "  SETUP COMPLETE! StaffSync is ready on this machine."
echo "====================================================="
echo ""
echo "To start the application:"
echo "  Terminal 1: npm run dev:backend"
echo "  Terminal 2: npm run dev:frontend"
echo ""
echo "Then open: http://localhost:3000"
echo "====================================================="

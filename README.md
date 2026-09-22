<<<<<<< HEAD
# StaffSync
=======
﻿# Attendance Management System

A production-ready attendance system with face recognition, biometric kiosk, daily-wage payroll, PDF payslips, and email delivery.

## Features

- Face recognition kiosk: employee walks up, taps IN/OUT, face verifies identity
- Strict one-IN / one-OUT per day, prevents duplicate punches automatically
- Admin dashboard: manage employees, attendance, payroll, devices, face enrollments
- Payroll engine: daily-wage calculation, PF, professional tax, income tax slabs
- PDF payslips: auto-generated, emailed via SMTP (Ethereal in dev)
- Admin overrides: edit/delete any attendance log (with day recompute)
- Device API keys: each kiosk/device gets a scoped key

## Architecture

    Browser Kiosk (/punch)  ->  Backend (Express + Prisma)  ->  PostgreSQL + Redis
                                |
                                +->  Face Service (Python + dlib)

    Admin Dashboard (/employees, /payroll, etc.) -> same backend

| Service | Tech | Port |
|---|---|---|
| Frontend | Next.js 16 + Tailwind + React Query | 3000 |
| Backend | Express 5 + TypeScript + Prisma | 4000 |
| Face service | Python 3.11 + Flask + face_recognition | 5000 |
| PostgreSQL | postgres:16-alpine (Docker) | 55432 |
| Redis | redis:7-alpine (Docker) | 6379 |

Note: on Windows with a native Postgres install, port 5432 is taken. We use 55432 for the containerized Postgres.

## Prerequisites

- Node.js 20+
- Docker Desktop for Windows
- Git

## Setup

### 1. Install dependencies

    cd apps/backend
    npm install

    cd ../frontend
    npm install

### 2. Configure environment

Copy .env.example to .env in both apps and fill in secrets:

    cd apps/backend
    Copy-Item .env.example .env

    cd ../frontend
    Copy-Item .env.example .env.local

### 3. Start Docker services

    docker compose -f infra/docker/docker-compose.yml up -d

First run downloads images and builds dlib (takes 20-30 min on Windows). Subsequent runs are instant.

### 4. Set up the database

    cd apps/backend
    npx prisma db push
    npx prisma generate

### 5. Create the first admin user

    npm run dev

In another PowerShell window:

    $body = @{ email = "admin@company.com"; password = "supersecret123"; role = "ADMIN" } | ConvertTo-Json
    Invoke-RestMethod -Uri http://localhost:4000/api/auth/register -Method POST -Body $body -ContentType "application/json"

### 6. Start the frontend

    cd apps/frontend
    npm run dev

Open http://localhost:3000 and log in.

## Daily Use

### Admin tasks

- Employees: add/edit staff with base salary
- Face Enroll: enroll each employee face (required for kiosk)
- Devices: register kiosk tablets and get API keys
- Attendance: view daily summary + raw logs, fix mistakes
- Payroll: run monthly payroll, download/email payslips

### Kiosk setup

1. Open http://localhost:3000/punch on a tablet
2. Enter the KIOSK_SECRET from apps/backend/.env
3. Position tablet at the entrance

## Environment Variables

Backend (apps/backend/.env):

| Variable | Purpose |
|---|---|
| DATABASE_URL | Postgres connection string |
| REDIS_URL | Redis connection string |
| JWT_SECRET | Access token signing (32+ chars) |
| JWT_REFRESH_SECRET | Refresh token signing (32+ chars) |
| KIOSK_SECRET | Shared secret for public kiosk endpoint |
| FACE_SERVICE_URL | Python face service URL |
| BCRYPT_ROUNDS | Password hash cost, default 12 |

Frontend (apps/frontend/.env.local):

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_API_URL | Backend URL, e.g. http://localhost:4000 |

## Common Commands

    # Backend
    cd apps/backend
    npm run dev                # start backend on 4000
    npx prisma studio          # browse DB in browser
    npx prisma db push         # sync schema

    # Frontend
    cd apps/frontend
    npm run dev                # start frontend on 3000
    npm run build              # production build

    # Docker
    docker compose -f infra/docker/docker-compose.yml ps
    docker compose -f infra/docker/docker-compose.yml logs -f
    docker compose -f infra/docker/docker-compose.yml down
    docker compose -f infra/docker/docker-compose.yml down -v    # stop + wipe data

## Troubleshooting

### docker: command not found

Docker Desktop installs to %LOCALAPPDATA%\Programs\DockerDesktop\resources\bin. Add it to PATH:

    $bin = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
    $p = [Environment]::GetEnvironmentVariable("Path","User")
    if ($p -notlike "*$bin*") { [Environment]::SetEnvironmentVariable("Path","$p;$bin","User") }

Then close and reopen all PowerShell windows.

### EPERM on prisma generate

The running dev server holds the DLL. Stop node first:

    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    npx prisma generate

### Could not find Chrome on payroll PDF

Puppeteer browser is not downloaded:

    cd apps/backend
    npx puppeteer browsers install chrome

### Kiosk says Face not recognized

The employee has not enrolled their face. Go to Face Enroll page, click Enroll Face on their row.

### Postgres connection refused on 5432

Native Postgres is running. Our container uses 55432. Check apps/backend/.env.

## License

MIT
>>>>>>> 057687d (Initial commit)

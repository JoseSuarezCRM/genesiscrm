@echo off
:: Helper script to run npm commands with Node.js (installed at E:\)
SET PATH=E:\;%PATH%

IF "%1"=="" (
    echo Usage:
    echo   dev.bat dev          - Start development server
    echo   dev.bat install      - Install dependencies
    echo   dev.bat migrate      - Run database migrations
    echo   dev.bat seed         - Seed initial admin user
    echo   dev.bat studio       - Open Prisma Studio
    echo   dev.bat build        - Production build
    GOTO :EOF
)

IF "%1"=="dev" (
    npm run dev
) ELSE IF "%1"=="install" (
    npm install
) ELSE IF "%1"=="migrate" (
    npm run db:migrate
) ELSE IF "%1"=="seed" (
    npm run db:seed
) ELSE IF "%1"=="studio" (
    npm run db:studio
) ELSE IF "%1"=="build" (
    npm run build
) ELSE (
    echo Unknown command: %1
)

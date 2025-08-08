# Changelog - BudBot WhatsApp Connector

## [5.0.0] - 2025-08-07

### 🎉 Major Release - Complete Backend Integration

#### Added
- **Complete Backend Integration** - Full communication with BudBot-IA Flask API
- **Advanced Health Monitoring** - Comprehensive `/health`, `/status`, and `/qr` endpoints
- **Retry Logic & Resilience** - Exponential backoff for failed backend communications
- **Memory Optimization** - Optimized for Render.com low-memory environments
- **Enhanced Logging** - Structured logging with Winston, file rotation
- **QR Code Web Interface** - HTTP endpoints for QR code access and display
- **Production Security** - Non-root Docker container, token-based authentication
- **Connection Statistics** - Track uptime, message counts, reconnection events
- **Graceful Shutdown** - Proper cleanup on SIGTERM/SIGINT signals
- **Auto-Reconnection** - Intelligent retry with max attempts and delays

#### Backend Features
- **WhatsApp Connector Blueprint** - Flask route `/api/whatsapp/connector`
- **Event Processing** - Handle QR generation, authentication, messages, disconnections
- **Lead Management** - Automatic lead creation from WhatsApp contacts
- **Message Storage** - Store all WhatsApp messages in PostgreSQL database
- **Health Checks** - Backend connectivity and database status monitoring

#### Technical Improvements
- **Node.js 18+ Support** - Modern JavaScript features and optimizations
- **Puppeteer v23.7.1** - Latest WhatsApp Web automation
- **whatsapp-web.js v1.31.0** - Stable WhatsApp Web integration
- **Express.js v4.19.2** - Robust HTTP server framework
- **PostgreSQL Integration** - Production-ready database connectivity
- **Docker Optimization** - Multi-stage builds, security hardening

#### Documentation
- **Complete Deployment Guide** - Step-by-step Render.com deployment
- **Backend Integration Guide** - Flask blueprint integration instructions
- **Troubleshooting Guide** - Common issues and solutions
- **API Documentation** - All endpoints and event formats
- **Security Guide** - Production security considerations

### Changed
- **Architecture** - Separated connector and backend into distinct services
- **Configuration** - Environment-based configuration with comprehensive defaults
- **Logging** - Structured JSON logging with multiple transports
- **Error Handling** - Comprehensive error catching and reporting
- **Session Management** - Improved WhatsApp session persistence

### Fixed
- **Memory Leaks** - Resolved Puppeteer memory issues on Render.com
- **Docker Build** - Fixed npm dependency resolution
- **Database Compatibility** - Synchronized models with PostgreSQL schema
- **Token Authentication** - Secure webhook communication
- **QR Code Display** - Reliable QR code generation and access

### Removed
- **Deprecated APIs** - Removed outdated WhatsApp Web methods
- **Debug Code** - Cleaned up development-only features
- **Unused Dependencies** - Optimized package.json for production

## [4.4.0] - 2025-08-07

### Added
- **Render.com Compatibility** - Fixed Dockerfile location for proper deployment
- **Root Directory Structure** - Organized files for Render.com requirements

### Fixed
- **Docker Build Issues** - Resolved "no such file or directory" errors
- **npm Dependencies** - Switched from npm ci to npm install for reliability

## [4.3.0] - 2025-08-06

### Added
- **Docker Optimization** - Improved container build process
- **Comprehensive Documentation** - Added deployment guides

### Fixed
- **npm Version Conflicts** - Resolved whatsapp-web.js version issues

## [4.2.0] - 2025-08-05

### Added
- **Memory Optimization** - Single-process Puppeteer configuration
- **Automatic Cleanup** - Garbage collection and memory management

### Fixed
- **Target Closed Errors** - Resolved Puppeteer session issues

## [4.1.0] - 2025-08-04

### Added
- **Initial WhatsApp Integration** - Basic WhatsApp Web connectivity
- **QR Code Generation** - Terminal-based QR code display
- **Express Server** - Basic HTTP server for health checks

### Fixed
- **Authentication Flow** - Stable WhatsApp session management

## [4.0.0] - 2025-08-03

### Added
- **Project Foundation** - Initial WhatsApp connector architecture
- **Basic Configuration** - Environment variable setup
- **Logging System** - Basic console logging

---

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions  
- **PATCH** version for backwards-compatible bug fixes

## Migration Guides

### Upgrading to v5.0.0

1. **Update Backend** - Add whatsapp_connector.py blueprint
2. **Environment Variables** - Add WEBHOOK_TOKEN to backend
3. **Database Models** - Remove timestamp field from Message model
4. **Deploy Order** - Deploy backend first, then connector
5. **Test Integration** - Verify /api/whatsapp/connector endpoint

### Upgrading from v4.x

1. **Node.js Version** - Ensure Node.js 18+ is installed
2. **Dependencies** - Run `npm install` to update packages
3. **Configuration** - Update environment variables
4. **Docker** - Rebuild containers with new Dockerfile
5. **Monitoring** - Update health check URLs
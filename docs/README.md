# Papertrail Documentation

Complete documentation for the Papertrail GPS tracker.

## Contents

### [Installation Guide](installation.md)
Getting started with Papertrail:
- Hardware requirements
- First-time setup and install script
- Running in production and development
- Deploying updates
- Adding GPX files
- Troubleshooting common issues

### [Configuration](configuration.md)
Environment variables and security:
- GPS, display, web server, WiFi settings
- Credential management
- Security best practices
- CORS configuration

### [Developer Guide](developer-guide.md)
Complete reference for working with the codebase:
- Architecture overview and design patterns
- Services reference (GPS, Map, Display, WiFi, Navigation, etc.)
- Web layer and API endpoints
- Error handling and testing patterns
- Display abstraction layer
- Adding new services and display types

### [Architecture](architecture.md)
Detailed architectural diagrams:
- Service component diagram
- GPS update flow
- Track selection flow
- WiFi/onboarding state machine
- Drive navigation flow
- Display abstraction layer

### [Rendering Pipeline](rendering-pipeline.md)
How the e-paper display is rendered:
- Layer composition order (back to front)
- Screen types and layouts (track, navigation, turn screens)
- Data gathering for info panels (speed, POIs, speed limits)
- Bitmap rendering system (1-bit format, drawing primitives)
- Complete render flow from data to hardware
- Performance characteristics

## Quick Reference

| Topic | Location |
|-------|----------|
| Hardware requirements | [Installation - Hardware](installation.md#hardware-requirements) |
| Running the app | [Installation - Running](installation.md#running-the-application) |
| Environment variables | [Configuration](configuration.md#environment-variables) |
| Security settings | [Configuration - Security](configuration.md#security) |
| Service interfaces | [Developer Guide - Services](developer-guide.md#services-reference) |
| Adding a new service | [Developer Guide](developer-guide.md#adding-a-new-service) |
| Adding a new display | [Developer Guide](developer-guide.md#adding-a-new-display-type) |
| System diagrams | [Architecture](architecture.md#service-component-diagram) |
| Display abstraction | [Architecture](architecture.md#display-abstraction-layer) |
| Rendering layers | [Rendering Pipeline](rendering-pipeline.md#layer-composition-order) |
| Screen types | [Rendering Pipeline](rendering-pipeline.md#screen-types-and-layouts) |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Review is a static web application for submitting project ideas and collecting feedback. It uses Firebase Realtime Database for data persistence and syncs across devices in real-time. The app is designed to be hosted on GitHub Pages (no server required).

## Architecture

**Frontend-only app** with three main pages:
- `index.html` + `app.js` - Project submission form with image upload and compression
- `workspace.html` + `workspace.js` - Main workspace with project list, detail view, tasks, progress tabs, and file management
- `dashboard.html` + `dashboard.js` - Read-only dashboard showing projects with feedback

**Data Flow:**
- Firebase Realtime Database is the source of truth
- localStorage serves as local cache for offline access
- Real-time listeners auto-sync changes without page refresh

**Key Files:**
- `app.js` - Firebase config, image compression utility, form handling, core storage functions (`submitToStorage`, `syncToFirebase`, `syncFromFirebase`)
- `workspace.js` - Most complex file (~1200 lines). Handles project list, detail view, tasks, notes, progress tabs, file uploads, and all modals
- `dashboard.js` - Simpler read-only view with Firebase real-time listeners

**Shared Patterns:**
- `sanitizeFirebaseKey()` - Converts project names to valid Firebase keys (removes `.#$[]`)
- `escapeHtml()` - XSS prevention for user content
- Image compression before storage (max 1920x1080, 80% JPEG quality)
- All pages load `app.js` first (contains Firebase init and shared utilities)

## Development

Open any HTML file directly in a browser - no build step required. For Firebase to work, you need internet access.

**Testing changes:**
1. Open the HTML file in browser
2. Use browser DevTools Console to check for errors
3. Use `resetAndResync()` in console to clear local data and refetch from Firebase

## UI/UX Preferences

- **Never truncate text with ellipsis** - Always allow text to wrap and show full content. Use `word-wrap: break-word` and `overflow-wrap: break-word` instead of `text-overflow: ellipsis`.

## Data Structures

Projects and feedback are stored in Firebase under `/projects/{sanitizedProjectName}` and `/feedback/{id}`. Tasks, notes, progress tabs, and files are stored under their respective paths.

Key project fields: `projectName`, `projectType`, `creator`, `summary`, `problem`, `success`, `currentState`, `status`, `tags`, `images` (base64 array), `timestamp`, `_lastModified`

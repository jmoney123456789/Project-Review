// ==========================================
// GOOGLE APPS SCRIPT - Copy this to your Google Sheet
// ==========================================
//
// SETUP INSTRUCTIONS:
// 1. Create a new Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete any existing code and paste this entire file
// 4. Click "Deploy" > "New deployment"
// 5. Select type: "Web app"
// 6. Set "Execute as": Me
// 7. Set "Who has access": Anyone
// 8. Click Deploy and copy the URL
// 9. Paste that URL into app.js where it says YOUR_GOOGLE_SCRIPT_URL_HERE
//
// ==========================================

// Sheet names
const PROJECTS_SHEET = 'Projects';
const FEEDBACK_SHEET = 'Feedback';

// Initialize sheets if they don't exist
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create Projects sheet
  let projectsSheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!projectsSheet) {
    projectsSheet = ss.insertSheet(PROJECTS_SHEET);
    projectsSheet.appendRow([
      'Timestamp',
      'Project Name',
      'Type',
      'Summary',
      'Problem',
      'Audience',
      'Success Criteria',
      'Current State',
      'Link',
      'Attachments'
    ]);
    // Format header row
    projectsSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#6366f1').setFontColor('white');
    projectsSheet.setFrozenRows(1);
  }

  // Create Feedback sheet
  let feedbackSheet = ss.getSheetByName(FEEDBACK_SHEET);
  if (!feedbackSheet) {
    feedbackSheet = ss.insertSheet(FEEDBACK_SHEET);
    feedbackSheet.appendRow([
      'Timestamp',
      'Project Name',
      'Clarity (1-5)',
      'Usefulness (1-5)',
      'Excitement (1-5)',
      'Real Problem?',
      'Would Use?',
      'Priority?',
      'Best Thing',
      'Improvement',
      'Other Use Case'
    ]);
    // Format header row
    feedbackSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#6366f1').setFontColor('white');
    feedbackSheet.setFrozenRows(1);
  }
}

// Handle POST requests (form submissions)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    initializeSheets();

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'project') {
      const sheet = ss.getSheetByName(PROJECTS_SHEET);
      sheet.appendRow([
        data.timestamp,
        data.projectName,
        data.projectType,
        data.summary,
        data.problem,
        data.audience,
        data.success,
        data.currentState,
        data.link,
        data.attachments
      ]);
    } else if (data.type === 'feedback') {
      const sheet = ss.getSheetByName(FEEDBACK_SHEET);
      sheet.appendRow([
        data.timestamp,
        data.projectName,
        data.clarity,
        data.usefulness,
        data.excitement,
        data.realProblem,
        data.wouldUse,
        data.priority,
        data.bestThing,
        data.improve,
        data.useCase
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle GET requests (fetching projects list)
function doGet(e) {
  try {
    initializeSheets();

    const action = e.parameter.action;

    if (action === 'getProjects') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(PROJECTS_SHEET);
      const data = sheet.getDataRange().getValues();

      // Skip header row, convert to objects
      const projects = data.slice(1).map(row => ({
        timestamp: row[0],
        projectName: row[1],
        projectType: row[2],
        summary: row[3],
        problem: row[4],
        audience: row[5],
        success: row[6],
        currentState: row[7],
        link: row[8],
        attachments: row[9]
      }));

      return ContentService
        .createTextOutput(JSON.stringify({ success: true, projects: projects }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Project Review API' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Run this function once to set up your sheets
function setup() {
  initializeSheets();
  SpreadsheetApp.getActiveSpreadsheet().toast('Sheets initialized successfully!', 'Setup Complete');
}

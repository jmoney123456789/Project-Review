# Project Review - Setup Guide

## Quick Start (Demo Mode)

Want to test it right away? Just open `index.html` in your browser. The app works in demo mode using your browser's local storage - no setup required.

---

## Full Setup (with Google Sheets)

### Step 1: Create Google Sheet + Apps Script (5 minutes)

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet
2. Name it "Project Review Data" (or whatever you like)
3. Click **Extensions** > **Apps Script**
4. Delete any code in the editor
5. Open the file `google-apps-script.js` from this folder
6. Copy ALL the code and paste it into the Apps Script editor
7. Click the **Save** icon (or Ctrl+S)
8. In the function dropdown (next to "Debug"), select `setup`
9. Click **Run** - this creates your sheets
10. You'll be asked to authorize - click through the permissions

### Step 2: Deploy the Apps Script (2 minutes)

1. In Apps Script, click **Deploy** > **New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Fill in:
   - Description: "Project Review API"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. **Copy the Web app URL** - you'll need this!

### Step 3: Connect Your App (1 minute)

1. Open `app.js` in a text editor
2. Find this line near the top:
   ```javascript
   const GOOGLE_SCRIPT_URL = 'YOUR_GOOGLE_SCRIPT_URL_HERE';
   ```
3. Replace `YOUR_GOOGLE_SCRIPT_URL_HERE` with the URL you copied
4. Save the file

### Step 4: Deploy to Netlify (3 minutes)

1. Go to [Netlify](https://app.netlify.com) and sign up/log in (free)
2. From the dashboard, look for "Add new site" > **Deploy manually**
3. Drag and drop the entire `project-review` folder onto the upload area
4. Wait a few seconds - done!
5. Netlify gives you a URL like `random-name-123.netlify.app`
6. Share that URL with your partner!

### Optional: Custom Domain

If you want a nicer URL:
1. In Netlify, go to **Site settings** > **Domain management**
2. Click **Add custom domain** or use Netlify's free subdomain option
3. You can change the random name to something like `our-project-review.netlify.app`

---

## How It Works

### Submit a Project
1. Go to the main page
2. Fill out the project details
3. Click Submit
4. Data goes to your Google Sheet "Projects" tab

### Give Feedback
1. Go to the "Give Feedback" page
2. Select a project from the dropdown
3. Rate and answer the questions
4. Click Submit
5. Data goes to your Google Sheet "Feedback" tab

### View All Data
Open your Google Sheet to see:
- **Projects tab**: All submitted project ideas
- **Feedback tab**: All feedback responses

---

## Troubleshooting

**"No projects submitted yet"**
- Submit a project first on the main page
- Make sure your Google Script URL is set correctly in `app.js`

**Submissions not appearing in Google Sheets**
- Check that the Apps Script is deployed as a Web app
- Make sure "Who has access" is set to "Anyone"
- Check the Apps Script URL is correct in `app.js`

**CORS errors in browser console**
- This is normal with `no-cors` mode - submissions still work
- Check your Google Sheet to verify data is being saved

---

## File Structure

```
project-review/
├── index.html          # Project submission page
├── review.html         # Feedback form page
├── styles.css          # All styling (dark mode)
├── app.js              # Main JavaScript
├── review.js           # Review page specific JS
├── google-apps-script.js  # Copy this to Google Apps Script
└── SETUP.md            # This file
```

---

## Need Help?

The app works in demo mode without any setup - data is saved locally in your browser. This is great for testing but won't sync between you and your partner.

For the full experience with shared data, complete the Google Sheets setup above.

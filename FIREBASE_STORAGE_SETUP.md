# Firebase Storage Setup Instructions

## The Error You're Getting
If you see a **404 error** or **permission denied**, Firebase Storage needs to be configured.

## Fix: Update Firebase Storage Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **project-review-fe0cc**
3. Click **Storage** in the left sidebar
4. Click the **Rules** tab
5. Replace the rules with this:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      // Allow anyone to read and write
      // (for a private app, you'd want authentication)
      allow read, write: if true;
    }
  }
}
```

6. Click **Publish**

## Alternative: Enable Anonymous Authentication

If you want slightly better security:

1. Go to **Authentication** → **Sign-in method**
2. Enable **Anonymous**
3. Use these Storage rules instead:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      // Allow authenticated users (including anonymous)
      allow read, write: if request.auth != null;
    }
  }
}
```

## Verify Setup

After updating the rules:
1. Refresh the project-review page
2. Try uploading a project with images
3. Check the browser console (F12) for detailed logs
4. You should see "✓ Image uploaded successfully!" in the console

## Check If Storage Is Enabled

If you get a 404 error, Storage might not be initialized:
1. In Firebase Console, go to **Storage**
2. If you see a "Get Started" button, click it
3. Choose a location (e.g., us-central1)
4. Start in test mode (or use the rules above)
5. Click **Done**

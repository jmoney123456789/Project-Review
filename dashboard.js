// ==========================================
// PROJECT REVIEW - Dashboard Script
// ==========================================

// Firebase Configuration - uses variables from app.js (loaded first)
// firebase and database are initialized in app.js

let allProjects = [];
let allFeedback = [];
let allTasks = {};
let completedProjects = {};

// Firebase real-time listeners
let projectsListener = null;
let feedbackListener = null;
let tasksListener = null;
let dataLoaded = false;

// ==========================================
// Load Dashboard Data
// ==========================================
async function loadDashboardData() {
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    completedProjects = JSON.parse(localStorage.getItem('completedProjects') || '{}');

    // FIREBASE IS SOURCE OF TRUTH - fetch from Firebase FIRST
    console.log('Dashboard: Fetching from Firebase (source of truth)...');
    try {
        await fetchFromFirebaseAsSourceOfTruth();
        console.log('Dashboard: Firebase data loaded. Projects:', allProjects.length);
    } catch (err) {
        console.error('Dashboard: Firebase fetch failed, falling back to local:', err);
        loadFromLocalStorage();
    }

    renderDashboard();
    dataLoaded = true;
    setupFirebaseListeners(); // Real-time sync!
}

// Sanitize keys for Firebase (no ., #, $, [, ])
function sanitizeFirebaseKey(key) {
    return key.replace(/[.#$\[\]]/g, '_');
}

// Fetch from Firebase as the single source of truth
async function fetchFromFirebaseAsSourceOfTruth() {
    const snapshot = await database.ref('/').once('value');
    const data = snapshot.val() || { projects: {}, feedback: {}, tasks: {} };

    // Convert Firebase objects to arrays
    const projectsObj = data.projects || {};
    const feedbackObj = data.feedback || {};
    const tasksObj = data.tasks || {};

    // Firebase data completely replaces local data
    allProjects = Object.values(projectsObj).filter(p => !p._deletedAt);
    allFeedback = Object.values(feedbackObj).filter(f => !f._deletedAt);

    // Load tasks from Firebase - convert from {projectKey: {tasks: [...]}} to {projectName: [...]}
    allTasks = {};
    Object.keys(tasksObj).forEach(key => {
        // Find the original project name (key is sanitized)
        const project = allProjects.find(p => sanitizeFirebaseKey(p.projectName) === key);
        const projectName = project ? project.projectName : key;
        if (tasksObj[key] && tasksObj[key].tasks) {
            allTasks[projectName] = tasksObj[key].tasks;
        }
    });
    localStorage.setItem('projectTasks', JSON.stringify(allTasks));

    // Cache and restore images
    const imageCache = JSON.parse(localStorage.getItem('projectImageCache') || '{}');
    allProjects.forEach(p => {
        if (p.images && p.images.length > 0) {
            imageCache[p.projectName] = p.images;
        }
    });
    localStorage.setItem('projectImageCache', JSON.stringify(imageCache));

    allProjects = allProjects.map(p => {
        if (!p.images || p.images.length === 0) {
            const cached = imageCache[p.projectName];
            if (cached) return { ...p, images: cached };
        }
        return p;
    });

    // Save to localStorage as cache
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    console.log('Dashboard: Firebase data synced -', allProjects.length, 'projects,', Object.keys(allTasks).length, 'task lists');
}

// Setup Firebase real-time listeners
function setupFirebaseListeners() {
    console.log('Dashboard: Setting up Firebase real-time listeners...');

    // Listen for project changes
    projectsListener = database.ref('projects').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const projectsObj = snapshot.val() || {};
        allProjects = Object.values(projectsObj).filter(p => !p._deletedAt);

        // Restore cached images
        const imageCache = JSON.parse(localStorage.getItem('projectImageCache') || '{}');
        allProjects = allProjects.map(p => {
            if (!p.images || p.images.length === 0) {
                const cached = imageCache[p.projectName];
                if (cached) return { ...p, images: cached };
            } else {
                imageCache[p.projectName] = p.images;
            }
            return p;
        });
        localStorage.setItem('projectImageCache', JSON.stringify(imageCache));

        // Update localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        console.log('Dashboard: Real-time update - Projects changed, now have', allProjects.length);
        renderDashboard();
    });

    // Listen for feedback changes
    feedbackListener = database.ref('feedback').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const feedbackObj = snapshot.val() || {};
        allFeedback = Object.values(feedbackObj).filter(f => !f._deletedAt);

        // Update localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        console.log('Dashboard: Real-time update - Feedback changed, now have', allFeedback.length);
        renderDashboard();
    });

    // Listen for tasks changes
    tasksListener = database.ref('tasks').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const tasksObj = snapshot.val() || {};

        // Convert from {projectKey: {tasks: [...]}} to {projectName: [...]}
        allTasks = {};
        Object.keys(tasksObj).forEach(key => {
            // Find the original project name (key is sanitized)
            const project = allProjects.find(p => sanitizeFirebaseKey(p.projectName) === key);
            const projectName = project ? project.projectName : key;
            if (tasksObj[key] && tasksObj[key].tasks) {
                allTasks[projectName] = tasksObj[key].tasks;
            }
        });

        // Update localStorage
        localStorage.setItem('projectTasks', JSON.stringify(allTasks));

        console.log('Dashboard: Real-time update - Tasks changed, now have', Object.keys(allTasks).length, 'task lists');
        renderDashboard();
    });

    console.log('Dashboard: Firebase real-time listeners active!');
}

function loadFromLocalStorage() {
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    // Filter out soft-deleted items (legacy cleanup) and only get active items
    allProjects = stored.filter(item => item.type === 'project' && !item._deletedAt);
    allFeedback = stored.filter(item => item.type === 'feedback' && !item._deletedAt);

    // Restore images from cache
    const imageCache = JSON.parse(localStorage.getItem('projectImageCache') || '{}');
    allProjects = allProjects.map(p => {
        const cachedImages = imageCache[p.projectName];
        if (cachedImages && cachedImages.length > 0) {
            return { ...p, images: cachedImages };
        }
        return p;
    });
}

// ==========================================
// Firebase Sync (handled by real-time listeners)
// ==========================================
// Note: With Firebase real-time listeners, syncFromCloud is rarely needed
// The dashboard automatically updates when data changes in Firebase

// ==========================================
// Render Dashboard
// ==========================================
function renderDashboard() {
    const container = document.getElementById('dashboardList');

    // Remove duplicate projects by projectName
    const uniqueProjects = [];
    const seenNames = new Set();
    allProjects.forEach(project => {
        if (!seenNames.has(project.projectName)) {
            seenNames.add(project.projectName);
            uniqueProjects.push(project);
        }
    });
    allProjects = uniqueProjects;

    if (allProjects.length === 0) {
        container.innerHTML = `
            <div class="dashboard-empty">
                <p>No projects yet</p>
                <a href="index.html">Create your first project</a>
            </div>
        `;
        return;
    }

    container.innerHTML = allProjects.map((project, index) => {
        const feedback = getFeedbackForProject(project.projectName);
        const tasksRemaining = getTasksRemaining(project.projectName);
        const isCompleted = completedProjects[project.projectName] || false;
        const hasImage = project.images && project.images.length > 0;
        const latestFeedback = feedback.length > 0 ? feedback[feedback.length - 1] : null;

        return `
            <div class="dashboard-item ${isCompleted ? 'completed' : ''}" data-index="${index}">
                <div class="dashboard-row">
                    <div class="row-checkbox ${isCompleted ? 'checked' : ''}" data-project="${escapeHtml(project.projectName)}">
                        ${isCompleted ? '&#10003;' : ''}
                    </div>
                    <div class="row-thumb">
                        ${hasImage
                            ? `<img src="${project.images[0]}" alt="Preview">`
                            : `<span class="row-thumb-empty">&#128196;</span>`
                        }
                    </div>
                    <div class="row-info">
                        <div class="row-name">${escapeHtml(project.projectName)}</div>
                        <div class="row-meta">
                            <span class="row-type">${escapeHtml(project.projectType)}</span>
                            <span class="row-creator">${escapeHtml(project.creator || 'Jason')}</span>
                        </div>
                    </div>
                    <div class="row-stats">
                        <div class="row-stat ${feedback.length > 0 ? 'has-feedback' : ''}">
                            <span class="row-stat-value">${feedback.length}</span>
                            <span class="row-stat-label">Feedback</span>
                        </div>
                        <div class="row-stat ${tasksRemaining > 0 ? 'has-tasks' : ''}">
                            <span class="row-stat-value">${tasksRemaining}</span>
                            <span class="row-stat-label">Tasks</span>
                        </div>
                    </div>
                </div>
                ${feedback.length > 0 ? `
                    <div class="feedback-preview">
                        ${feedback.map((f, i) => {
                            // Check if new format (has feedbackText) or old format
                            const isNewFormat = f.feedbackText !== undefined && f.feedbackText !== null;

                            if (isNewFormat) {
                                return `
                                    <div class="feedback-entry feedback-simple">
                                        <div class="feedback-entry-header">
                                            <span class="feedback-author ${(f.author || 'Jason').toLowerCase()}">${escapeHtml(f.author || 'Jason')}</span>
                                            <span class="feedback-entry-date">${formatDate(f.timestamp)}</span>
                                        </div>
                                        <div class="feedback-entry-text">
                                            <span class="comment-text">${escapeHtml(f.feedbackText)}</span>
                                        </div>
                                    </div>
                                `;
                            } else {
                                return `
                                    <div class="feedback-entry">
                                        <div class="feedback-entry-header">
                                            <span class="feedback-author ${(f.author || 'Jason').toLowerCase()}">${escapeHtml(f.author || 'Jason')}</span>
                                            <span class="feedback-entry-date">${formatDate(f.timestamp)}</span>
                                            <div class="feedback-entry-scores">
                                                <span class="score-pill">Usefulness: ${f.usefulness}/5</span>
                                            </div>
                                            <div class="feedback-entry-badges">
                                                <span class="mini-badge ${f.wouldUse === 'Yes' ? 'yes' : 'no'}">${f.wouldUse === 'Yes' ? 'Would use' : "Won't use"}</span>
                                                <span class="mini-badge ${f.priority === 'Yes' ? 'yes' : 'no'}">${f.priority === 'Yes' ? 'Priority' : 'Not priority'}</span>
                                            </div>
                                        </div>
                                        <div class="feedback-entry-text">
                                            ${f.whyUseful ? `
                                            <div class="feedback-comment-block">
                                                <span class="comment-label">Why useful:</span>
                                                <span class="comment-text">${escapeHtml(f.whyUseful)}</span>
                                            </div>
                                            ` : ''}
                                            ${f.whyNotUseful ? `
                                            <div class="feedback-comment-block">
                                                <span class="comment-label">Why not useful:</span>
                                                <span class="comment-text">${escapeHtml(f.whyNotUseful)}</span>
                                            </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add event listeners for checkboxes
    container.querySelectorAll('.row-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProjectComplete(checkbox.dataset.project);
        });
    });
}

// ==========================================
// Helper Functions
// ==========================================
function getFeedbackForProject(projectName) {
    return allFeedback.filter(f => f.projectName === projectName);
}

function getTasksRemaining(projectName) {
    const tasks = allTasks[projectName] || [];
    return tasks.filter(t => !t.completed).length;
}

function toggleProjectComplete(projectName) {
    completedProjects[projectName] = !completedProjects[projectName];
    localStorage.setItem('completedProjects', JSON.stringify(completedProjects));
    renderDashboard();
}

// ==========================================
// Utility Functions
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

// ==========================================
// Initialize Dashboard
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboardData();
});

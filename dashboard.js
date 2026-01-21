// ==========================================
// PROJECT REVIEW - Dashboard Script
// ==========================================

// JSONBin.io Configuration - uses variables from app.js (loaded first)
// JSONBIN_BIN_ID and JSONBIN_API_KEY are defined in app.js

let allProjects = [];
let allFeedback = [];
let allTasks = {};
let completedProjects = {};

// Cache settings - short duration to ensure fresh data
const CACHE_DURATION = 0; // Always sync on page load for fresh data

// ==========================================
// Load Dashboard Data
// ==========================================
async function loadDashboardData() {
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    completedProjects = JSON.parse(localStorage.getItem('completedProjects') || '{}');

    // CLOUD IS SOURCE OF TRUTH - fetch from cloud FIRST
    if (JSONBIN_BIN_ID && JSONBIN_API_KEY) {
        console.log('Dashboard: Fetching from cloud (source of truth)...');
        try {
            await fetchFromCloudAsSourceOfTruth();
            console.log('Dashboard: Cloud data loaded. Projects:', allProjects.length);
        } catch (err) {
            console.error('Dashboard: Cloud fetch failed, falling back to local:', err);
            loadFromLocalStorage();
        }
    } else {
        loadFromLocalStorage();
    }

    renderDashboard();
}

// Fetch from cloud as the single source of truth
async function fetchFromCloudAsSourceOfTruth() {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Access-Key': JSONBIN_API_KEY }
    });

    if (!response.ok) {
        throw new Error(`Cloud fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const cloudData = data.record || { projects: [], feedback: [] };

    // Cloud data completely replaces local data
    allProjects = (cloudData.projects || []).filter(p => !p._deletedAt);
    allFeedback = (cloudData.feedback || []).filter(f => !f._deletedAt);

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
// Cloud Sync (JSONBin.io)
// ==========================================
async function syncFromCloud() {
    if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
        console.log('Dashboard: JSONBin not configured');
        return;
    }

    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Access-Key': JSONBIN_API_KEY }
    });

    if (response.ok) {
        const data = await response.json();
        console.log('Dashboard: Cloud data received:', data);
        const cloudData = data.record || { projects: [], feedback: [] };

        console.log('Dashboard: Cloud has', (cloudData.projects || []).length, 'projects');

        // Merge cloud data with local
        mergeCloudData(cloudData);

        console.log('Dashboard: After merge, allProjects has', allProjects.length, 'projects');
    } else {
        console.error('Dashboard: Cloud fetch failed with status:', response.status);
    }
}

function mergeCloudData(cloudData) {
    // Cloud is the source of truth - replace local data with cloud data
    // This ensures deletions sync properly across devices
    const cloudProjects = cloudData.projects || [];
    const cloudFeedback = cloudData.feedback || [];

    // Filter out soft-deleted items (hard deletes won't be in cloud at all)
    allProjects = cloudProjects.filter(p => !p._deletedAt);
    allFeedback = cloudFeedback.filter(f => !f._deletedAt);

    // Cache any new images from cloud
    const imageCache = JSON.parse(localStorage.getItem('projectImageCache') || '{}');
    allProjects.forEach(p => {
        if (p.images && p.images.length > 0 && !imageCache[p.projectName]) {
            imageCache[p.projectName] = p.images;
        }
    });
    localStorage.setItem('projectImageCache', JSON.stringify(imageCache));

    // Restore images from cache for all projects
    allProjects = allProjects.map(p => {
        const cachedImages = imageCache[p.projectName];
        if (cachedImages && cachedImages.length > 0) {
            return { ...p, images: cachedImages };
        }
        return p;
    });

    // Save to localStorage (only active items)
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    console.log('Dashboard merged from cloud:', allProjects.length, 'projects,', allFeedback.length, 'feedback');
}

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

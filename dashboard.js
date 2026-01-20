// ==========================================
// PROJECT REVIEW - Dashboard Script
// ==========================================

// JSONBin.io Configuration - uses variables from app.js (loaded first)
// JSONBIN_BIN_ID and JSONBIN_API_KEY are defined in app.js

let allProjects = [];
let allFeedback = [];
let allTasks = {};
let completedProjects = {};

// Cache settings
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ==========================================
// Load Dashboard Data
// ==========================================
async function loadDashboardData() {
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    completedProjects = JSON.parse(localStorage.getItem('completedProjects') || '{}');

    // Load from localStorage first
    loadFromLocalStorage();

    // Render immediately with local data
    renderDashboard();

    // Check if cache is expired
    const now = Date.now();
    const cachedTimestamp = parseInt(localStorage.getItem('projectCacheTimestamp') || '0');

    if (JSONBIN_BIN_ID && JSONBIN_API_KEY && (now - cachedTimestamp > CACHE_DURATION)) {
        console.log('Dashboard: Cache expired, fetching from cloud...');
        try {
            await syncFromCloud();
            localStorage.setItem('projectCacheTimestamp', now.toString());
            console.log('Dashboard: Cloud sync complete. Projects:', allProjects.length);
            renderDashboard();
        } catch (err) {
            console.log('Dashboard: Cloud sync failed:', err);
        }
    } else {
        console.log('Dashboard: Using cached data');
    }
}

function loadFromLocalStorage() {
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    allProjects = stored.filter(item => item.type === 'project');
    allFeedback = stored.filter(item => item.type === 'feedback');
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
    const localProjectNames = new Set(allProjects.map(p => p.projectName));
    const localFeedbackKeys = new Set(allFeedback.map(f => `${f.projectName}-${f.timestamp}`));

    (cloudData.projects || []).forEach(project => {
        if (!localProjectNames.has(project.projectName)) {
            allProjects.push(project);
        }
    });

    (cloudData.feedback || []).forEach(feedback => {
        const key = `${feedback.projectName}-${feedback.timestamp}`;
        if (!localFeedbackKeys.has(key)) {
            allFeedback.push(feedback);
        }
    });

    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));
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
                        ${feedback.map((f, i) => `
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
                        `).join('')}
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

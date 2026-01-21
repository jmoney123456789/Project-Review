// ==========================================
// PROJECT REVIEW - Workspace Script
// ==========================================

// Firebase Configuration - uses variables from app.js (loaded first)
// firebase and database are initialized in app.js

// Helper: Clear all local data and resync from cloud (for debugging sync issues)
// Call from browser console: resetAndResync()
window.resetAndResync = async function() {
    console.log('Clearing all local data...');
    localStorage.removeItem('projectReviewData');
    localStorage.removeItem('projectImageCache');
    localStorage.removeItem('projectCacheTimestamp');
    localStorage.removeItem('projectTasks');
    localStorage.removeItem('projectNotes');
    localStorage.removeItem('projectChangesLog');
    localStorage.removeItem('completedProjects');
    console.log('Local data cleared. Refreshing page...');
    location.reload();
};

// Team members
const TEAM = ['Jason', 'Ash'];

// State
let allProjects = [];
let allFeedback = [];
let allTasks = {};
let allNotes = {};
let currentProject = null;
let currentImageIndex = 0;
let projectToDelete = null;
let dataLoaded = false;

// Filter state for categories/tags
let statusFilter = 'all'; // 'all', 'in_progress', 'completed', 'archived'
let tagFilters = []; // Array of selected tags

// Firebase real-time listeners
let projectsListener = null;
let feedbackListener = null;
let tasksListener = null;
let notesListener = null;

// ==========================================
// Image Cache System
// ==========================================
// Images are cached locally so they only need to be downloaded once
// This dramatically reduces bandwidth usage

function getImageCache() {
    return JSON.parse(localStorage.getItem('projectImageCache') || '{}');
}

function saveImageCache(cache) {
    try {
        localStorage.setItem('projectImageCache', JSON.stringify(cache));
    } catch (e) {
        // localStorage might be full - clear old images if needed
        console.warn('Image cache storage failed, clearing old entries');
        clearOldImageCache();
    }
}

function cacheProjectImages(projectName, images) {
    if (!images || images.length === 0) return;
    const cache = getImageCache();
    cache[projectName] = images;
    saveImageCache(cache);
    console.log(`Cached ${images.length} images for "${projectName}"`);
}

function getCachedImages(projectName) {
    const cache = getImageCache();
    return cache[projectName] || null;
}

function clearOldImageCache() {
    // If storage is full, remove images for deleted projects
    const cache = getImageCache();
    const activeProjectNames = new Set(allProjects.filter(p => !p._deletedAt).map(p => p.projectName));

    for (const projectName in cache) {
        if (!activeProjectNames.has(projectName)) {
            delete cache[projectName];
        }
    }
    saveImageCache(cache);
}

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
    setupEventListeners();
    setupDeleteModal();
    setupFirebaseListeners(); // Real-time sync - no refresh needed!
    setupMobileNav(); // Mobile navigation
});

// ==========================================
// Mobile Navigation
// ==========================================
let currentMobileTab = 'projects';

function setupMobileNav() {
    // Check if we're on mobile
    const isMobile = window.innerWidth <= 900;

    if (isMobile) {
        // Set initial state - show projects list first
        switchMobileTab('projects');
        console.log('Mobile nav initialized - showing projects tab');
    }

    // Handle resize between mobile and desktop
    let wasIsMobile = isMobile;
    window.addEventListener('resize', () => {
        const nowMobile = window.innerWidth <= 900;

        if (nowMobile && !wasIsMobile) {
            // Switched TO mobile - activate current tab
            switchMobileTab(currentMobileTab);
        } else if (!nowMobile && wasIsMobile) {
            // Switched TO desktop - remove all mobile classes
            document.querySelector('.sidebar-left')?.classList.remove('mobile-active');
            document.querySelector('.sidebar-right')?.classList.remove('mobile-active');
            document.querySelector('.main-content')?.classList.remove('mobile-active');
        }

        wasIsMobile = nowMobile;
    });
}

function switchMobileTab(tab) {
    currentMobileTab = tab;

    const sidebarLeft = document.querySelector('.sidebar-left');
    const sidebarRight = document.querySelector('.sidebar-right');
    const mainContent = document.querySelector('.main-content');
    const tabs = document.querySelectorAll('.mobile-tab');

    if (!sidebarLeft || !sidebarRight || !mainContent) {
        console.error('Mobile nav: Could not find required elements');
        return;
    }

    // Remove all active states
    sidebarLeft.classList.remove('mobile-active');
    sidebarRight.classList.remove('mobile-active');
    mainContent.classList.remove('mobile-active');
    tabs.forEach(t => t.classList.remove('active'));

    // Activate selected tab
    const activeTab = document.querySelector(`.mobile-tab[data-tab="${tab}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    // Show the selected panel
    switch (tab) {
        case 'projects':
            sidebarLeft.classList.add('mobile-active');
            break;
        case 'main':
            mainContent.classList.add('mobile-active');
            break;
        case 'tasks':
            sidebarRight.classList.add('mobile-active');
            break;
    }

    console.log('Switched to mobile tab:', tab);
}

// Make function globally available
window.switchMobileTab = switchMobileTab;

async function loadAllData() {
    // Load tasks, notes, and changes log from localStorage (these are local-only)
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    allNotes = JSON.parse(localStorage.getItem('projectNotes') || '{}');
    loadChangesLog();

    // FIREBASE IS SOURCE OF TRUTH - fetch from Firebase FIRST
    console.log('Fetching data from Firebase (source of truth)...');
    try {
        await fetchFromFirebaseAsSourceOfTruth();
        console.log('Firebase data loaded. Projects:', allProjects.filter(p => !p._deletedAt).length);
    } catch (err) {
        console.error('Firebase fetch failed, falling back to local:', err);
        // Only use local data if Firebase fails
        loadFromLocalStorage();
    }

    // Migrate and render
    migrateExistingProjects();
    renderProjectList();

    dataLoaded = true;
}

// Fetch from Firebase as the single source of truth
async function fetchFromFirebaseAsSourceOfTruth() {
    const snapshot = await database.ref('/').once('value');
    const data = snapshot.val() || { projects: {}, feedback: {}, tasks: {}, notes: {} };

    // Convert Firebase objects to arrays
    const projectsObj = data.projects || {};
    const feedbackObj = data.feedback || {};
    const tasksObj = data.tasks || {};
    const notesObj = data.notes || {};

    // Firebase data completely replaces local data for projects/feedback
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

    // Load notes from Firebase - convert from {projectKey: {content: "..."}} to {projectName: "..."}
    allNotes = {};
    Object.keys(notesObj).forEach(key => {
        // Find the original project name (key is sanitized)
        const project = allProjects.find(p => sanitizeFirebaseKey(p.projectName) === key);
        const projectName = project ? project.projectName : key;
        if (notesObj[key] && notesObj[key].content !== undefined) {
            allNotes[projectName] = notesObj[key].content;
        }
    });
    localStorage.setItem('projectNotes', JSON.stringify(allNotes));

    // Cache images locally (but Firebase data is truth)
    allProjects.forEach(p => {
        if (p.images && p.images.length > 0) {
            cacheProjectImages(p.projectName, p.images);
        }
    });

    // Restore any cached images for projects that don't have them
    allProjects = allProjects.map(p => {
        if (!p.images || p.images.length === 0) {
            const cached = getCachedImages(p.projectName);
            if (cached) return { ...p, images: cached };
        }
        return p;
    });

    // Save Firebase data to localStorage (as cache for offline)
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    console.log('Firebase data synced:', allProjects.length, 'projects,', allFeedback.length, 'feedback,', Object.keys(allTasks).length, 'task lists,', Object.keys(allNotes).length, 'notes');
}

// Setup Firebase real-time listeners
function setupFirebaseListeners() {
    console.log('Setting up Firebase real-time listeners...');

    // Listen for project changes
    projectsListener = database.ref('projects').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const projectsObj = snapshot.val() || {};
        const newProjects = Object.values(projectsObj).filter(p => !p._deletedAt);

        // Restore cached images
        allProjects = newProjects.map(p => {
            if (!p.images || p.images.length === 0) {
                const cached = getCachedImages(p.projectName);
                if (cached) return { ...p, images: cached };
            } else {
                // Cache new images
                cacheProjectImages(p.projectName, p.images);
            }
            return p;
        });

        // Update localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        console.log('Real-time update: Projects changed, now have', allProjects.length);
        renderProjectList();

        // Update current project view if it changed
        if (currentProject) {
            const updated = allProjects.find(p => p.projectName === currentProject.projectName);
            if (updated) {
                currentProject = updated;
                populateProjectView(updated);
            } else {
                // Project was deleted
                currentProject = null;
                document.getElementById('noProjectSelected').hidden = false;
                document.getElementById('projectView').hidden = true;
            }
        }
    });

    // Listen for feedback changes
    feedbackListener = database.ref('feedback').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const feedbackObj = snapshot.val() || {};
        allFeedback = Object.values(feedbackObj).filter(f => !f._deletedAt);

        // Update localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        console.log('Real-time update: Feedback changed, now have', allFeedback.length);

        // Update feedback display if viewing a project
        if (currentProject) {
            renderExistingFeedback();
        }
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

        console.log('Real-time update: Tasks changed, now have', Object.keys(allTasks).length, 'task lists');

        // Update tasks display if viewing a project
        if (currentProject) {
            renderTasks();
        }
    });

    // Listen for notes changes
    notesListener = database.ref('notes').on('value', (snapshot) => {
        if (!dataLoaded) return; // Skip initial load

        const notesObj = snapshot.val() || {};

        // Convert from {projectKey: {content: "..."}} to {projectName: "..."}
        allNotes = {};
        Object.keys(notesObj).forEach(key => {
            // Find the original project name (key is sanitized)
            const project = allProjects.find(p => sanitizeFirebaseKey(p.projectName) === key);
            const projectName = project ? project.projectName : key;
            if (notesObj[key] && notesObj[key].content !== undefined) {
                allNotes[projectName] = notesObj[key].content;
            }
        });

        // Update localStorage
        localStorage.setItem('projectNotes', JSON.stringify(allNotes));

        console.log('Real-time update: Notes changed, now have', Object.keys(allNotes).length, 'notes');

        // Update notes display if viewing a project
        if (currentProject) {
            loadNotes();
        }
    });

    console.log('Firebase real-time listeners active!');
}

// Migration function for existing projects
function migrateExistingProjects() {
    let needsSync = false;

    allProjects = allProjects.map(project => {
        let modified = false;

        // Add status if missing (default to 'in_progress')
        if (!project.status) {
            project.status = 'in_progress';
            modified = true;
        }

        // Add tags array if missing
        if (!project.tags) {
            project.tags = [];
            modified = true;
        }

        // Add version fields if missing
        if (!project._version) {
            project._version = 1;
            modified = true;
        }
        if (!project._lastModified) {
            project._lastModified = project.timestamp || new Date().toISOString();
            modified = true;
        }

        if (modified) needsSync = true;
        return project;
    });

    // Also migrate feedback
    allFeedback = allFeedback.map(feedback => {
        let modified = false;

        if (!feedback._version) {
            feedback._version = 1;
            modified = true;
        }
        if (!feedback._lastModified) {
            feedback._lastModified = feedback.timestamp || new Date().toISOString();
            modified = true;
        }

        if (modified) needsSync = true;
        return feedback;
    });

    if (needsSync) {
        console.log('Migrated projects with status and version fields');
        // Save migrated data locally only - don't auto-sync to save API requests
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));
        // Cloud sync will happen when user submits new data or clicks Refresh
    }
}

function loadFromLocalStorage() {
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    allProjects = stored.filter(item => item.type === 'project');
    allFeedback = stored.filter(item => item.type === 'feedback');

    // Restore images from cache for all projects
    allProjects = allProjects.map(p => {
        if (!p._deletedAt) {
            const cachedImages = getCachedImages(p.projectName);
            if (cachedImages && cachedImages.length > 0) {
                return { ...p, images: cachedImages };
            }
        }
        return p;
    });
}

// ==========================================
// Firebase Sync
// ==========================================
async function syncFromCloud() {
    // Now uses Firebase real-time listeners, but this can be called manually
    console.log('Workspace: Manual sync from Firebase...');
    await fetchFromFirebaseAsSourceOfTruth();
    renderProjectList();

    // If a project is selected, refresh its view
    if (currentProject) {
        const updatedProject = allProjects.find(p => p.projectName === currentProject.projectName);
        if (updatedProject) {
            currentProject = updatedProject;
            populateProjectView(updatedProject);
            renderExistingFeedback();
        }
    }
}

async function syncToCloud() {
    // With Firebase, we sync individual items, not the whole database
    // This function is kept for compatibility but real sync happens via syncProjectToFirebase
    console.log('Workspace: Full sync to Firebase...');

    try {
        // Cache any local images before syncing
        allProjects.forEach(p => {
            if (p.images && p.images.length > 0 && !p._deletedAt) {
                cacheProjectImages(p.projectName, p.images);
            }
        });

        // Prepare data for Firebase
        const projectsObj = {};
        allProjects.forEach(p => {
            const key = sanitizeFirebaseKey(p.projectName);
            projectsObj[key] = { ...p, id: p.id || generateId() };
        });

        const feedbackObj = {};
        allFeedback.forEach(f => {
            const key = f.id || generateId();
            feedbackObj[key] = { ...f, id: key };
        });

        // Write to Firebase
        await database.ref('/').set({
            projects: projectsObj,
            feedback: feedbackObj,
            lastUpdated: new Date().toISOString()
        });

        // Save to localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        console.log('Synced to Firebase successfully');
    } catch (error) {
        console.error('Firebase sync error:', error);
    }
}

// Sync a single project to Firebase
async function syncProjectToFirebase(project) {
    try {
        const key = sanitizeFirebaseKey(project.projectName);
        await database.ref(`projects/${key}`).set({
            ...project,
            id: project.id || generateId(),
            _lastModified: new Date().toISOString()
        });
        console.log('Synced project to Firebase:', project.projectName);
    } catch (error) {
        console.error('Firebase project sync error:', error);
    }
}

// Sync a single feedback to Firebase
async function syncFeedbackToFirebase(feedback) {
    try {
        const key = feedback.id || generateId();
        await database.ref(`feedback/${key}`).set({
            ...feedback,
            id: key,
            _lastModified: new Date().toISOString()
        });
        console.log('Synced feedback to Firebase');
    } catch (error) {
        console.error('Firebase feedback sync error:', error);
    }
}

// Delete a project from Firebase
async function deleteProjectFromFirebase(projectName) {
    try {
        const key = sanitizeFirebaseKey(projectName);
        await database.ref(`projects/${key}`).remove();
        console.log('Deleted project from Firebase:', projectName);
    } catch (error) {
        console.error('Firebase delete error:', error);
    }
}

// Delete feedback for a project from Firebase
async function deleteFeedbackFromFirebase(projectName) {
    try {
        // Get all feedback and remove matching ones
        const snapshot = await database.ref('feedback').once('value');
        const feedbackObj = snapshot.val() || {};

        const updates = {};
        Object.keys(feedbackObj).forEach(key => {
            if (feedbackObj[key].projectName === projectName) {
                updates[`feedback/${key}`] = null;
            }
        });

        if (Object.keys(updates).length > 0) {
            await database.ref().update(updates);
            console.log('Deleted feedback for project from Firebase:', projectName);
        }
    } catch (error) {
        console.error('Firebase feedback delete error:', error);
    }
}

// Sync tasks for a project to Firebase
async function syncTasksToFirebase(projectName, tasks) {
    try {
        const key = sanitizeFirebaseKey(projectName);
        await database.ref(`tasks/${key}`).set({
            tasks: tasks,
            _lastModified: new Date().toISOString()
        });
        console.log('Synced tasks to Firebase for:', projectName);
    } catch (error) {
        console.error('Firebase tasks sync error:', error);
    }
}

// Sync notes for a project to Firebase
async function syncNotesToFirebase(projectName, notes) {
    try {
        const key = sanitizeFirebaseKey(projectName);
        await database.ref(`notes/${key}`).set({
            content: notes,
            _lastModified: new Date().toISOString()
        });
        console.log('Synced notes to Firebase for:', projectName);
    } catch (error) {
        console.error('Firebase notes sync error:', error);
    }
}

// Delete tasks from Firebase when project is deleted
async function deleteTasksFromFirebase(projectName) {
    try {
        const key = sanitizeFirebaseKey(projectName);
        await database.ref(`tasks/${key}`).remove();
        console.log('Deleted tasks from Firebase for:', projectName);
    } catch (error) {
        console.error('Firebase tasks delete error:', error);
    }
}

// Delete notes from Firebase when project is deleted
async function deleteNotesFromFirebase(projectName) {
    try {
        const key = sanitizeFirebaseKey(projectName);
        await database.ref(`notes/${key}`).remove();
        console.log('Deleted notes from Firebase for:', projectName);
    } catch (error) {
        console.error('Firebase notes delete error:', error);
    }
}

// Sanitize keys for Firebase (no ., #, $, [, ])
function sanitizeFirebaseKey(key) {
    return key.replace(/[.#$\[\]]/g, '_');
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Force refresh from Firebase (user-initiated via Refresh button)
// Note: With real-time listeners, this is rarely needed
async function forceRefreshFromCloud() {
    console.log('User requested refresh from Firebase...');

    // Show loading indicator on button
    const refreshBtn = document.getElementById('refreshProjects');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '...';
    }

    try {
        await fetchFromFirebaseAsSourceOfTruth();
        renderProjectList();

        // If a project was selected, check if it still exists
        if (currentProject) {
            const stillExists = allProjects.find(p => p.projectName === currentProject.projectName && !p._deletedAt);
            if (stillExists) {
                // Update without scrolling
                currentProject = stillExists;
                populateProjectView(stillExists);
                renderExistingFeedback();
            } else {
                // Project was deleted, show empty state
                currentProject = null;
                document.getElementById('noProjectSelected').hidden = false;
                document.getElementById('projectView').hidden = true;
                document.getElementById('todoEmpty').hidden = false;
                document.getElementById('todoContainer').hidden = true;
            }
        }

        console.log('Refresh complete');
    } catch (err) {
        console.error('Refresh failed:', err);
        // Fall back to local data
        loadFromLocalStorage();
        renderProjectList();
    }

    // Restore button
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻';
    }
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
    // Refresh button - force fetch from cloud
    document.getElementById('refreshProjects')?.addEventListener('click', forceRefreshFromCloud);

    // Gallery navigation
    document.getElementById('pvPrevBtn')?.addEventListener('click', () => navigateGallery(-1));
    document.getElementById('pvNextBtn')?.addEventListener('click', () => navigateGallery(1));

    // Notes editing
    document.getElementById('editNotesBtn')?.addEventListener('click', startEditingNotes);
    document.getElementById('cancelNotesBtn')?.addEventListener('click', cancelEditingNotes);
    document.getElementById('saveNotesBtn')?.addEventListener('click', saveNotes);

    // Feedback form submission
    document.getElementById('workspaceFeedbackForm')?.addEventListener('submit', submitFeedback);

    // Task form
    document.getElementById('addTaskBtn')?.addEventListener('click', addTask);
    document.getElementById('newTaskInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // Image upload in gallery
    document.getElementById('addImagesBtn')?.addEventListener('click', () => {
        document.getElementById('galleryFileInput')?.click();
    });
    document.getElementById('galleryFileInput')?.addEventListener('change', handleGalleryUpload);

    // Keyboard navigation for gallery
    document.addEventListener('keydown', (e) => {
        if (!currentProject || !currentProject.images?.length) return;
        if (e.key === 'ArrowLeft') navigateGallery(-1);
        if (e.key === 'ArrowRight') navigateGallery(1);
    });
}

// ==========================================
// Project List Sidebar
// ==========================================
function renderProjectList() {
    const container = document.getElementById('projectListSidebar');
    if (!container) return;

    // Filter out soft-deleted projects and remove duplicates
    const activeProjects = [];
    const seenNames = new Set();
    allProjects.forEach(project => {
        if (!project._deletedAt && !seenNames.has(project.projectName)) {
            seenNames.add(project.projectName);
            activeProjects.push(project);
        }
    });

    // Render tag filter buttons
    renderTagFilters(activeProjects);

    // Get filtered projects based on current filters
    const filteredProjects = getFilteredProjects(activeProjects);

    if (activeProjects.length === 0) {
        container.innerHTML = `
            <div class="sidebar-empty">
                <p>No projects yet</p>
                <a href="index.html">Create one</a>
            </div>
        `;
        return;
    }

    if (filteredProjects.length === 0) {
        container.innerHTML = `
            <div class="sidebar-empty">
                <p>No projects match filters</p>
                <button class="clear-filters-btn" onclick="clearFilters()">Clear Filters</button>
            </div>
        `;
        return;
    }

    // Group projects by status
    const grouped = groupProjectsByStatus(filteredProjects);
    const statusOrder = ['in_progress', 'completed', 'archived'];
    const statusLabels = {
        'in_progress': 'In Progress',
        'completed': 'Completed',
        'archived': 'Archived'
    };

    let html = '';
    statusOrder.forEach(status => {
        const projects = grouped[status] || [];
        if (projects.length === 0) return;

        html += `
            <div class="sidebar-status-group">
                <div class="sidebar-status-header">
                    <span class="sidebar-status-label status-${status}">${statusLabels[status]}</span>
                    <span class="sidebar-status-count">${projects.length}</span>
                </div>
                ${projects.map((project) => renderProjectItem(project, activeProjects)).join('')}
            </div>
        `;
    });

    container.innerHTML = html;

    // Add click listeners
    container.querySelectorAll('.sidebar-project-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('sidebar-delete-btn')) return;
            const projectName = item.dataset.projectName;
            const project = activeProjects.find(p => p.projectName === projectName);
            if (project) selectProject(project);
        });
    });

    // Add delete button listeners
    container.querySelectorAll('.sidebar-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteModal(btn.dataset.project);
        });
    });
}

// Render individual project item
function renderProjectItem(project, allActiveProjects) {
    const tags = project.tags || [];
    const tagsHtml = tags.length > 0
        ? `<div class="sidebar-project-tags">${tags.map(t => `<span class="sidebar-tag">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';

    return `
        <div class="sidebar-project-item ${currentProject?.projectName === project.projectName ? 'active' : ''}"
             data-project-name="${escapeHtml(project.projectName)}">
            <div class="sidebar-project-content">
                <div class="sidebar-project-name">${escapeHtml(project.projectName)}</div>
                <div class="sidebar-project-meta">
                    <span class="sidebar-project-type">${escapeHtml(project.projectType)}</span>
                    <span class="sidebar-project-creator">${escapeHtml(project.creator || 'Jason')}</span>
                </div>
                ${tagsHtml}
            </div>
            <button class="sidebar-delete-btn" data-project="${escapeHtml(project.projectName)}" title="Delete project">&times;</button>
        </div>
    `;
}

// Group projects by status
function groupProjectsByStatus(projects) {
    const groups = {
        'in_progress': [],
        'completed': [],
        'archived': []
    };

    projects.forEach(project => {
        const status = project.status || 'in_progress';
        if (groups[status]) {
            groups[status].push(project);
        } else {
            groups['in_progress'].push(project);
        }
    });

    return groups;
}

// Get filtered projects based on current filter state
function getFilteredProjects(projects) {
    return projects.filter(project => {
        // Filter by status
        if (statusFilter !== 'all') {
            const projectStatus = project.status || 'in_progress';
            if (projectStatus !== statusFilter) return false;
        }

        // Filter by tags (AND logic - must have all selected tags)
        if (tagFilters.length > 0) {
            const projectTags = project.tags || [];
            const hasAllTags = tagFilters.every(tag => projectTags.includes(tag));
            if (!hasAllTags) return false;
        }

        return true;
    });
}

// Render tag filter buttons
function renderTagFilters(projects) {
    const tagFilterContainer = document.getElementById('tagFilters');
    if (!tagFilterContainer) return;

    // Collect all unique tags
    const allTags = new Set();
    projects.forEach(project => {
        (project.tags || []).forEach(tag => allTags.add(tag));
    });

    if (allTags.size === 0) {
        tagFilterContainer.innerHTML = '';
        tagFilterContainer.hidden = true;
        return;
    }

    tagFilterContainer.hidden = false;
    tagFilterContainer.innerHTML = Array.from(allTags).sort().map(tag => `
        <button class="tag-filter-btn ${tagFilters.includes(tag) ? 'active' : ''}"
                data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join('');

    // Add click listeners
    tagFilterContainer.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            toggleTagFilter(tag);
        });
    });
}

// Toggle tag filter
function toggleTagFilter(tag) {
    const index = tagFilters.indexOf(tag);
    if (index === -1) {
        tagFilters.push(tag);
    } else {
        tagFilters.splice(index, 1);
    }
    renderProjectList();
}

// Set status filter
function setStatusFilter(status) {
    statusFilter = status;
    // Update dropdown if it exists
    const dropdown = document.getElementById('statusFilter');
    if (dropdown) dropdown.value = status;
    renderProjectList();
}

// Clear all filters
function clearFilters() {
    statusFilter = 'all';
    tagFilters = [];
    const dropdown = document.getElementById('statusFilter');
    if (dropdown) dropdown.value = 'all';
    renderProjectList();
}

// ==========================================
// Select Project
// ==========================================
function selectProject(project) {
    currentProject = project;
    currentImageIndex = 0;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-project-item').forEach(item => {
        item.classList.remove('active');
        if (allProjects[parseInt(item.dataset.index)]?.projectName === project.projectName) {
            item.classList.add('active');
        }
    });

    // On mobile, switch to main view after selecting project
    if (window.innerWidth <= 900) {
        switchMobileTab('main');
    }

    // Hide the "Select a Project" message and show project view
    const noProjectEl = document.getElementById('noProjectSelected');
    const projectViewEl = document.getElementById('projectView');

    if (noProjectEl) {
        noProjectEl.style.display = 'none';
        noProjectEl.hidden = true;
    }
    if (projectViewEl) {
        projectViewEl.hidden = false;
        projectViewEl.style.display = 'block';
    }

    // Show todo container
    const todoEmpty = document.getElementById('todoEmpty');
    const todoContainer = document.getElementById('todoContainer');
    if (todoEmpty) {
        todoEmpty.hidden = true;
        todoEmpty.style.display = 'none';
    }
    if (todoContainer) {
        todoContainer.hidden = false;
        todoContainer.style.display = 'flex';
    }

    // Scroll main content to top
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
    }

    // Populate project details
    populateProjectView(project);

    // Load tasks for this project
    renderTasks();

    // Load notes
    loadNotes();

    // Load existing feedback
    renderExistingFeedback();

    // Reset feedback form
    resetFeedbackForm();

    // Load changes log
    renderChangesLog();
}

// ==========================================
// Populate Project View
// ==========================================
function populateProjectView(project) {
    document.getElementById('pvProjectName').textContent = project.projectName;
    document.getElementById('pvProjectType').textContent = project.projectType;
    document.getElementById('pvCreator').textContent = project.creator || 'Jason';
    document.getElementById('pvSummary').textContent = project.summary || 'No summary';
    document.getElementById('pvProblem').textContent = project.problem || '-';
    document.getElementById('pvSuccess').textContent = project.success || '-';

    // Update todo project name
    document.getElementById('todoProjectName').textContent = project.projectName;

    // Update status dropdown in project view
    const statusSelect = document.getElementById('pvStatusSelect');
    if (statusSelect) {
        statusSelect.value = project.status || 'in_progress';
    }

    // Display tags in project view
    const tagsContainer = document.getElementById('pvTags');
    if (tagsContainer) {
        const tags = project.tags || [];
        if (tags.length > 0) {
            tagsContainer.innerHTML = tags.map(t => `<span class="pv-tag">${escapeHtml(t)}</span>`).join('');
            tagsContainer.parentElement.hidden = false;
        } else {
            tagsContainer.innerHTML = '<span class="pv-no-tags">No tags</span>';
            tagsContainer.parentElement.hidden = false;
        }
    }

    // Debug: Log images data
    console.log('Project images:', project.images);
    console.log('Images count:', project.images ? project.images.length : 0);

    // Setup gallery
    setupGallery(project.images || []);

    // Update image count display
    updateImageCount();
}

// Update project status
async function updateProjectStatus(newStatus) {
    if (!currentProject) return;

    const projectName = currentProject.projectName;
    const now = new Date().toISOString();

    // Update the project in allProjects
    const updatedProject = {
        ...currentProject,
        status: newStatus,
        _lastModified: now,
        _version: (currentProject._version || 0) + 1
    };

    allProjects = allProjects.map(p => {
        if (p.projectName === projectName) {
            return updatedProject;
        }
        return p;
    });

    // Update currentProject reference
    currentProject = updatedProject;

    // Save to localStorage
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    // Log the change
    const user = getCurrentUser();
    const statusLabels = {
        'in_progress': 'In Progress',
        'completed': 'Completed',
        'archived': 'Archived'
    };
    logChange(projectName, user, 'updated', `Changed status to ${statusLabels[newStatus]}`);

    // Sync to Firebase (non-blocking)
    syncProjectToFirebase(updatedProject);

    // Re-render sidebar to show updated grouping
    renderProjectList();
}

// ==========================================
// Gallery
// ==========================================
function setupGallery(images) {
    const mainImg = document.getElementById('pvMainImage');
    const noImages = document.getElementById('pvNoImages');
    const prevBtn = document.getElementById('pvPrevBtn');
    const nextBtn = document.getElementById('pvNextBtn');
    const thumbsContainer = document.getElementById('pvThumbnails');

    thumbsContainer.innerHTML = '';

    if (!images || images.length === 0) {
        mainImg.style.display = 'none';
        noImages.style.display = 'block';
        prevBtn.hidden = true;
        nextBtn.hidden = true;
        return;
    }

    mainImg.style.display = 'block';
    noImages.style.display = 'none';
    mainImg.src = images[0];
    currentImageIndex = 0;

    if (images.length > 1) {
        prevBtn.hidden = false;
        nextBtn.hidden = false;

        images.forEach((src, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'pv-thumb' + (index === 0 ? ' active' : '');
            thumb.innerHTML = `<img src="${src}" alt="Thumbnail ${index + 1}">`;
            thumb.addEventListener('click', () => selectImage(index));
            thumbsContainer.appendChild(thumb);
        });
    } else {
        prevBtn.hidden = true;
        nextBtn.hidden = true;
    }
}

function selectImage(index) {
    if (!currentProject?.images) return;
    const images = currentProject.images;
    if (index < 0 || index >= images.length) return;

    currentImageIndex = index;
    document.getElementById('pvMainImage').src = images[index];

    document.querySelectorAll('.pv-thumb').forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });
}

function navigateGallery(direction) {
    if (!currentProject?.images) return;
    const images = currentProject.images;
    let newIndex = currentImageIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    selectImage(newIndex);
}

// ==========================================
// Image Upload from Workspace
// ==========================================
async function handleGalleryUpload(e) {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }

    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const maxImages = window.IMAGE_CONFIG?.maxImages || 50;
    const currentImages = currentProject.images || [];

    // Check if we'd exceed the limit
    if (currentImages.length + files.length > maxImages) {
        alert(`Maximum ${maxImages} images allowed. You can add ${maxImages - currentImages.length} more.`);
        e.target.value = '';
        return;
    }

    // Validate files
    const validFiles = [];
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            alert(`"${file.name}" is not an image.`);
            continue;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert(`"${file.name}" is too large. Maximum size is 5MB.`);
            continue;
        }
        validFiles.push(file);
    }

    if (validFiles.length === 0) {
        e.target.value = '';
        return;
    }

    // Show loading state
    const addBtn = document.getElementById('addImagesBtn');
    const originalText = addBtn.innerHTML;
    addBtn.innerHTML = '<span class="btn-icon">...</span><span class="btn-label">Uploading...</span>';
    addBtn.disabled = true;

    try {
        // Compress images
        console.log('Compressing', validFiles.length, 'images...');
        const compressedImages = await window.compressImages(validFiles);
        console.log('Compressed', compressedImages.length, 'images');

        // Add to project
        const newImages = [...currentImages, ...compressedImages];
        const now = new Date().toISOString();

        const updatedProject = {
            ...currentProject,
            images: newImages,
            _lastModified: now,
            _version: (currentProject._version || 0) + 1
        };

        // Update in allProjects
        allProjects = allProjects.map(p => {
            if (p.projectName === currentProject.projectName) {
                return updatedProject;
            }
            return p;
        });

        // Update currentProject reference
        currentProject = updatedProject;

        // Save to localStorage
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));

        // Cache images locally
        cacheProjectImages(currentProject.projectName, newImages);

        // Sync to Firebase
        await syncProjectToFirebase(updatedProject);

        // Log the change
        const user = getCurrentUser();
        logChange(currentProject.projectName, user, 'updated', `Added ${compressedImages.length} screenshot(s)`);

        // Refresh gallery
        setupGallery(newImages);
        updateImageCount();

        console.log('Images added successfully. Total:', newImages.length);

    } catch (error) {
        console.error('Image upload error:', error);
        alert('Failed to upload images. Please try again.');
    }

    // Reset
    addBtn.innerHTML = originalText;
    addBtn.disabled = false;
    e.target.value = '';
}

function updateImageCount() {
    const countEl = document.getElementById('imageCount');
    if (!countEl) return;

    const count = currentProject?.images?.length || 0;
    const maxImages = window.IMAGE_CONFIG?.maxImages || 50;

    if (count > 0) {
        countEl.textContent = `${count} / ${maxImages}`;
    } else {
        countEl.textContent = '';
    }
}

// ==========================================
// Notes
// ==========================================
function loadNotes() {
    const notes = allNotes[currentProject.projectName] || '';
    document.getElementById('pvNotesText').textContent = notes || 'No notes yet. Click Edit to add notes about this project.';
    document.getElementById('pvNotesContent').hidden = false;
    document.getElementById('pvNotesEdit').hidden = true;
}

function startEditingNotes() {
    const notes = allNotes[currentProject.projectName] || '';
    document.getElementById('pvNotesInput').value = notes;
    document.getElementById('pvNotesContent').hidden = true;
    document.getElementById('pvNotesEdit').hidden = false;
    document.getElementById('pvNotesInput').focus();
}

function cancelEditingNotes() {
    document.getElementById('pvNotesContent').hidden = false;
    document.getElementById('pvNotesEdit').hidden = true;
}

function saveNotes() {
    const notes = document.getElementById('pvNotesInput').value.trim();
    const oldNotes = allNotes[currentProject.projectName] || '';
    allNotes[currentProject.projectName] = notes;
    localStorage.setItem('projectNotes', JSON.stringify(allNotes));

    // Sync to Firebase (non-blocking)
    syncNotesToFirebase(currentProject.projectName, notes);

    document.getElementById('pvNotesText').textContent = notes || 'No notes yet. Click Edit to add notes about this project.';
    document.getElementById('pvNotesContent').hidden = false;
    document.getElementById('pvNotesEdit').hidden = true;

    // Log the change
    const user = getCurrentUser();
    if (!oldNotes && notes) {
        logChange(currentProject.projectName, user, 'created', 'Added creator notes');
    } else if (notes) {
        logChange(currentProject.projectName, user, 'updated', 'Updated creator notes');
    }
}

// ==========================================
// Feedback
// ==========================================
function renderExistingFeedback() {
    const container = document.getElementById('pvExistingFeedback');
    // Filter out soft-deleted feedback
    const projectFeedback = allFeedback.filter(f =>
        f.projectName === currentProject.projectName && !f._deletedAt
    );

    if (projectFeedback.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = projectFeedback.map((f) => {
        // Check if this is new format (has feedbackText) or old format (has usefulness rating)
        const isNewFormat = f.feedbackText !== undefined && f.feedbackText !== null;

        if (isNewFormat) {
            // New simplified format - just show the text
            return `
                <div class="pv-feedback-item pv-feedback-simple">
                    <div class="pv-feedback-item-header">
                        <span class="pv-feedback-author ${(f.author || 'Jason').toLowerCase()}">${escapeHtml(f.author || 'Jason')}</span>
                        <span>${formatDate(f.timestamp)}</span>
                    </div>
                    <div class="pv-feedback-text-simple">
                        ${escapeHtml(f.feedbackText)}
                    </div>
                </div>
            `;
        } else {
            // Old format with ratings - display as before
            return `
                <div class="pv-feedback-item">
                    <div class="pv-feedback-item-header">
                        <span class="pv-feedback-author ${(f.author || 'Jason').toLowerCase()}">${escapeHtml(f.author || 'Jason')}</span>
                        <span>${formatDate(f.timestamp)}</span>
                    </div>
                    <div class="pv-feedback-scores">
                        <div class="pv-feedback-score">
                            <span class="pv-feedback-score-label">Usefulness</span>
                            <span class="pv-feedback-score-value">${f.usefulness}/5</span>
                        </div>
                    </div>
                    <div class="pv-feedback-badges">
                        <span class="pv-badge ${f.wouldUse === 'Yes' ? 'yes' : 'no'}">${f.wouldUse === 'Yes' ? 'Would use' : "Wouldn't use"}</span>
                        <span class="pv-badge ${f.priority === 'Yes' ? 'yes' : 'no'}">${f.priority === 'Yes' ? 'Priority' : 'Not priority'}</span>
                    </div>
                    <div class="pv-feedback-text">
                        ${f.whyUseful ? `<strong>Why useful:</strong> ${escapeHtml(f.whyUseful)}` : ''}
                        ${f.whyNotUseful ? `<strong>Why not useful:</strong> ${escapeHtml(f.whyNotUseful)}` : ''}
                        ${f.bestThing ? `<strong>Best thing:</strong> ${escapeHtml(f.bestThing)}` : ''}
                        ${f.improve ? `<strong>To improve:</strong> ${escapeHtml(f.improve)}` : ''}
                    </div>
                </div>
            `;
        }
    }).join('');
}

function resetFeedbackForm() {
    const form = document.getElementById('workspaceFeedbackForm');
    form.reset();
    form.querySelectorAll('button.selected').forEach(btn => btn.classList.remove('selected'));
}

function submitFeedback(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const feedbackText = formData.get('feedbackText')?.trim();

    // Validate - just need feedback text
    if (!feedbackText) {
        alert('Please enter your feedback');
        return;
    }

    const user = getCurrentUser();
    const now = new Date().toISOString();
    const feedbackId = generateId();
    const data = {
        type: 'feedback',
        id: feedbackId,
        timestamp: now,
        projectName: currentProject.projectName,
        author: user,
        // New simplified format
        feedbackText: feedbackText,
        // Legacy fields set to null for backwards compatibility
        usefulness: null,
        wouldUse: null,
        priority: null,
        whyUseful: null,
        whyNotUseful: null,
        // Version tracking
        _version: 1,
        _lastModified: now
    };

    // Update local state
    allFeedback.push(data);

    // Save to localStorage
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    // Sync to Firebase (non-blocking)
    syncFeedbackToFirebase(data);

    // Log the change
    logChange(currentProject.projectName, user, 'feedback', 'Submitted feedback');

    // Re-render
    renderExistingFeedback();
    resetFeedbackForm();

    alert('Feedback submitted!');
}

// ==========================================
// Tasks
// ==========================================
function getProjectTasks() {
    return allTasks[currentProject.projectName] || [];
}

function saveProjectTasks(tasks) {
    allTasks[currentProject.projectName] = tasks;
    localStorage.setItem('projectTasks', JSON.stringify(allTasks));

    // Sync to Firebase (non-blocking)
    syncTasksToFirebase(currentProject.projectName, tasks);
}

function renderTasks() {
    const container = document.getElementById('todoList');
    const tasks = getProjectTasks();

    if (tasks.length === 0) {
        container.innerHTML = '<div class="todo-empty" style="padding: 1rem;">No tasks yet</div>';
    } else {
        container.innerHTML = tasks.map((task, index) => `
            <div class="todo-item ${task.completed ? 'completed' : ''}" data-index="${index}">
                <div class="todo-checkbox ${task.completed ? 'checked' : ''}" data-index="${index}">
                    ${task.completed ? '&#10003;' : ''}
                </div>
                <div class="todo-content">
                    <div class="todo-text">${escapeHtml(task.text)}</div>
                    <div class="todo-assignee ${task.assignee.toLowerCase()}">${task.assignee}</div>
                </div>
                <button class="todo-delete" data-index="${index}">&times;</button>
            </div>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.todo-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', () => toggleTask(parseInt(checkbox.dataset.index)));
        });

        container.querySelectorAll('.todo-delete').forEach(btn => {
            btn.addEventListener('click', () => deleteTask(parseInt(btn.dataset.index)));
        });
    }
}

function addTask() {
    const input = document.getElementById('newTaskInput');
    const assigneeSelect = document.getElementById('newTaskAssignee');
    const text = input.value.trim();

    if (!text) return;

    const assignee = assigneeSelect.value;
    const tasks = getProjectTasks();
    tasks.push({
        text,
        assignee,
        completed: false,
        createdAt: new Date().toISOString()
    });

    saveProjectTasks(tasks);
    renderTasks();

    // Log the change
    const user = getCurrentUser();
    logChange(currentProject.projectName, user, 'task', `Added task: "${text}" (assigned to ${assignee})`);

    input.value = '';
    input.focus();
}

function toggleTask(index) {
    const tasks = getProjectTasks();
    if (tasks[index]) {
        const task = tasks[index];
        task.completed = !task.completed;
        saveProjectTasks(tasks);
        renderTasks();

        // Log the change
        const user = getCurrentUser();
        const status = task.completed ? 'Completed' : 'Reopened';
        logChange(currentProject.projectName, user, 'task', `${status} task: "${task.text}"`);
    }
}

function deleteTask(index) {
    const tasks = getProjectTasks();
    const deletedTask = tasks[index];
    tasks.splice(index, 1);
    saveProjectTasks(tasks);
    renderTasks();

    // Log the change
    if (deletedTask) {
        const user = getCurrentUser();
        logChange(currentProject.projectName, user, 'deleted', `Deleted task: "${deletedTask.text}"`);
    }
}

// ==========================================
// Utilities
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

function formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

// ==========================================
// Changes Log
// ==========================================
let allChangesLog = {};

function loadChangesLog() {
    allChangesLog = JSON.parse(localStorage.getItem('projectChangesLog') || '{}');
}

function saveChangesLog() {
    localStorage.setItem('projectChangesLog', JSON.stringify(allChangesLog));
}

function logChange(projectName, author, actionType, description) {
    if (!allChangesLog[projectName]) {
        allChangesLog[projectName] = [];
    }

    allChangesLog[projectName].unshift({
        timestamp: new Date().toISOString(),
        author,
        actionType,
        description
    });

    // Keep only last 50 changes per project
    if (allChangesLog[projectName].length > 50) {
        allChangesLog[projectName] = allChangesLog[projectName].slice(0, 50);
    }

    saveChangesLog();
    renderChangesLog();
}

function renderChangesLog() {
    const container = document.getElementById('changesLogList');
    const countEl = document.getElementById('changesCount');

    if (!currentProject || !container) return;

    const changes = allChangesLog[currentProject.projectName] || [];

    if (countEl) {
        countEl.textContent = changes.length;
    }

    if (changes.length === 0) {
        container.innerHTML = '<div class="changes-empty">No changes yet</div>';
        return;
    }

    container.innerHTML = changes.map(change => `
        <div class="change-item">
            <div class="change-item-header">
                <span class="change-author ${change.author.toLowerCase()}">${escapeHtml(change.author)}</span>
                <span class="change-time">${formatDateTime(change.timestamp)}</span>
            </div>
            <div class="change-action">
                <span class="change-action-type ${change.actionType}">${change.actionType}</span>
                ${escapeHtml(change.description)}
            </div>
        </div>
    `).join('');
}

// Get current user (for logging purposes)
function getCurrentUser() {
    // For now, use a simple method - could be expanded with proper auth later
    return localStorage.getItem('currentUser') || 'Jason';
}

function setCurrentUser(user) {
    localStorage.setItem('currentUser', user);
}

// ==========================================
// Delete Project Modal
// ==========================================
function setupDeleteModal() {
    const modal = document.getElementById('deleteModal');
    const backdrop = document.getElementById('deleteModalBackdrop');
    const closeBtn = document.getElementById('deleteModalClose');
    const cancelBtn = document.getElementById('deleteCancelBtn');
    const confirmBtn = document.getElementById('deleteConfirmBtn');

    if (!modal) return;

    // Close modal handlers
    backdrop?.addEventListener('click', hideDeleteModal);
    closeBtn?.addEventListener('click', hideDeleteModal);
    cancelBtn?.addEventListener('click', hideDeleteModal);
    confirmBtn?.addEventListener('click', confirmDeleteProject);

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) {
            hideDeleteModal();
        }
    });
}

function showDeleteModal(projectName) {
    projectToDelete = projectName;
    const modal = document.getElementById('deleteModal');
    const nameSpan = document.getElementById('deleteProjectName');

    if (nameSpan) nameSpan.textContent = projectName;
    if (modal) modal.hidden = false;
}

function hideDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.hidden = true;
    projectToDelete = null;
}

async function confirmDeleteProject() {
    if (!projectToDelete) return;

    const projectName = projectToDelete;

    // HARD DELETE: Completely remove project and all associated data
    // This is permanent - no recovery possible

    // 1. Remove project from allProjects
    allProjects = allProjects.filter(p => p.projectName !== projectName);

    // 2. Remove all feedback for this project
    allFeedback = allFeedback.filter(f => f.projectName !== projectName);

    // 3. Clear cached images for this project
    const imageCache = getImageCache();
    delete imageCache[projectName];
    saveImageCache(imageCache);
    console.log(`Deleted cached images for "${projectName}"`);

    // 4. Remove tasks, notes, and changes log
    delete allTasks[projectName];
    delete allNotes[projectName];
    delete allChangesLog[projectName];

    // 5. Remove from completed projects tracking (dashboard)
    const completedProjects = JSON.parse(localStorage.getItem('completedProjects') || '{}');
    delete completedProjects[projectName];
    localStorage.setItem('completedProjects', JSON.stringify(completedProjects));

    // 6. Save cleaned data to localStorage
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));
    localStorage.setItem('projectTasks', JSON.stringify(allTasks));
    localStorage.setItem('projectNotes', JSON.stringify(allNotes));
    localStorage.setItem('projectChangesLog', JSON.stringify(allChangesLog));

    console.log(`HARD DELETED project "${projectName}" and all associated data`);

    // If deleted project was selected, clear selection
    if (currentProject?.projectName === projectName) {
        currentProject = null;
        const noProjectEl = document.getElementById('noProjectSelected');
        const projectViewEl = document.getElementById('projectView');
        const todoEmpty = document.getElementById('todoEmpty');
        const todoContainer = document.getElementById('todoContainer');

        if (noProjectEl) {
            noProjectEl.hidden = false;
            noProjectEl.style.display = '';
        }
        if (projectViewEl) {
            projectViewEl.hidden = true;
            projectViewEl.style.display = 'none';
        }
        if (todoEmpty) {
            todoEmpty.hidden = false;
            todoEmpty.style.display = '';
        }
        if (todoContainer) {
            todoContainer.hidden = true;
            todoContainer.style.display = 'none';
        }
    }

    // Delete from Firebase
    await deleteProjectFromFirebase(projectName);
    await deleteFeedbackFromFirebase(projectName);
    await deleteTasksFromFirebase(projectName);
    await deleteNotesFromFirebase(projectName);

    // Re-render
    renderProjectList();

    // Hide modal
    hideDeleteModal();
}

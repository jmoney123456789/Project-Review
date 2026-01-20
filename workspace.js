// ==========================================
// PROJECT REVIEW - Workspace Script
// ==========================================

// JSONBin.io Configuration - uses variables from app.js (loaded first)
// JSONBIN_BIN_ID and JSONBIN_API_KEY are defined in app.js

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

// Cache settings - reduced for better sync
const CACHE_DURATION = 30 * 1000; // 30 seconds (reduced from 5 minutes)
let lastCloudFetch = 0;

// Sync lock to prevent concurrent syncs
let syncInProgress = false;
let pollingInterval = null;

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
    setupEventListeners();
    setupDeleteModal();
    setupVisibilityAndPolling();
});

// Setup visibility-based refresh and periodic polling
function setupVisibilityAndPolling() {
    // Sync when tab becomes visible (silent refresh, no scroll reset)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('Tab became visible, syncing...');
            silentRefreshFromCloud();
        }
    });

    // Start periodic polling (every 30 seconds when page is visible)
    startPolling();
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(() => {
        if (document.visibilityState === 'visible' && !syncInProgress) {
            console.log('Periodic sync...');
            syncFromCloud(true).then(() => {
                renderProjectList();
                if (currentProject) {
                    const updated = allProjects.find(p => p.projectName === currentProject.projectName && !p._deletedAt);
                    if (updated) {
                        // Update currentProject reference without re-selecting (no scroll)
                        currentProject = updated;
                        renderExistingFeedback();
                    }
                }
            }).catch(err => console.log('Periodic sync failed:', err));
        }
    }, 30000); // 30 seconds
}

async function loadAllData() {
    // Load tasks, notes, and changes log from localStorage
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    allNotes = JSON.parse(localStorage.getItem('projectNotes') || '{}');
    loadChangesLog();

    // Load projects and feedback from localStorage first
    loadFromLocalStorage();

    // Migrate existing projects (add status and tags if missing)
    migrateExistingProjects();

    // Render immediately with local data
    renderProjectList();

    // Check if we need to fetch from cloud (cache expired or first load)
    const now = Date.now();
    const cachedTimestamp = parseInt(localStorage.getItem('projectCacheTimestamp') || '0');

    if (JSONBIN_BIN_ID && JSONBIN_API_KEY && (now - cachedTimestamp > CACHE_DURATION)) {
        console.log('Cache expired, fetching from cloud...');
        try {
            await syncFromCloud();
            // Re-migrate after cloud sync (in case cloud data also needs migration)
            migrateExistingProjects();
            localStorage.setItem('projectCacheTimestamp', now.toString());
            console.log('Cloud sync complete. Projects:', allProjects.filter(p => !p._deletedAt).length);
            renderProjectList();
        } catch (err) {
            console.log('Cloud sync failed, using local data:', err);
        }
    } else {
        console.log('Using cached data');
    }

    dataLoaded = true;
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
        // Save migrated data locally
        const combined = [...allProjects, ...allFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(combined));
        // Sync to cloud (non-blocking)
        syncToCloud();
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
        console.log('JSONBin not configured');
        return;
    }

    console.log('Workspace: Fetching from JSONBin...');

    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Access-Key': JSONBIN_API_KEY }
    });

    if (response.ok) {
        const data = await response.json();
        console.log('Workspace: Cloud data received:', data);
        const cloudData = data.record || { projects: [], feedback: [] };

        console.log('Workspace: Cloud has', (cloudData.projects || []).length, 'projects');

        // Merge cloud data with local data (cloud takes precedence for newer items)
        mergeCloudData(cloudData);

        console.log('Workspace: After merge, allProjects has', allProjects.length, 'projects');

        // If a project is selected, refresh its view
        if (currentProject) {
            const updatedProject = allProjects.find(p => p.projectName === currentProject.projectName);
            if (updatedProject) {
                selectProject(updatedProject);
            }
        }
    } else {
        console.error('Workspace: Cloud fetch failed with status:', response.status);
    }
}

async function syncToCloud() {
    if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) return;

    // Prevent concurrent syncs
    if (syncInProgress) {
        console.log('Sync already in progress, skipping...');
        return;
    }

    syncInProgress = true;

    try {
        // Read-modify-write pattern: fetch latest first, merge, then push
        console.log('Sync: Fetching latest from cloud before push...');
        const fetchResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
            headers: { 'X-Access-Key': JSONBIN_API_KEY }
        });

        if (fetchResponse.ok) {
            const data = await fetchResponse.json();
            const cloudData = data.record || { projects: [], feedback: [] };

            // Merge with current local data
            const cloudProjects = cloudData.projects || [];
            const cloudFeedback = cloudData.feedback || [];

            // Smart merge to combine local changes with cloud changes
            const mergedProjects = smartMergeItems(allProjects, cloudProjects, 'projectName');
            const mergedFeedback = smartMergeItems(allFeedback, cloudFeedback, 'timestamp');

            // Update local state with merged data
            allProjects = mergedProjects;
            allFeedback = mergedFeedback;
        }

        // Now push the merged data
        const pushData = {
            projects: allProjects,
            feedback: allFeedback,
            lastUpdated: new Date().toISOString()
        };

        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(pushData)
        });

        if (response.ok) {
            console.log('Synced to cloud successfully');
            // Save merged data to localStorage
            const combined = [...allProjects, ...allFeedback];
            localStorage.setItem('projectReviewData', JSON.stringify(combined));
            // Reset cache timestamp so other tabs get fresh data
            localStorage.setItem('projectCacheTimestamp', '0');
        } else {
            const errorText = await response.text();
            console.error('Cloud sync failed with status:', response.status, errorText);
            // Don't show alert for background syncs - only log to console
        }
    } catch (error) {
        console.error('Cloud sync error:', error);
        // Don't show alert for background syncs - only log to console
    } finally {
        syncInProgress = false;
    }
}

function mergeCloudData(cloudData) {
    // Smart merge: compare versions and timestamps, respect soft deletes
    const cloudProjects = cloudData.projects || [];
    const cloudFeedback = cloudData.feedback || [];

    // Merge projects - keep newer version, respect deletions
    const mergedProjects = smartMergeItems(allProjects, cloudProjects, 'projectName');

    // Merge feedback - keep newer version, respect deletions
    const mergedFeedback = smartMergeItems(allFeedback, cloudFeedback, 'timestamp');

    // Filter out soft-deleted items for display (but keep them in storage for sync)
    allProjects = mergedProjects;
    allFeedback = mergedFeedback;

    // Save to localStorage (including soft-deleted items)
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));

    console.log('Smart merged from cloud:', allProjects.filter(p => !p._deletedAt).length, 'active projects,',
                allFeedback.filter(f => !f._deletedAt).length, 'active feedback');
}

// Smart merge function that handles version conflicts
function smartMergeItems(localItems, cloudItems, keyField) {
    const merged = new Map();

    // Add all cloud items first
    cloudItems.forEach(item => {
        const key = item[keyField];
        merged.set(key, item);
    });

    // Merge local items, keeping newer versions
    localItems.forEach(localItem => {
        const key = localItem[keyField];
        const cloudItem = merged.get(key);

        if (!cloudItem) {
            // Local item doesn't exist in cloud - add it (new item)
            merged.set(key, ensureVersionFields(localItem));
        } else {
            // Both exist - compare versions and timestamps
            const localVersion = localItem._version || 0;
            const cloudVersion = cloudItem._version || 0;
            const localModified = new Date(localItem._lastModified || localItem.timestamp || 0).getTime();
            const cloudModified = new Date(cloudItem._lastModified || cloudItem.timestamp || 0).getTime();

            // If cloud item is deleted and is newer, keep it deleted
            if (cloudItem._deletedAt) {
                const cloudDeletedTime = new Date(cloudItem._deletedAt).getTime();
                if (cloudDeletedTime > localModified) {
                    // Cloud deletion is newer - keep cloud (deleted)
                    merged.set(key, cloudItem);
                } else {
                    // Local modification is newer - keep local (restored)
                    merged.set(key, ensureVersionFields(localItem));
                }
            } else if (localItem._deletedAt) {
                const localDeletedTime = new Date(localItem._deletedAt).getTime();
                if (localDeletedTime > cloudModified) {
                    // Local deletion is newer - keep local (deleted)
                    merged.set(key, localItem);
                } else {
                    // Cloud modification is newer - keep cloud (restored)
                    merged.set(key, ensureVersionFields(cloudItem));
                }
            } else {
                // Neither deleted - keep the one with higher version, or newer timestamp if versions equal
                if (localVersion > cloudVersion || (localVersion === cloudVersion && localModified > cloudModified)) {
                    merged.set(key, localItem);
                } else {
                    merged.set(key, cloudItem);
                }
            }
        }
    });

    return Array.from(merged.values());
}

// Ensure item has version tracking fields
function ensureVersionFields(item) {
    if (!item._version) item._version = 1;
    if (!item._lastModified) item._lastModified = item.timestamp || new Date().toISOString();
    return item;
}

// Silent refresh from cloud (no scroll reset, no alerts)
async function silentRefreshFromCloud() {
    if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) return;

    try {
        await syncFromCloud(true);
        localStorage.setItem('projectCacheTimestamp', Date.now().toString());
        renderProjectList();

        // Update current project data without scrolling
        if (currentProject) {
            const updated = allProjects.find(p => p.projectName === currentProject.projectName && !p._deletedAt);
            if (updated) {
                currentProject = updated;
                renderExistingFeedback();
            }
        }
    } catch (err) {
        console.log('Silent refresh failed:', err);
    }
}

// Force refresh from cloud (bypasses cache)
async function forceRefreshFromCloud() {
    console.log('Force refreshing from cloud...');

    // Clear cache timestamp to force refresh
    localStorage.setItem('projectCacheTimestamp', '0');

    if (JSONBIN_BIN_ID && JSONBIN_API_KEY) {
        try {
            await syncFromCloud();
            localStorage.setItem('projectCacheTimestamp', Date.now().toString());
            renderProjectList();

            // If a project was selected, check if it still exists
            if (currentProject) {
                const stillExists = allProjects.find(p => p.projectName === currentProject.projectName);
                if (stillExists) {
                    selectProject(stillExists);
                } else {
                    // Project was deleted, show empty state
                    currentProject = null;
                    document.getElementById('noProjectSelected').hidden = false;
                    document.getElementById('projectView').hidden = true;
                    document.getElementById('todoEmpty').hidden = false;
                    document.getElementById('todoContainer').hidden = true;
                }
            }

            console.log('Force refresh complete');
        } catch (err) {
            console.error('Force refresh failed:', err);
            alert('Failed to refresh from cloud: ' + err.message);
        }
    } else {
        // Just reload local data
        loadFromLocalStorage();
        renderProjectList();
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
}

// Update project status
async function updateProjectStatus(newStatus) {
    if (!currentProject) return;

    const projectName = currentProject.projectName;
    const now = new Date().toISOString();

    // Update the project in allProjects
    allProjects = allProjects.map(p => {
        if (p.projectName === projectName) {
            return {
                ...p,
                status: newStatus,
                _lastModified: now,
                _version: (p._version || 0) + 1
            };
        }
        return p;
    });

    // Update currentProject reference
    currentProject = allProjects.find(p => p.projectName === projectName);

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

    // Sync to cloud (non-blocking)
    syncToCloud();

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
    const data = {
        type: 'feedback',
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

    // Sync to cloud (non-blocking)
    syncToCloud();

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
    const now = new Date().toISOString();

    // Soft delete: mark projects with _deletedAt timestamp instead of removing
    allProjects = allProjects.map(p => {
        if (p.projectName === projectName) {
            return {
                ...p,
                _deletedAt: now,
                _lastModified: now,
                _version: (p._version || 0) + 1
            };
        }
        return p;
    });

    // Soft delete associated feedback
    allFeedback = allFeedback.map(f => {
        if (f.projectName === projectName) {
            return {
                ...f,
                _deletedAt: now,
                _lastModified: now,
                _version: (f._version || 0) + 1
            };
        }
        return f;
    });

    // Remove tasks and notes (these are local-only, so hard delete is fine)
    delete allTasks[projectName];
    delete allNotes[projectName];
    delete allChangesLog[projectName];

    // Save to localStorage (including soft-deleted items for sync)
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));
    localStorage.setItem('projectTasks', JSON.stringify(allTasks));
    localStorage.setItem('projectNotes', JSON.stringify(allNotes));
    localStorage.setItem('projectChangesLog', JSON.stringify(allChangesLog));

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

    // Sync to cloud
    await syncToCloud();

    // Re-render
    renderProjectList();

    // Hide modal
    hideDeleteModal();
}

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

// Cache settings
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let lastCloudFetch = 0;

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
    setupEventListeners();
    setupDeleteModal();
});

async function loadAllData() {
    // Load tasks, notes, and changes log from localStorage
    allTasks = JSON.parse(localStorage.getItem('projectTasks') || '{}');
    allNotes = JSON.parse(localStorage.getItem('projectNotes') || '{}');
    loadChangesLog();

    // Load projects and feedback from localStorage first
    loadFromLocalStorage();

    // Render immediately with local data
    renderProjectList();

    // Check if we need to fetch from cloud (cache expired or first load)
    const now = Date.now();
    const cachedTimestamp = parseInt(localStorage.getItem('projectCacheTimestamp') || '0');

    if (JSONBIN_BIN_ID && JSONBIN_API_KEY && (now - cachedTimestamp > CACHE_DURATION)) {
        console.log('Cache expired, fetching from cloud...');
        try {
            await syncFromCloud();
            localStorage.setItem('projectCacheTimestamp', now.toString());
            console.log('Cloud sync complete. Projects:', allProjects.length);
            renderProjectList();
        } catch (err) {
            console.log('Cloud sync failed, using local data:', err);
        }
    } else {
        console.log('Using cached data');
    }

    dataLoaded = true;
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

    const cloudData = {
        projects: allProjects,
        feedback: allFeedback,
        lastUpdated: new Date().toISOString()
    };

    try {
        await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(cloudData)
        });
        console.log('Synced to cloud successfully');
    } catch (error) {
        console.log('Cloud sync failed:', error);
    }
}

function mergeCloudData(cloudData) {
    // Simple merge: add any items from cloud that don't exist locally
    const localProjectNames = new Set(allProjects.map(p => p.projectName));
    const localFeedbackKeys = new Set(allFeedback.map(f => `${f.projectName}-${f.timestamp}`));

    // Add cloud projects not in local
    (cloudData.projects || []).forEach(project => {
        if (!localProjectNames.has(project.projectName)) {
            allProjects.push(project);
        }
    });

    // Add cloud feedback not in local
    (cloudData.feedback || []).forEach(feedback => {
        const key = `${feedback.projectName}-${feedback.timestamp}`;
        if (!localFeedbackKeys.has(key)) {
            allFeedback.push(feedback);
        }
    });

    // Save merged data locally
    const combined = [...allProjects, ...allFeedback];
    localStorage.setItem('projectReviewData', JSON.stringify(combined));
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshProjects')?.addEventListener('click', loadAllData);

    // Gallery navigation
    document.getElementById('pvPrevBtn')?.addEventListener('click', () => navigateGallery(-1));
    document.getElementById('pvNextBtn')?.addEventListener('click', () => navigateGallery(1));

    // Notes editing
    document.getElementById('editNotesBtn')?.addEventListener('click', startEditingNotes);
    document.getElementById('cancelNotesBtn')?.addEventListener('click', cancelEditingNotes);
    document.getElementById('saveNotesBtn')?.addEventListener('click', saveNotes);

    // Feedback form rating buttons
    document.querySelectorAll('.pv-rating-buttons').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => selectRating(group, btn));
        });
    });

    document.querySelectorAll('.pv-yesno-buttons').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => selectRating(group, btn));
        });
    });

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

    // Remove duplicate projects by projectName (keep first occurrence)
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
            <div class="sidebar-empty">
                <p>No projects yet</p>
                <a href="index.html">Create one</a>
            </div>
        `;
        return;
    }

    container.innerHTML = allProjects.map((project, index) => `
        <div class="sidebar-project-item ${currentProject?.projectName === project.projectName ? 'active' : ''}"
             data-index="${index}">
            <div class="sidebar-project-content">
                <div class="sidebar-project-name">${escapeHtml(project.projectName)}</div>
                <div class="sidebar-project-meta">
                    <span class="sidebar-project-type">${escapeHtml(project.projectType)}</span>
                    <span class="sidebar-project-creator">${escapeHtml(project.creator || 'Jason')}</span>
                </div>
            </div>
            <button class="sidebar-delete-btn" data-project="${escapeHtml(project.projectName)}" title="Delete project">&times;</button>
        </div>
    `).join('');

    // Add click listeners
    container.querySelectorAll('.sidebar-project-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't select if clicking delete button
            if (e.target.classList.contains('sidebar-delete-btn')) return;
            const index = parseInt(item.dataset.index);
            selectProject(allProjects[index]);
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

    // Debug: Log images data
    console.log('Project images:', project.images);
    console.log('Images count:', project.images ? project.images.length : 0);

    // Setup gallery
    setupGallery(project.images || []);
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
function selectRating(group, selectedBtn) {
    group.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
    selectedBtn.classList.add('selected');
}

function renderExistingFeedback() {
    const container = document.getElementById('pvExistingFeedback');
    const projectFeedback = allFeedback.filter(f => f.projectName === currentProject.projectName);

    if (projectFeedback.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = projectFeedback.map((f, index) => `
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
    `).join('');
}

function resetFeedbackForm() {
    const form = document.getElementById('workspaceFeedbackForm');
    form.reset();
    form.querySelectorAll('button.selected').forEach(btn => btn.classList.remove('selected'));
}

function submitFeedback(e) {
    e.preventDefault();

    // Get rating values
    const usefulness = document.querySelector('.pv-rating-buttons[data-name="usefulness"] button.selected')?.dataset.value;
    const wouldUse = document.querySelector('.pv-yesno-buttons[data-name="wouldUse"] button.selected')?.dataset.value;
    const priority = document.querySelector('.pv-yesno-buttons[data-name="priority"] button.selected')?.dataset.value;

    // Validate
    if (!usefulness || !wouldUse || !priority) {
        alert('Please answer all rating questions');
        return;
    }

    const form = e.target;
    const formData = new FormData(form);

    const user = getCurrentUser();
    const data = {
        type: 'feedback',
        timestamp: new Date().toISOString(),
        projectName: currentProject.projectName,
        author: user,
        usefulness,
        wouldUse,
        priority,
        whyUseful: formData.get('whyUseful') || '',
        whyNotUseful: formData.get('whyNotUseful') || ''
    };

    // Update local state
    allFeedback.push(data);

    // Save to localStorage
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    stored.push(data);
    localStorage.setItem('projectReviewData', JSON.stringify(stored));

    // Sync to cloud (non-blocking)
    syncToCloud();

    // Log the change
    logChange(currentProject.projectName, user, 'feedback', `Submitted feedback (Usefulness: ${data.usefulness}/5)`);

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

    // Remove from allProjects
    allProjects = allProjects.filter(p => p.projectName !== projectName);

    // Remove associated feedback
    allFeedback = allFeedback.filter(f => f.projectName !== projectName);

    // Remove tasks and notes
    delete allTasks[projectName];
    delete allNotes[projectName];
    delete allChangesLog[projectName];

    // Save to localStorage
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

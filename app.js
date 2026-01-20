// ==========================================
// PROJECT REVIEW - Main Application Script
// ==========================================

// ==========================================
// JSONBin.io Configuration (free JSON storage API)
// ==========================================
// HOW TO SET UP (if you get 403 errors):
// 1. Go to https://jsonbin.io and create a free account
// 2. Create a new bin (click "Create" button)
// 3. Copy the Bin ID from the URL (the long string after /b/)
// 4. Go to API Keys section and create/copy your Access Key
// 5. Replace the values below with your new credentials
//
// COST OPTIMIZATION:
// - Free tier: 10,000 lifetime requests
// - This app only syncs on explicit user actions (submit, refresh)
// - Images are NOT synced to cloud (localStorage only) to save bandwidth
// - With 2 users, this should last for years of normal use
// ==========================================
const JSONBIN_BIN_ID = '6970043cd0ea881f40793eef';
const JSONBIN_API_KEY = '$2a$10$bsKy2cxdAUQiImhqe5jl7.5b.xf/xuAl/lOqitoA90qU7pjt7jlWS';

// ==========================================
// Character Counter
// ==========================================
function setupCharCounter(inputId, countId, maxLength) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(countId);

    if (!input || !counter) return;

    const updateCount = () => {
        counter.textContent = input.value.length;
        if (input.value.length >= maxLength) {
            counter.style.color = '#ef4444';
        } else {
            counter.style.color = '';
        }
    };

    input.addEventListener('input', updateCount);
    updateCount();
}

// ==========================================
// File Upload Handler with Image Preview
// ==========================================
function setupFileUpload() {
    const uploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('attachments');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewCarousel = document.getElementById('imagePreviewCarousel');
    const previewNav = document.getElementById('imagePreviewNav');
    const previewCounter = document.getElementById('previewCounter');
    const prevBtn = document.getElementById('prevImageBtn');
    const nextBtn = document.getElementById('nextImageBtn');

    if (!uploadArea || !fileInput) return;

    let uploadedFiles = [];
    let currentPreviewIndex = 0;

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent)';
        uploadArea.style.background = 'var(--accent-dim)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
    });

    // Navigation buttons
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigatePreview(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigatePreview(1));
    }

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            if (uploadedFiles.length >= 5) {
                alert('Maximum 5 images allowed');
                return;
            }

            // Only allow images
            if (!file.type.startsWith('image/')) {
                alert(`File "${file.name}" is not an image.`);
                return;
            }

            // Check file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert(`File "${file.name}" is too large. Maximum size is 5MB.`);
                return;
            }

            uploadedFiles.push(file);
        });
        renderPreviews();
    }

    function renderPreviews() {
        if (!previewContainer || !previewCarousel) return;

        if (uploadedFiles.length === 0) {
            previewContainer.hidden = true;
            return;
        }

        previewContainer.hidden = false;

        // Build carousel HTML
        let carouselHTML = '';
        let thumbsHTML = '<div class="image-preview-thumbs">';

        uploadedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Add main image
                const img = previewCarousel.querySelector(`img[data-index="${index}"]`);
                if (img) {
                    img.src = e.target.result;
                }
                // Add thumbnail
                const thumb = previewContainer.querySelector(`.preview-thumb[data-index="${index}"] img`);
                if (thumb) {
                    thumb.src = e.target.result;
                }
            };
            reader.readAsDataURL(file);

            carouselHTML += `<img data-index="${index}" class="${index === currentPreviewIndex ? 'active' : ''}" alt="Preview ${index + 1}">`;
            thumbsHTML += `
                <div class="preview-thumb ${index === currentPreviewIndex ? 'active' : ''}" data-index="${index}">
                    <img alt="Thumb ${index + 1}">
                    <button type="button" class="remove-image" data-index="${index}">&times;</button>
                </div>
            `;
        });

        thumbsHTML += '</div>';

        previewCarousel.innerHTML = carouselHTML;

        // Add or update thumbs
        let thumbsContainer = previewContainer.querySelector('.image-preview-thumbs');
        if (thumbsContainer) {
            thumbsContainer.outerHTML = thumbsHTML;
        } else {
            previewContainer.insertAdjacentHTML('beforeend', thumbsHTML);
        }

        // Show/hide navigation
        if (previewNav) {
            previewNav.hidden = uploadedFiles.length <= 1;
        }
        updateCounter();

        // Add click handlers to thumbnails
        previewContainer.querySelectorAll('.preview-thumb').forEach(thumb => {
            thumb.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-image')) return;
                const index = parseInt(thumb.dataset.index);
                selectPreview(index);
            });
        });

        // Add click handlers to remove buttons
        previewContainer.querySelectorAll('.remove-image').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                removeFile(index);
            });
        });
    }

    function selectPreview(index) {
        currentPreviewIndex = index;

        // Update main images
        previewCarousel.querySelectorAll('img').forEach((img, i) => {
            img.classList.toggle('active', i === index);
        });

        // Update thumbnails
        previewContainer.querySelectorAll('.preview-thumb').forEach((thumb, i) => {
            thumb.classList.toggle('active', i === index);
        });

        updateCounter();
    }

    function navigatePreview(direction) {
        let newIndex = currentPreviewIndex + direction;
        if (newIndex < 0) newIndex = uploadedFiles.length - 1;
        if (newIndex >= uploadedFiles.length) newIndex = 0;
        selectPreview(newIndex);
    }

    function updateCounter() {
        if (previewCounter) {
            previewCounter.textContent = `${currentPreviewIndex + 1} / ${uploadedFiles.length}`;
        }
    }

    function removeFile(index) {
        uploadedFiles.splice(index, 1);
        if (currentPreviewIndex >= uploadedFiles.length) {
            currentPreviewIndex = Math.max(0, uploadedFiles.length - 1);
        }
        renderPreviews();
    }

    window.removeFile = removeFile;
    window.getUploadedFiles = () => uploadedFiles;
}

// ==========================================
// Project Submission Form
// ==========================================
function setupProjectForm() {
    const form = document.getElementById('projectForm');
    if (!form) return;

    setupCharCounter('summary', 'summaryCount', 150);
    setupFileUpload();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.btn-submit');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');

        // Show loading state
        btnText.hidden = true;
        btnLoading.hidden = false;
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const now = new Date().toISOString();

            // Parse tags from comma-separated string
            const tagsInput = formData.get('tags') || '';
            const tags = tagsInput.split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            const data = {
                type: 'project',
                timestamp: now,
                projectName: formData.get('projectName'),
                projectType: formData.get('projectType'),
                creator: formData.get('creator') || 'Jason',
                summary: formData.get('summary'),
                problem: formData.get('problem'),
                success: formData.get('success'),
                currentState: formData.get('currentState'),
                link: formData.get('link') || '',
                // New fields for categories/tags
                status: formData.get('status') || 'in_progress',
                tags: tags,
                // Version tracking fields
                _version: 1,
                _lastModified: now
            };

            // Convert images to base64 for storage
            const files = window.getUploadedFiles ? window.getUploadedFiles() : [];
            const imagePromises = files.map(file => {
                return new Promise((resolve) => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(file);
                    } else {
                        resolve(null);
                    }
                });
            });

            const imageDataUrls = await Promise.all(imagePromises);
            data.images = imageDataUrls.filter(url => url !== null);
            data.attachments = files.map(f => f.name).join(', ');

            // Debug: Log images being saved
            console.log('Files to upload:', files.length);
            console.log('Images saved:', data.images.length);

            await submitToStorage(data);

            // Show success message
            form.hidden = true;
            document.getElementById('successMessage').hidden = false;

        } catch (error) {
            console.error('Submission error:', error);
            alert('There was an error submitting your project. Please try again.');

            btnText.hidden = false;
            btnLoading.hidden = true;
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// Feedback Form (in review.js)
// ==========================================
function setupFeedbackForm() {
    const form = document.getElementById('feedbackForm');
    if (!form) return;

    setupCharCounter('bestThing', 'bestCount', 250);
    setupCharCounter('improve', 'improveCount', 250);
    setupCharCounter('useCase', 'useCaseCount', 250);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.btn-submit');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');

        btnText.hidden = true;
        btnLoading.hidden = false;
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const data = {
                type: 'feedback',
                timestamp: new Date().toISOString(),
                projectName: formData.get('projectSelect'),
                clarity: formData.get('clarity'),
                usefulness: formData.get('usefulness'),
                excitement: formData.get('excitement'),
                realProblem: formData.get('realProblem'),
                wouldUse: formData.get('wouldUse'),
                priority: formData.get('priority'),
                bestThing: formData.get('bestThing'),
                improve: formData.get('improve'),
                useCase: formData.get('useCase') || ''
            };

            await submitToStorage(data);

            form.hidden = true;
            document.getElementById('successMessage').hidden = false;

        } catch (error) {
            console.error('Submission error:', error);
            alert('There was an error submitting your feedback. Please try again.');

            btnText.hidden = false;
            btnLoading.hidden = true;
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// Data Storage (Local + Cloud Sync)
// ==========================================
async function submitToStorage(data) {
    console.log('submitToStorage called with:', data);

    // Always save locally first
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    console.log('Existing data in localStorage:', stored.length, 'items');

    stored.push(data);
    localStorage.setItem('projectReviewData', JSON.stringify(stored));

    console.log('Data saved! Total items now:', stored.length);
    console.log('Verification - reading back:', JSON.parse(localStorage.getItem('projectReviewData')).length, 'items');

    // If JSONBin is configured, sync to cloud
    if (JSONBIN_BIN_ID && JSONBIN_API_KEY) {
        await syncToCloud();
    }
}

async function syncToCloud() {
    if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
        console.log('JSONBin not configured - BIN_ID:', JSONBIN_BIN_ID, 'API_KEY exists:', !!JSONBIN_API_KEY);
        return;
    }

    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    const projects = stored.filter(item => item.type === 'project');
    const feedback = stored.filter(item => item.type === 'feedback');

    // Sync images to cloud - but they'll be cached locally after first download
    // This enables cross-device image sync while minimizing bandwidth
    const cloudData = {
        projects,
        feedback,
        lastUpdated: new Date().toISOString()
    };

    console.log('Syncing to cloud. Projects:', projects.length, 'Feedback:', feedback.length);

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(cloudData)
        });

        if (response.ok) {
            console.log('Synced to cloud successfully!');
        } else {
            const errorText = await response.text();
            console.error('Cloud sync failed with status:', response.status, errorText);
            // Log to console only - don't interrupt user with alerts
        }
    } catch (error) {
        console.error('Cloud sync error:', error);
        // Log to console only - don't interrupt user with alerts
    }
}

async function fetchProjects() {
    // Return locally stored projects
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    return stored.filter(item => item.type === 'project');
}

// ==========================================
// Sync from Cloud on Load
// ==========================================
async function syncFromCloud() {
    if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
        console.log('JSONBin not configured for fetch');
        return;
    }

    console.log('Fetching from cloud...');

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
            headers: { 'X-Access-Key': JSONBIN_API_KEY }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Cloud data received:', data);
            const cloudData = data.record || { projects: [], feedback: [] };

            // Cloud is the source of truth - replace local data
            const cloudProjects = cloudData.projects || [];
            const cloudFeedback = cloudData.feedback || [];

            console.log('Cloud has', cloudProjects.length, 'projects,', cloudFeedback.length, 'feedback');

            // Replace local data with cloud data
            const combined = [...cloudProjects, ...cloudFeedback];
            localStorage.setItem('projectReviewData', JSON.stringify(combined));
            console.log('Synced from cloud, total items:', combined.length);
        } else {
            const errorText = await response.text();
            console.error('Cloud fetch failed with status:', response.status, errorText);
        }
    } catch (error) {
        console.error('Cloud fetch error:', error);
    }
}

// ==========================================
// Clean up duplicate projects in localStorage
// ==========================================
function cleanupDuplicates() {
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');

    // Separate projects and feedback
    const projects = stored.filter(item => item.type === 'project');
    const feedback = stored.filter(item => item.type === 'feedback');

    // Remove duplicate projects (keep first occurrence)
    const uniqueProjects = [];
    const seenNames = new Set();
    projects.forEach(project => {
        if (!seenNames.has(project.projectName)) {
            seenNames.add(project.projectName);
            uniqueProjects.push(project);
        }
    });

    // Remove duplicate feedback (by projectName + timestamp)
    const uniqueFeedback = [];
    const seenFeedback = new Set();
    feedback.forEach(f => {
        const key = `${f.projectName}-${f.timestamp}`;
        if (!seenFeedback.has(key)) {
            seenFeedback.add(key);
            uniqueFeedback.push(f);
        }
    });

    // Only save if we actually removed duplicates
    const newTotal = uniqueProjects.length + uniqueFeedback.length;
    if (newTotal < stored.length) {
        console.log(`Cleaned up ${stored.length - newTotal} duplicate items`);
        const cleaned = [...uniqueProjects, ...uniqueFeedback];
        localStorage.setItem('projectReviewData', JSON.stringify(cleaned));
    }
}

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Clean up any duplicates first
    cleanupDuplicates();

    // DON'T auto-sync from cloud on page load - saves API requests
    // Users can click Refresh in workspace to get latest data
    // Only sync when submitting new data

    setupProjectForm();
    setupFeedbackForm();
});

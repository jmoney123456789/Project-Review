// ==========================================
// PROJECT REVIEW - Main Application Script
// ==========================================

// ==========================================
// Firebase Configuration
// ==========================================
// Firebase Realtime Database - replaces JSONBin for reliable cross-device sync
// Benefits:
// - Real-time sync (no refresh needed)
// - Works great on mobile
// - Generous free tier (1GB storage, 10GB bandwidth/month)
// - No server needed - works from GitHub Pages
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAI2H8QewQ_M7vmA-FtfXJq4N_brRydec8",
    authDomain: "project-review-fe0cc.firebaseapp.com",
    databaseURL: "https://project-review-fe0cc-default-rtdb.firebaseio.com",
    projectId: "project-review-fe0cc",
    storageBucket: "project-review-fe0cc.appspot.com",
    messagingSenderId: "496818003443",
    appId: "1:496818003443:web:8fde3dd33c3082dad70686"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const storage = firebase.storage();

// Safari ITP Detection and Warning
function checkSafariITP() {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
        console.log('Safari detected - checking for ITP issues...');

        // Check if localStorage is accessible (ITP can block this)
        try {
            localStorage.setItem('_test', '1');
            localStorage.removeItem('_test');
            console.log('✓ localStorage accessible');
        } catch (e) {
            console.error('✗ localStorage blocked by Safari ITP:', e);
            return false;
        }

        // Test Firebase connectivity
        database.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === true) {
                console.log('✓ Firebase connected');
            } else {
                console.warn('✗ Firebase connection issue - may be blocked by ITP');
            }
        });
    }
    return true;
}

// Run Safari checks on load
checkSafariITP();

// Legacy JSONBin variables (kept for reference during migration, will be removed)
const JSONBIN_BIN_ID = null;
const JSONBIN_API_KEY = null;

// ==========================================
// Image Compression Utility
// ==========================================
// Compresses images to reduce storage size while maintaining quality
// This allows storing 30-50 screenshots per project without hitting limits

const IMAGE_CONFIG = {
    maxWidth: 1920,      // Max width in pixels
    maxHeight: 1080,     // Max height in pixels
    quality: 0.8,        // JPEG quality (0.8 = 80%)
    maxFileSize: 5 * 1024 * 1024,  // 5MB max per original file
    maxImages: 50        // Max images per project
};

/**
 * Compress an image file to reduce storage size
 * @param {File} file - The image file to compress
 * @returns {Promise<string>} - Base64 data URL of compressed image
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        console.log(`Compressing image: ${file.name} (${Math.round(file.size/1024)}KB)`);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();

            // Safari-specific: Set crossOrigin before setting src for local files
            // This prevents tainting issues in Safari
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    // Calculate new dimensions maintaining aspect ratio
                    let { width, height } = img;

                    if (width > IMAGE_CONFIG.maxWidth) {
                        height = (height * IMAGE_CONFIG.maxWidth) / width;
                        width = IMAGE_CONFIG.maxWidth;
                    }
                    if (height > IMAGE_CONFIG.maxHeight) {
                        width = (width * IMAGE_CONFIG.maxHeight) / height;
                        height = IMAGE_CONFIG.maxHeight;
                    }

                    // Create canvas and draw resized image
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d', { willReadFrequently: false });
                    if (!ctx) {
                        throw new Error('Failed to get canvas context');
                    }

                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to compressed JPEG
                    // Safari fix: Wrap toDataURL in try-catch for security errors
                    let compressedDataUrl;
                    try {
                        compressedDataUrl = canvas.toDataURL('image/jpeg', IMAGE_CONFIG.quality);
                    } catch (canvasError) {
                        console.error('Canvas toDataURL failed:', canvasError);
                        throw new Error(`Canvas conversion failed: ${canvasError.message}`);
                    }

                    // Log compression results
                    const originalSize = e.target.result.length;
                    const compressedSize = compressedDataUrl.length;
                    const savings = Math.round((1 - compressedSize / originalSize) * 100);
                    console.log(`Image compressed: ${Math.round(originalSize/1024)}KB → ${Math.round(compressedSize/1024)}KB (${savings}% smaller)`);

                    resolve(compressedDataUrl);
                } catch (error) {
                    console.error('Image compression error:', error);
                    reject(error);
                }
            };

            img.onerror = (error) => {
                console.error('Image load error:', error);
                reject(new Error(`Failed to load image: ${file.name}`));
            };

            img.src = e.target.result;
        };

        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            reject(new Error(`Failed to read file: ${file.name}`));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Compress an image file to a Blob (for Firebase Storage upload)
 * @param {File} file - The image file to compress
 * @returns {Promise<Blob>} - Blob of compressed image
 */
async function compressImageToBlob(file) {
    return new Promise((resolve, reject) => {
        console.log(`Compressing image to blob: ${file.name} (${Math.round(file.size/1024)}KB)`);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();

            // Safari-specific: Set crossOrigin before setting src for local files
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    // Calculate new dimensions maintaining aspect ratio
                    let { width, height } = img;

                    if (width > IMAGE_CONFIG.maxWidth) {
                        height = (height * IMAGE_CONFIG.maxWidth) / width;
                        width = IMAGE_CONFIG.maxWidth;
                    }
                    if (height > IMAGE_CONFIG.maxHeight) {
                        width = (width * IMAGE_CONFIG.maxHeight) / height;
                        height = IMAGE_CONFIG.maxHeight;
                    }

                    // Create canvas and draw resized image
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d', { willReadFrequently: false });
                    if (!ctx) {
                        throw new Error('Failed to get canvas context');
                    }

                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to compressed JPEG Blob
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create blob from canvas'));
                            return;
                        }

                        // Log compression results
                        const originalSize = file.size;
                        const compressedSize = blob.size;
                        const savings = Math.round((1 - compressedSize / originalSize) * 100);
                        console.log(`Image compressed to blob: ${Math.round(originalSize/1024)}KB → ${Math.round(compressedSize/1024)}KB (${savings}% smaller)`);

                        resolve(blob);
                    }, 'image/jpeg', IMAGE_CONFIG.quality);
                } catch (error) {
                    console.error('Image compression error:', error);
                    reject(error);
                }
            };

            img.onerror = (error) => {
                console.error('Image load error:', error);
                reject(new Error(`Failed to load image: ${file.name}`));
            };

            img.src = e.target.result;
        };

        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            reject(new Error(`Failed to read file: ${file.name}`));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Upload an image blob to Firebase Storage
 * @param {Blob} blob - The image blob to upload
 * @param {string} projectName - The project name (used for folder organization)
 * @param {string} imageName - The unique image filename
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
async function uploadImageToStorage(blob, projectName, imageName) {
    try {
        console.log(`📤 Uploading image to Firebase Storage: ${imageName}`);
        console.log(`Blob size: ${Math.round(blob.size / 1024)}KB`);

        // Check if storage is initialized
        if (!storage) {
            throw new Error('Firebase Storage not initialized');
        }

        // Create storage path: projects/{sanitizedProjectName}/images/{imageName}.jpg
        const sanitizedName = sanitizeFirebaseKey(projectName);
        const storagePath = `projects/${sanitizedName}/images/${imageName}.jpg`;
        console.log(`Storage path: ${storagePath}`);

        // Create reference and upload
        const storageRef = storage.ref(storagePath);

        // Add metadata
        const metadata = {
            contentType: 'image/jpeg',
            customMetadata: {
                projectName: projectName,
                uploadedAt: new Date().toISOString()
            }
        };

        console.log('Starting upload...');
        // Upload blob
        const uploadTask = await storageRef.put(blob, metadata);
        console.log('Upload complete, getting download URL...');

        // Get download URL
        const downloadURL = await uploadTask.ref.getDownloadURL();

        console.log(`✓ Image uploaded successfully!`);
        console.log(`Download URL: ${downloadURL}`);
        return downloadURL;
    } catch (error) {
        console.error('=== STORAGE UPLOAD ERROR ===');
        console.error('Error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));

        // Provide helpful error messages
        if (error.code === 'storage/unauthorized') {
            throw new Error('Firebase Storage permission denied. Please check Storage security rules.');
        } else if (error.code === 'storage/unauthenticated') {
            throw new Error('Firebase Storage requires authentication. Please enable anonymous auth.');
        } else if (error.code === 'storage/retry-limit-exceeded') {
            throw new Error('Upload failed after multiple retries. Check your internet connection.');
        } else {
            throw new Error(`Failed to upload image: ${error.message || error.code || 'Unknown error'}`);
        }
    }
}

/**
 * Compress multiple image files
 * @param {File[]} files - Array of image files
 * @returns {Promise<string[]>} - Array of base64 data URLs
 */
async function compressImages(files) {
    const promises = files.map(file => {
        if (file.type.startsWith('image/')) {
            return compressImage(file).catch(err => {
                console.error('Compression failed for', file.name, err);
                return null;
            });
        }
        return Promise.resolve(null);
    });

    const results = await Promise.all(promises);
    return results.filter(url => url !== null);
}

// Make compression functions globally available
window.compressImage = compressImage;
window.compressImages = compressImages;
window.compressImageToBlob = compressImageToBlob;
window.uploadImageToStorage = uploadImageToStorage;
window.IMAGE_CONFIG = IMAGE_CONFIG;

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
            if (uploadedFiles.length >= IMAGE_CONFIG.maxImages) {
                alert(`Maximum ${IMAGE_CONFIG.maxImages} images allowed`);
                return;
            }

            // Only allow images
            if (!file.type.startsWith('image/')) {
                alert(`File "${file.name}" is not an image.`);
                return;
            }

            // Check file size (max 5MB before compression)
            if (file.size > IMAGE_CONFIG.maxFileSize) {
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

            // Process images - using base64 for now (Storage has CORS issues)
            const files = window.getUploadedFiles ? window.getUploadedFiles() : [];
            if (files.length > 0) {
                // Limit to 3 images to avoid localStorage quota
                const filesToProcess = files.slice(0, 3);
                if (files.length > 3) {
                    alert(`Limited to 3 images on submission. Add more in workspace after submitting.`);
                }

                console.log('Processing', filesToProcess.length, 'images...');

                try {
                    // Use base64 compression (fast and works)
                    const base64Images = await compressImages(filesToProcess);

                    // Convert to metadata format
                    data.images = base64Images.map((base64, index) => ({
                        src: base64,
                        note: '',
                        uploadedAt: new Date().toISOString(),
                        filename: filesToProcess[index].name
                    }));

                    console.log('✓ Processed', data.images.length, 'images');
                    data.attachments = filesToProcess.map(f => f.name).join(', ');

                } catch (error) {
                    console.error('Image processing failed:', error);
                    throw new Error(`Image processing failed: ${error.message}`);
                }
            } else {
                data.images = [];
                data.attachments = '';
            }

            // Debug: Log images being saved
            console.log('Files to upload:', files.length);
            console.log('Images saved:', data.images.length);

            await submitToStorage(data);

            // Show success message
            form.hidden = true;
            document.getElementById('successMessage').hidden = false;

        } catch (error) {
            console.error('=== SUBMISSION ERROR ===');
            console.error('Error:', error);
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Error code:', error.code);
            console.error('Full error object:', JSON.stringify(error, null, 2));

            // Show detailed error to user
            let errorMsg = error.message || 'Unknown error';
            if (error.code) {
                errorMsg = `${error.code}: ${errorMsg}`;
            }
            alert(`Error submitting project:\n\n${errorMsg}\n\nSee console for details (F12)`);

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
// Data Storage (Local + Firebase Sync)
// ==========================================
async function submitToStorage(data) {
    console.log('submitToStorage called with:', data);

    // Generate a unique ID for the item if it doesn't have one
    if (!data.id) {
        data.id = generateId();
    }

    // Save ONLY to Firebase - no localStorage to avoid quota issues
    console.log('Saving to Firebase...');
    await syncToFirebase(data);
    console.log('✓ Successfully saved to Firebase!');
}

// Generate a unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Sync a single item to Firebase
async function syncToFirebase(data) {
    try {
        console.log('Starting Firebase sync...');
        const itemType = data.type === 'project' ? 'projects' : 'feedback';
        const itemId = data.id || generateId();

        // Use projectName as key for projects (allows easy lookup/update)
        const key = data.type === 'project'
            ? sanitizeFirebaseKey(data.projectName)
            : itemId;

        console.log('Firebase path:', `${itemType}/${key}`);
        console.log('Data size:', JSON.stringify(data).length, 'characters');

        await database.ref(`${itemType}/${key}`).set({
            ...data,
            id: itemId,
            _lastModified: new Date().toISOString()
        });

        console.log(`✓ Synced ${data.type} to Firebase:`, key);
    } catch (error) {
        console.error('Firebase sync error:', error);
        console.error('Error details:', error.name, error.message);
        throw new Error(`Firebase sync failed: ${error.message}`);
    }
}

// Sync all data to Firebase (full sync)
async function syncAllToFirebase() {
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    const projects = stored.filter(item => item.type === 'project' && !item._deletedAt);
    const feedback = stored.filter(item => item.type === 'feedback' && !item._deletedAt);

    console.log('Full sync to Firebase. Projects:', projects.length, 'Feedback:', feedback.length);

    try {
        // Prepare data for Firebase
        const projectsObj = {};
        projects.forEach(p => {
            const key = sanitizeFirebaseKey(p.projectName);
            projectsObj[key] = { ...p, id: p.id || generateId() };
        });

        const feedbackObj = {};
        feedback.forEach(f => {
            const key = f.id || generateId();
            feedbackObj[key] = { ...f, id: key };
        });

        // Write to Firebase
        await database.ref('/').set({
            projects: projectsObj,
            feedback: feedbackObj,
            lastUpdated: new Date().toISOString()
        });

        console.log('Full sync to Firebase completed!');
    } catch (error) {
        console.error('Firebase full sync error:', error);
    }
}

// Sanitize keys for Firebase (no ., #, $, [, ])
function sanitizeFirebaseKey(key) {
    return key.replace(/[.#$\[\]]/g, '_');
}

async function fetchProjects() {
    // Return locally stored projects
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    return stored.filter(item => item.type === 'project');
}

// ==========================================
// Sync from Firebase on Load
// ==========================================
async function syncFromFirebase() {
    console.log('Fetching from Firebase...');

    try {
        const snapshot = await database.ref('/').once('value');
        const data = snapshot.val() || { projects: {}, feedback: {} };

        // Convert objects to arrays
        const projects = data.projects ? Object.values(data.projects).filter(p => !p._deletedAt) : [];
        const feedback = data.feedback ? Object.values(data.feedback).filter(f => !f._deletedAt) : [];

        console.log('✓ Fetched from Firebase:', projects.length, 'projects,', feedback.length, 'feedback');

        // Don't save to localStorage - just return the data
        // Firebase is the source of truth, we fetch directly each time
        return { projects, feedback };
    } catch (error) {
        console.error('Firebase fetch error:', error);
        return null;
    }
}

// Legacy function - now uses Firebase
async function syncFromCloud() {
    return syncFromFirebase();
}

// Legacy function - now uses Firebase
async function syncToCloud() {
    return syncAllToFirebase();
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
    console.log('=== App Initializing ===');

    // FIREBASE IS SOURCE OF TRUTH - fetch latest on page load
    console.log('Fetching latest data from Firebase...');
    try {
        await syncFromFirebase();
        console.log('✓ Synced from Firebase successfully');
    } catch (err) {
        console.error('✗ Firebase sync failed:', err);
    }

    setupProjectForm();
    setupFeedbackForm();

    console.log('=== App Ready ===');
});

// Helper: Clear all local data and resync from Firebase (for debugging sync issues)
window.resetAndResync = async function() {
    console.log('Clearing all local data...');
    localStorage.removeItem('projectReviewData');
    localStorage.removeItem('projectImageCache');
    localStorage.removeItem('projectCacheTimestamp');
    console.log('Local data cleared. Refreshing page...');
    location.reload();
};

// Helper: Migrate existing JSONBin data to Firebase
// Call this ONCE from browser console: migrateToFirebase()
window.migrateToFirebase = async function() {
    console.log('Starting migration to Firebase...');

    // Get existing data from localStorage
    const stored = JSON.parse(localStorage.getItem('projectReviewData') || '[]');
    const projects = stored.filter(item => item.type === 'project' && !item._deletedAt);
    const feedback = stored.filter(item => item.type === 'feedback' && !item._deletedAt);

    console.log('Found', projects.length, 'projects and', feedback.length, 'feedback items to migrate');

    if (projects.length === 0 && feedback.length === 0) {
        console.log('No data to migrate!');
        return;
    }

    try {
        // Prepare data for Firebase
        const projectsObj = {};
        projects.forEach(p => {
            const key = sanitizeFirebaseKey(p.projectName);
            projectsObj[key] = {
                ...p,
                id: p.id || generateId(),
                _lastModified: p._lastModified || p.timestamp || new Date().toISOString()
            };
        });

        const feedbackObj = {};
        feedback.forEach(f => {
            const key = f.id || generateId();
            feedbackObj[key] = {
                ...f,
                id: key,
                _lastModified: f._lastModified || f.timestamp || new Date().toISOString()
            };
        });

        // Write to Firebase
        await database.ref('/').set({
            projects: projectsObj,
            feedback: feedbackObj,
            lastUpdated: new Date().toISOString()
        });

        console.log('Migration complete!');
        console.log('Migrated', Object.keys(projectsObj).length, 'projects');
        console.log('Migrated', Object.keys(feedbackObj).length, 'feedback items');
        console.log('Refresh the page to verify.');

    } catch (error) {
        console.error('Migration failed:', error);
    }
};

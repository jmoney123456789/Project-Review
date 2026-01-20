// ==========================================
// PROJECT REVIEW - Review Page Script
// ==========================================

let currentProject = null;
let currentImageIndex = 0;

// ==========================================
// Load Projects for Selection
// ==========================================
async function loadProjectsDropdown() {
    const select = document.getElementById('projectSelect');
    if (!select) return;

    try {
        const projects = await fetchProjects();

        if (projects.length === 0) {
            select.innerHTML = '<option value="">No projects submitted yet</option>';
            return;
        }

        // Store projects globally for easy access
        window.projectsData = projects;

        select.innerHTML = '<option value="">Select a project to review...</option>' +
            projects.map((project, index) =>
                `<option value="${index}">${escapeHtml(project.projectName)}</option>`
            ).join('');

        // Setup change handler
        select.addEventListener('change', handleProjectSelect);

    } catch (error) {
        console.error('Error loading projects:', error);
        select.innerHTML = '<option value="">Error loading projects</option>';
    }
}

// ==========================================
// Handle Project Selection
// ==========================================
function handleProjectSelect(e) {
    const select = e.target;
    const index = select.value;

    const showcase = document.getElementById('projectShowcase');
    const feedbackForm = document.getElementById('feedbackForm');

    if (index === '') {
        showcase.hidden = true;
        feedbackForm.hidden = true;
        currentProject = null;
        return;
    }

    currentProject = window.projectsData[parseInt(index)];
    currentImageIndex = 0;

    // Populate project details
    populateProjectDetails(currentProject);

    // Setup image gallery
    setupImageGallery(currentProject.images || []);

    // Show showcase and form
    showcase.hidden = false;
    feedbackForm.hidden = false;

    // Scroll to showcase
    showcase.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==========================================
// Populate Project Details
// ==========================================
function populateProjectDetails(project) {
    document.getElementById('detailName').textContent = project.projectName || 'Untitled Project';
    document.getElementById('detailType').textContent = project.projectType || 'Project';
    document.getElementById('detailSummary').textContent = project.summary || 'No summary provided';
    document.getElementById('detailState').textContent = project.currentState || 'Unknown';

    // Link
    const linkContainer = document.getElementById('linkContainer');
    const linkEl = document.getElementById('detailLink');
    if (project.link) {
        linkEl.href = project.link;
        linkContainer.hidden = false;
    } else {
        linkContainer.hidden = true;
    }

    // Expandable details
    document.getElementById('detailProblem').textContent = project.problem || '-';
    document.getElementById('detailAudience').textContent = project.audience || '-';
    document.getElementById('detailSuccess').textContent = project.success || '-';
}

// ==========================================
// Image Gallery
// ==========================================
function setupImageGallery(images) {
    const mainImage = document.getElementById('mainImage');
    const thumbnailsContainer = document.getElementById('thumbnails');
    const noImages = document.getElementById('noImages');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // Clear thumbnails
    thumbnailsContainer.innerHTML = '';

    if (!images || images.length === 0) {
        // No images
        mainImage.style.display = 'none';
        noImages.style.display = 'block';
        prevBtn.hidden = true;
        nextBtn.hidden = true;
        return;
    }

    // Has images
    mainImage.style.display = 'block';
    noImages.style.display = 'none';

    // Set first image
    mainImage.src = images[0];
    currentImageIndex = 0;

    // Show/hide nav buttons
    if (images.length > 1) {
        prevBtn.hidden = false;
        nextBtn.hidden = false;

        // Create thumbnails
        images.forEach((imgSrc, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail' + (index === 0 ? ' active' : '');
            thumb.innerHTML = `<img src="${imgSrc}" alt="Screenshot ${index + 1}">`;
            thumb.addEventListener('click', () => selectImage(index, images));
            thumbnailsContainer.appendChild(thumb);
        });
    } else {
        prevBtn.hidden = true;
        nextBtn.hidden = true;
    }
}

function selectImage(index, images) {
    if (!images || index < 0 || index >= images.length) return;

    currentImageIndex = index;
    const mainImage = document.getElementById('mainImage');
    mainImage.src = images[index];

    // Update active thumbnail
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });
}

function navigateGallery(direction) {
    if (!currentProject || !currentProject.images) return;

    const images = currentProject.images;
    let newIndex = currentImageIndex + direction;

    // Loop around
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;

    selectImage(newIndex, images);
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

// ==========================================
// Initialize Review Page
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadProjectsDropdown();

    // Setup gallery navigation
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (prevBtn) prevBtn.addEventListener('click', () => navigateGallery(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateGallery(1));

    // Keyboard navigation for gallery
    document.addEventListener('keydown', (e) => {
        if (!currentProject || !currentProject.images || currentProject.images.length <= 1) return;

        if (e.key === 'ArrowLeft') {
            navigateGallery(-1);
        } else if (e.key === 'ArrowRight') {
            navigateGallery(1);
        }
    });
});

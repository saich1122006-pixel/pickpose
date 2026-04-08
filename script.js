import { db, auth, analytics, logEvent } from './firebase-config.js';
import { collection, getDocs, getDoc, setDoc, doc, addDoc, query, where, updateDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// No default poses — all content managed via admin panel
const defaultPosesData = [];

const GENDER_ENABLED_KEY = 'pickpose_gender_enabled';

// Global app state
let posesData = [];
let activeCategory = 'all';
let activeGender = 'all';
let searchQuery = '';
let favoritePoseIds = [];
let activePoseContext = null;
let activeDifficulty = 'all';
let currentFilteredPoses = [];
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let currentOnboardingSlide = 0;
let categoryPriority = [];

// PWA Install Prompt Variable
let deferredPrompt;

// ============================================================
// FIX: latestBroadcastData moved to MODULE SCOPE
// so setupAuth() and initPickpose() can both access it
// ============================================================
let latestBroadcastData = null;

// ============================================================
// FIX: showWhatsNewModal moved to MODULE SCOPE
// so setupAuth() can call it after redirect login success
// ============================================================
function showWhatsNewModal(message, version) {
    const modal = document.getElementById('whatsNewModal');
    const content = document.getElementById('whatsNewContent');
    const btn = document.getElementById('closeWhatsNew');

    if (modal && content && btn) {
        content.innerHTML = message.replace(/\n/g, '<br>');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        btn.onclick = () => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            if (version) {
                localStorage.setItem('pickpose_last_version', version);
                logEvent(analytics, 'whats_new_dismissed', { version: version });

                const badge = document.getElementById('notificationsBadge');
                const bell = document.getElementById('notificationsBellIcon');
                if (badge) badge.classList.add('hidden');
                if (bell) bell.style.color = '#a1a1aa';
            }
        };
    }
}

// Helper: Trigger subtle vibration on mobile devices
function triggerHaptic(duration = 15) {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(duration);
    }
}

async function toggleFavorite(poseDocId) {
    if (!isLoggedIn()) {
        document.getElementById('authModal').classList.remove('hidden');
        return false;
    }

    const uid = auth.currentUser.uid;
    const idx = favoritePoseIds.indexOf(poseDocId);

    if (idx > -1) {
        favoritePoseIds.splice(idx, 1);
        triggerHaptic(10);
    } else {
        favoritePoseIds.push(poseDocId);
        triggerHaptic(20);
    }

    try {
        const favRef = doc(db, "user_favorites", uid);
        await setDoc(favRef, { poses: favoritePoseIds });
        filterCards();
    } catch (err) {
        console.error("Failed to save favorite:", err);
    }
    return true;
}

async function loadPosesData() {
    const grid = document.getElementById('posesGrid');
    if (grid) {
        grid.innerHTML = '';
        for (let i = 0; i < 12; i++) {
            const skel = document.createElement('div');
            skel.className = 'skeleton-card';
            skel.innerHTML = `
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-footer">
                    <div class="skeleton-text skeleton"></div>
                </div>
            `;
            grid.appendChild(skel);
        }
    }

    let poses = [];
    try {
        const querySnapshot = await getDocs(collection(db, "poses"));
        querySnapshot.forEach((doc) => {
            poses.push({ docId: doc.id, ...doc.data() });
        });

        if (poses.length === 0) {
            console.log("Database empty. Seeding defaults...");
            for (const p of defaultPosesData) {
                await addDoc(collection(db, "poses"), p);
                poses.push(p);
            }
        }
    } catch (error) {
        console.error("Firestore Error:", error);
        alert("Database connection failed. Please ensure Firebase Firestore is enabled in your project console! Error: " + error.message);
    }

    for (let i = poses.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [poses[i], poses[j]] = [poses[j], poses[i]];
    }
    return poses;
}

async function initPickpose() {
    const grid = document.getElementById('posesGrid');
    const searchInput = document.getElementById('searchInput');
    const filterContainer = document.getElementById('filterContainer');
    const genderFilterWrapper = document.getElementById('genderFilterWrapper');

    setupAuth();
    initOnboarding();

    // --- INCREMENT VISIT COUNTER ---
    try {
        const statsRef = doc(db, "stats", "global");
        await updateDoc(statsRef, { views: increment(1) });
    } catch (e) {
        if (e.code === 'not-found') {
            await setDoc(doc(db, "stats", "global"), { views: 1, installs: 0 });
        }
    }

    // --- BROADCAST / UPDATES (Real-time) ---
    function setupBroadcastListener() {
        const broadcastRef = doc(db, "app_metadata", "broadcast");
        const notificationsBtn = document.getElementById('notificationsBtn');
        const notificationsBadge = document.getElementById('notificationsBadge');
        const notificationsBellIcon = document.getElementById('notificationsBellIcon');

        onSnapshot(broadcastRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (!data.version || !data.message) return;

                // FIX: latestBroadcastData is now module-scoped, visible everywhere
                latestBroadcastData = data;
                const lastSeenVersion = localStorage.getItem('pickpose_last_version');

                if (notificationsBtn) {
                    notificationsBtn.classList.remove('hidden');
                }

                if (data.version !== lastSeenVersion) {
                    if (notificationsBadge) notificationsBadge.classList.remove('hidden');
                    if (notificationsBellIcon) notificationsBellIcon.style.color = '#fff';

                    if (auth.currentUser) {
                        showWhatsNewModal(data.message, data.version);
                    }
                } else {
                    if (notificationsBadge) notificationsBadge.classList.add('hidden');
                    if (notificationsBellIcon) notificationsBellIcon.style.color = '#a1a1aa';
                }
            }
        });

        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (latestBroadcastData) {
                    showWhatsNewModal(latestBroadcastData.message, latestBroadcastData.version);
                } else {
                    showWhatsNewModal("No new announcements right now! Stay tuned.", null);
                }
            });
        } else {
            console.error("Pickpose: notificationsBtn NOT FOUND in DOM");
        }
    }

    setupBroadcastListener();

    // Initial load check
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const catRef = doc(db, "app_metadata", "categories");
            const catSnap = await getDoc(catRef);
            if (catSnap.exists()) {
                categoryPriority = catSnap.data().priorityOrder || [];
                if (posesData.length > 0) {
                    const filterContainer = document.getElementById('filterContainer');
                    const searchInput = document.getElementById('searchInput');
                    buildFilterButtons(posesData, filterContainer, searchInput);
                }
            }
        } catch (err) {
            console.error("Failed to load categories priority:", err);
        }

        const tourComplete = localStorage.getItem('pickpose_tour_complete');
        if (!tourComplete) {
            setTimeout(() => {
                if (document.getElementById('onboardingContainer').classList.contains('hidden')) {
                    startFeatureTour();
                }
            }, 1000);
        }
    });

    document.getElementById('btnReplayTour')?.addEventListener('click', () => {
        const profileDrawer = document.getElementById('profileDrawer');
        if (profileDrawer) profileDrawer.classList.add('hidden');
        startFeatureTour();
    });

    // Load data from Firebase
    posesData = await loadPosesData();

    if (grid) {
        renderGrid(posesData, grid);
        buildFilterButtons(posesData, filterContainer, searchInput);

        const btnCloseDrawer = document.getElementById('btnCloseDrawer');
        const filterDrawer = document.getElementById('filterDrawer');
        const btnApplyFilters = document.getElementById('btnApplyFilters');
        const btnClearAllFilters = document.getElementById('btnClearAllFilters');

        if (btnCloseDrawer && filterDrawer) {
            btnCloseDrawer.addEventListener('click', () => {
                filterDrawer.classList.add('hidden');
            });
        }

        if (btnApplyFilters && filterDrawer) {
            btnApplyFilters.addEventListener('click', () => {
                filterDrawer.classList.add('hidden');
                filterCards();
            });
        }

        if (btnClearAllFilters) {
            btnClearAllFilters.addEventListener('click', () => {
                const genderBtns = document.querySelectorAll('#genderFilterContainer .filter-btn');
                genderBtns.forEach(b => b.classList.remove('active'));
                const allGender = document.querySelector('#genderFilterContainer [data-gender="all"]');
                if (allGender) allGender.classList.add('active');
                activeGender = 'all';

                const diffBtns = document.querySelectorAll('#difficultyFilterContainer .filter-btn');
                diffBtns.forEach(b => b.classList.remove('active'));
                const allDiff = document.querySelector('#difficultyFilterContainer [data-difficulty="all"]');
                if (allDiff) allDiff.classList.add('active');
                activeDifficulty = 'all';

                filterCards();
            });
        }

        const genderBtns = document.querySelectorAll('#genderFilterContainer .filter-btn');
        genderBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.filter-btn');
                genderBtns.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                activeGender = target.dataset.gender;
                filterCards();
            });
        });

        const diffBtns = document.querySelectorAll('#difficultyFilterContainer .filter-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.filter-btn');
                diffBtns.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                activeDifficulty = target.dataset.difficulty;
                filterCards();
            });
        });

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            filterCards();
        });

        const btnAbout = document.getElementById('btnAbout');
        const btnContact = document.getElementById('btnContact');
        const aboutOverlay = document.getElementById('aboutOverlay');
        const contactOverlay = document.getElementById('contactOverlay');
        const closeAbout = document.getElementById('closeAbout');
        const closeContact = document.getElementById('closeContact');
        const contactForm = document.getElementById('contactForm');
        const contactSuccessMsg = document.getElementById('contactSuccessMsg');

        if (btnAbout && aboutOverlay) {
            btnAbout.addEventListener('click', () => {
                aboutOverlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            });
        }

        if (closeAbout && aboutOverlay) {
            closeAbout.addEventListener('click', () => {
                aboutOverlay.classList.add('hidden');
                document.body.style.overflow = '';
            });
        }

        if (btnContact && contactOverlay) {
            btnContact.addEventListener('click', () => {
                contactOverlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            });
        }

        if (closeContact && contactOverlay) {
            closeContact.addEventListener('click', () => {
                contactOverlay.classList.add('hidden');
                document.body.style.overflow = '';
                if (contactForm) contactForm.reset();
                if (contactSuccessMsg) contactSuccessMsg.classList.add('hidden');
            });
        }

        if (contactForm) {
            contactForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const btnSubmit = document.getElementById('btnSubmitContact');
                const btnText = btnSubmit.querySelector('.btn-text');

                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    if (btnText) btnText.textContent = 'Sending...';
                }

                try {
                    const msgData = {
                        name: document.getElementById('contactName').value,
                        email: document.getElementById('contactEmail').value,
                        message: document.getElementById('contactMessage').value,
                        timestamp: new Date(),
                        status: 'unread'
                    };

                    await addDoc(collection(db, "contact_messages"), msgData);

                    if (btnSubmit) btnSubmit.classList.add('hidden');
                    if (contactSuccessMsg) contactSuccessMsg.classList.remove('hidden');
                    triggerHaptic(20);

                } catch (err) {
                    console.error("Contact failed:", err);
                    alert("Message failed to send. Check your connection.");
                    if (btnSubmit) {
                        btnSubmit.disabled = false;
                        if (btnText) btnText.textContent = 'Send Message';
                    }
                }
            });
        }

        // --- SUBMIT POSE MODAL ---
        const btnSubmitPose = document.getElementById('btnSubmitPose');
        const btnSubmitPoseMobile = document.getElementById('btnSubmitPoseMobile');
        const submitPoseModal = document.getElementById('submitPoseModal');
        const closeSubmitPoseModal = document.getElementById('closeSubmitPoseModal');
        const submitPoseModalBg = document.getElementById('submitPoseModalBg');
        const submitPoseForm = document.getElementById('submitPoseForm');
        const submitPoseSuccessMsg = document.getElementById('submitPoseSuccessMsg');

        const btnUserTabFile = document.getElementById('btnUserTabFile');
        const btnUserTabUrl = document.getElementById('btnUserTabUrl');
        const userSourceFileArea = document.getElementById('userSourceFileArea');
        const userSourceUrlArea = document.getElementById('userSourceUrlArea');
        const userPoseDropZone = document.getElementById('userPoseDropZone');
        const userPoseFileInput = document.getElementById('userPoseFileInput');
        const userPosePreviewGrid = document.getElementById('userPosePreviewGrid');

        let userUploadedImageData = null;

        if (btnSubmitPose && submitPoseModal) {
            btnSubmitPose.addEventListener('click', () => {
                if (!isLoggedIn()) {
                    window.openAuthModal('authModeSelection');
                    return;
                }
                submitPoseModal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            });
        }

        if (btnSubmitPoseMobile && submitPoseModal) {
            btnSubmitPoseMobile.addEventListener('click', () => {
                if (!isLoggedIn()) {
                    window.openAuthModal('authModeSelection');
                    return;
                }
                submitPoseModal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            });
        }

        const closeSubmitModal = () => {
            submitPoseModal.classList.add('hidden');
            document.body.style.overflow = '';
            if (submitPoseForm) submitPoseForm.reset();
            if (submitPoseSuccessMsg) submitPoseSuccessMsg.classList.add('hidden');
            userUploadedImageData = null;
            if (userPosePreviewGrid) userPosePreviewGrid.innerHTML = '';
            userPosePreviewGrid?.classList.add('hidden');
            userSourceFileArea?.classList.remove('hidden');
            userSourceUrlArea?.classList.add('hidden');
            btnUserTabFile?.classList.add('active');
            btnUserTabUrl?.classList.remove('active');
        };

        if (closeSubmitPoseModal) closeSubmitPoseModal.addEventListener('click', closeSubmitModal);
        if (submitPoseModalBg) submitPoseModalBg.addEventListener('click', closeSubmitModal);

        btnUserTabFile?.addEventListener('click', () => {
            userSourceFileArea.classList.remove('hidden');
            userSourceUrlArea.classList.add('hidden');
            btnUserTabFile.classList.add('active');
            btnUserTabFile.style.opacity = "1";
            btnUserTabUrl.classList.remove('active');
            btnUserTabUrl.style.opacity = "0.7";
            document.getElementById('submitPoseUrl').required = false;
        });

        btnUserTabUrl?.addEventListener('click', () => {
            userSourceFileArea.classList.add('hidden');
            userSourceUrlArea.classList.remove('hidden');
            btnUserTabUrl.classList.add('active');
            btnUserTabUrl.style.opacity = "1";
            btnUserTabFile.classList.remove('active');
            btnUserTabFile.style.opacity = "0.7";
            document.getElementById('submitPoseUrl').required = true;
        });

        userPoseDropZone?.addEventListener('click', () => userPoseFileInput.click());

        userPoseDropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            userPoseDropZone.classList.add('dragover');
        });

        userPoseDropZone?.addEventListener('dragleave', () => userPoseDropZone.classList.remove('dragover'));

        userPoseDropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            userPoseDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleUserFiles(e.dataTransfer.files);
        });

        userPoseFileInput?.addEventListener('change', (e) => {
            if (e.target.files.length) handleUserFiles(e.target.files);
        });

        async function handleUserFiles(files) {
            const file = files[0];
            if (!file.type.startsWith('image/')) return alert("Please select an image file.");

            userPoseDropZone.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 15px; display: block;"></i><p>Optimizing Photo...</p>';

            try {
                userUploadedImageData = await compressImageForUser(file);
                renderUserPreview(userUploadedImageData);
                userPoseDropZone.innerHTML = '<i class="fa-solid fa-check-circle" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 15px; display: block;"></i><p>Photo Optimized!</p><span>Tap to change</span>';
                triggerHaptic(20);
            } catch (err) {
                console.error(err);
                alert("Processing failed. Try another photo.");
                userPoseDropZone.innerHTML = '<i class="fa-solid fa-camera-retro" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 15px; display: block; opacity: 0.8;"></i><p>Tap to select or drag photo</p>';
            }
        }

        function renderUserPreview(data) {
            userPosePreviewGrid.innerHTML = `
                <div class="upload-preview-item">
                    <img src="${data}" alt="Preview">
                    <button type="button" class="remove-user-preview"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
            userPosePreviewGrid.classList.remove('hidden');
            userPosePreviewGrid.querySelector('.remove-user-preview').addEventListener('click', () => {
                userUploadedImageData = null;
                userPosePreviewGrid.innerHTML = '';
                userPosePreviewGrid.classList.add('hidden');
                userPoseDropZone.innerHTML = '<i class="fa-solid fa-camera-retro" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 15px; display: block; opacity: 0.8;"></i><p>Tap to select or drag photo</p>';
            });
        }

        if (submitPoseForm) {
            submitPoseForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!isLoggedIn()) return;

                const urlVal = document.getElementById('submitPoseUrl').value;
                if (!userUploadedImageData && !urlVal) return alert("Please upload a file or provide a URL.");

                const btn = document.getElementById('btnSubmitPoseConfirm');
                const btnText = btn ? btn.querySelector('span') : null;
                const originalText = btnText ? btnText.textContent : 'Submit';

                if (btn) btn.disabled = true;
                if (btnText) btnText.textContent = "Submitting...";

                try {
                    const submission = {
                        images: [userUploadedImageData || urlVal],
                        category: document.getElementById('submitPoseCategory').value,
                        gender: document.getElementById('submitPoseGender').value,
                        tags: document.getElementById('submitPoseTags').value.split(',').map(t => t.trim()).filter(t => t),
                        title: "",
                        status: "pending",
                        userEmail: auth.currentUser.email,
                        uid: auth.currentUser.uid,
                        timestamp: new Date()
                    };

                    await addDoc(collection(db, "pending_poses"), submission);

                    if (submitPoseSuccessMsg) submitPoseSuccessMsg.classList.remove('hidden');
                    triggerHaptic(50);

                    setTimeout(() => {
                        closeSubmitModal();
                        if (btn) btn.disabled = false;
                        if (btnText) btnText.textContent = originalText;
                    }, 2000);

                } catch (err) {
                    console.error("Submission failed:", err);
                    alert("Failed to submit. Please try again.");
                    if (btn) btn.disabled = false;
                    if (btnText) btnText.textContent = originalText;
                }
            });
        }
    }
}


function buildFilterButtons(poses, container, searchInput) {
    if (!container) return;
    container.innerHTML = '';

    const btnToggleFilters = document.createElement('button');
    btnToggleFilters.id = 'btnToggleFilters';
    btnToggleFilters.className = 'filter-drawer-trigger';
    btnToggleFilters.title = 'Detailed Filters';
    btnToggleFilters.innerHTML = '<i class="fa-solid fa-sliders"></i>';
    container.appendChild(btnToggleFilters);

    const categories = new Set();
    poses.forEach(p => {
        if (p.category) categories.add(p.category.toLowerCase());
    });
    const sortedCategories = Array.from(categories)
        .filter(cat => cat !== 'favorites')
        .sort((a, b) => {
            const indexA = categoryPriority.indexOf(a);
            const indexB = categoryPriority.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.filter = 'all';
    allBtn.textContent = 'All';
    container.appendChild(allBtn);

    sortedCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.filter = cat;
        btn.textContent = cat.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        container.appendChild(btn);
    });

    const btnSavedPoses = document.createElement('button');
    btnSavedPoses.id = 'btnSavedPoses';
    btnSavedPoses.className = 'nav-icon-link category-saved-btn';
    btnSavedPoses.title = 'Saved Poses';
    btnSavedPoses.innerHTML = '<i class="fa-solid fa-heart"></i><span>Saved</span>';
    container.appendChild(btnSavedPoses);

    if (btnToggleFilters) {
        btnToggleFilters.addEventListener('click', () => {
            const filterDrawer = document.getElementById('filterDrawer');
            if (filterDrawer) filterDrawer.classList.toggle('hidden');
        });
    }

    if (btnSavedPoses) {
        btnSavedPoses.addEventListener('click', () => {
            const isClosing = btnSavedPoses.classList.contains('active');
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));

            if (isClosing) {
                btnSavedPoses.classList.remove('active');
                activeCategory = 'all';
                const allBtn = container.querySelector('[data-filter="all"]');
                if (allBtn) allBtn.classList.add('active');
            } else {
                btnSavedPoses.classList.add('active');
                activeCategory = 'favorites';
            }
            filterCards();
        });
    }

    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            if (btnSavedPoses) btnSavedPoses.classList.remove('active');
            const targetBtn = e.target.closest('.filter-btn');
            targetBtn.classList.add('active');
            activeCategory = targetBtn.dataset.filter;
            filterCards();
        });
    });
}


// --- INTERACTIVE FEATURE TOUR ---
let currentTourStep = 0;
const tourSteps = [
    {
        element: '#filterContainer',
        title: 'Browse Categories',
        content: 'Swipe through to find specific styles like Standing, Fashion, or Fitness.'
    },
    {
        element: '#searchInput',
        title: 'Search Anything',
        content: 'Typed what you are looking for to find specific tags or poses instantly.'
    },
    {
        element: '#btnToggleFilters',
        title: 'Advanced Filters',
        content: 'Fine-tune your results by gender and difficulty levels here.'
    },
    {
        element: '#userProfileIcon',
        title: 'Your Account',
        content: 'Manage your profile, submissions, and dashboard settings right here.'
    }
];

function startFeatureTour() {
    currentTourStep = 0;

    let overlay = document.querySelector('.tour-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tour-overlay';
        overlay.innerHTML = `
            <div class="tour-spotlight"></div>
            <div class="tour-tooltip" id="tourTooltip">
                <h4 id="tourTitle"></h4>
                <p id="tourText"></p>
                <div class="tour-controls">
                    <button class="btn-tour-skip" id="btnTourSkip">Skip Tour</button>
                    <button class="btn-tour-next" id="btnTourNext">Next</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('btnTourSkip').addEventListener('click', endTour);
        document.getElementById('btnTourNext').addEventListener('click', () => {
            currentTourStep++;
            if (currentTourStep < tourSteps.length) {
                showTourStep(currentTourStep);
            } else {
                endTour();
            }
        });
    }

    overlay.style.display = 'block';
    overlay.style.opacity = '1';
    showTourStep(0);
}

function showTourStep(index) {
    const step = tourSteps[index];
    const target = document.querySelector(step.element);
    const spotlight = document.querySelector('.tour-spotlight');
    const tooltip = document.getElementById('tourTooltip');
    const nextBtn = document.getElementById('btnTourNext');

    if (!target || !spotlight || !tooltip) {
        currentTourStep++;
        if (currentTourStep < tourSteps.length) showTourStep(currentTourStep);
        else endTour();
        return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 10;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        const finalRect = target.getBoundingClientRect();

        target.classList.add('tour-target-active');
        target.style.zIndex = '10007';
        if (window.getComputedStyle(target).position === 'static') {
            target.style.position = 'relative';
        }

        spotlight.style.top = (finalRect.top - padding) + 'px';
        spotlight.style.left = (finalRect.left - padding) + 'px';
        spotlight.style.width = (finalRect.width + (padding * 2)) + 'px';
        spotlight.style.height = (finalRect.height + (padding * 2)) + 'px';

        document.getElementById('tourTitle').textContent = step.title;
        document.getElementById('tourText').textContent = step.content;
        nextBtn.textContent = index === tourSteps.length - 1 ? 'Finish' : 'Next';

        tooltip.classList.remove('visible');

        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            let top = finalRect.bottom + 25;
            let left = finalRect.left + (finalRect.width / 2) - (tooltipRect.width / 2);

            if (top + tooltipRect.height > window.innerHeight) {
                top = finalRect.top - tooltipRect.height - 25;
            }
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }

            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';
            tooltip.classList.add('visible');
        }, 100);
    }, 400);
}

function endTour() {
    const overlay = document.querySelector('.tour-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }

    document.querySelectorAll('.tour-target-active').forEach(el => {
        el.classList.remove('tour-target-active');
        el.style.zIndex = '';
        el.style.position = '';
    });

    localStorage.setItem('pickpose_tour_complete', 'true');
    logEvent(analytics, 'feature_tour_complete', { step: currentTourStep });
}

function filterCards() {
    const grid = document.getElementById('posesGrid');
    if (!grid) return;

    let filtered = posesData.filter(pose => {
        let matchCategory = false;
        if (activeCategory === 'all') {
            matchCategory = true;
        } else if (activeCategory === 'favorites') {
            matchCategory = favoritePoseIds.includes(pose.docId);
        } else {
            matchCategory = (pose.category && pose.category.toLowerCase() === activeCategory);
        }

        let matchGender = true;
        if (activeGender !== 'all') {
            const mg = pose.gender || 'none';
            matchGender = mg === activeGender || mg === 'both';
        }

        const tags = (pose.tags || []).join(' ').toLowerCase();
        const cat = (pose.category || '').toLowerCase();
        const title = (pose.title || '').toLowerCase();
        const fullTxt = `${title} ${cat} ${tags}`;

        let matchSearch = true;
        if (searchQuery) {
            const keywords = searchQuery.split(' ').filter(k => k.length > 0);
            matchSearch = keywords.every(kw => fullTxt.includes(kw));
        }

        let matchDifficulty = true;
        if (activeDifficulty !== 'all') {
            const poseDiff = pose.difficulty || 'beginner';
            matchDifficulty = poseDiff === activeDifficulty;
        }

        return matchCategory && matchGender && matchSearch && matchDifficulty;
    });

    grid.innerHTML = '';
    currentFilteredPoses = filtered;

    filtered.forEach(pose => {
        const card = document.createElement('div');
        card.className = 'pose-card';
        const difficulty = pose.difficulty || 'beginner';
        card.innerHTML = `
            <div class="image-container">
                <img src="${pose.images[0]}" alt="${pose.category}" loading="lazy">
                <div class="difficulty-badge ${difficulty}"></div>
                <span class="difficulty-label">${difficulty}</span>
            </div>
        `;
        card.addEventListener('click', () => openModal(pose));
        grid.appendChild(card);
    });
}

function renderGrid(data, gridElement) {
    filterCards();
}

function isLoggedIn() {
    return auth.currentUser !== null;
}

let isAuthInitialized = false;

window.openAuthModal = (stepId = 'authModeSelection') => {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (typeof showStep === 'function') showStep(stepId);
    }
};

function setupAuth() {
    const authModal = document.getElementById('authModal');
    const authModalBg = document.getElementById('authModalBg');
    const closeAuthBtn = document.getElementById('closeAuthModal');

    // ============================================================
    // FIX: onAuthStateChanged — uses module-scoped latestBroadcastData
    // and module-scoped showWhatsNewModal — no more reference errors
    // ============================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const favRef = doc(db, "user_favorites", user.uid);
                const snap = await getDoc(favRef);
                favoritePoseIds = snap.exists() ? (snap.data().poses || []) : [];
            } catch (e) {
                console.error("Failed to load favorites:", e);
                favoritePoseIds = [];
            }
        } else {
            favoritePoseIds = [];
            if (activeCategory === 'favorites') {
                activeCategory = 'all';
                const filterContainer = document.getElementById('filterContainer');
                filterContainer?.querySelectorAll('.filter-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.filter === 'all');
                });
            }
        }

        isAuthInitialized = true;
        updateHeaderAuthUI(user);

        const onboardingOverlay = document.getElementById('onboardingOverlay');
        // FIX: Check if we are mid-redirect before showing/hiding onboarding
        const isGoogleRedirectPending = localStorage.getItem('pickpose_google_action');

        if (user) {
            // User is logged in — always hide onboarding
            onboardingOverlay?.classList.add('hidden');
            document.body.style.overflow = '';

            // FIX: latestBroadcastData now accessible (module scope)
            if (latestBroadcastData) {
                const lastSeenVersion = localStorage.getItem('pickpose_last_version');
                if (latestBroadcastData.version !== lastSeenVersion) {
                    showWhatsNewModal(latestBroadcastData.message, latestBroadcastData.version);
                }
            }
        } else if (!isGoogleRedirectPending) {
            // No user AND no redirect pending — show onboarding normally
            onboardingOverlay?.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (typeof resetOnboardingCarousel === 'function') resetOnboardingCarousel();
        }
        // If isGoogleRedirectPending is set, do nothing — getRedirectResult below will handle it

        filterCards();
    });

    if (!authModal) return;

    const btnNavLogin = document.getElementById('btnNavLogin');
    const btnNavSignup = document.getElementById('btnNavSignup');
    const btnNavLogout = document.getElementById('btnNavLogout');

    if (btnNavLogin) btnNavLogin.addEventListener('click', () => window.openAuthModal('authModeSelection'));
    if (btnNavSignup) btnNavSignup.addEventListener('click', () => window.openAuthModal('authModeSelection'));
    if (btnNavLogout) {
        btnNavLogout.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging out...`;
            try {
                await signOut(auth);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                alert("Logout failed: " + err.message);
            }
        });
    }

    const userIcon = document.getElementById('userProfileIcon');
    const profileDrawer = document.getElementById('profileDrawer');
    const closeProfileDrawer = document.getElementById('closeProfileDrawer');

    if (userIcon && profileDrawer) {
        userIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileDrawer();
        });

        if (closeProfileDrawer) {
            closeProfileDrawer.addEventListener('click', () => {
                profileDrawer.classList.add('hidden');
                document.body.style.overflow = '';
            });
        }

        document.addEventListener('click', (e) => {
            const drawerContent = profileDrawer.querySelector('.drawer-content');
            if (!profileDrawer.classList.contains('hidden') &&
                drawerContent && !drawerContent.contains(e.target) &&
                !userIcon.contains(e.target)) {
                profileDrawer.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    }

    const btnProfileDetails = document.getElementById('btnProfileDetails');
    const btnDrawerAddPose = document.getElementById('btnDrawerAddPose');
    const btnDrawerAbout = document.getElementById('btnDrawerAbout');
    const btnDrawerContact = document.getElementById('btnDrawerContact');
    const btnDrawerLogout = document.getElementById('btnDrawerLogout');
    const btnDrawerInstall = document.getElementById('btnDrawerInstall');

    if (btnProfileDetails) {
        btnProfileDetails.addEventListener('click', () => {
            profileDrawer.classList.add('hidden');
            openProfileDetails();
        });
    }

    if (btnDrawerAddPose) {
        btnDrawerAddPose.addEventListener('click', () => {
            profileDrawer.classList.add('hidden');
            document.getElementById('btnSubmitPose')?.click();
        });
    }

    if (btnDrawerAbout) {
        btnDrawerAbout.addEventListener('click', () => {
            profileDrawer.classList.add('hidden');
            document.getElementById('btnAbout')?.click();
        });
    }

    if (btnDrawerContact) {
        btnDrawerContact.addEventListener('click', () => {
            profileDrawer.classList.add('hidden');
            document.getElementById('btnContact')?.click();
        });
    }

    if (btnDrawerInstall) {
        btnDrawerInstall.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA Install User Response: ${outcome}`);
                deferredPrompt = null;
                btnDrawerInstall.classList.add('hidden');
            }
        });
    }

    if (btnDrawerLogout) {
        btnDrawerLogout.addEventListener('click', async () => {
            profileDrawer.classList.add('hidden');
            document.body.style.overflow = '';

            localStorage.removeItem('pickpose_onboarding_seen');
            if (typeof currentOnboardingSlide !== 'undefined') {
                if (typeof resetOnboardingCarousel === 'function') {
                    resetOnboardingCarousel();
                } else {
                    currentOnboardingSlide = 0;
                }
            }

            try {
                await signOut(auth);
            } catch (err) {
                alert("Logout failed: " + err.message);
            }
        });
    }

    const profileDetailsModal = document.getElementById('profileDetailsModal');
    const closeProfileDetails = document.getElementById('closeProfileDetails');
    const profileDetailsBg = document.getElementById('profileDetailsBg');

    const closeDetails = () => {
        profileDetailsModal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    if (closeProfileDetails) closeProfileDetails.addEventListener('click', closeDetails);
    if (profileDetailsBg) profileDetailsBg.addEventListener('click', closeDetails);

    const closeMod = () => {
        if (auth.currentUser) {
            getDoc(doc(db, "users", auth.currentUser.uid)).then(snap => {
                if (!snap.exists()) signOut(auth);
            }).catch(console.error);
        }
        authModal.classList.add('hidden');
        document.body.style.overflow = '';
    };
    closeAuthBtn.addEventListener('click', closeMod);
    authModalBg.addEventListener('click', closeMod);

    // --- AUTH WIZARD LOGIC ---
    let pendingOtp = null;
    let wizardData = { email: '', password: '', username: '' };

    function showStep(stepId) {
        document.querySelectorAll('.auth-step').forEach(el => el.classList.add('hidden'));
        document.getElementById(stepId).classList.remove('hidden');
        document.getElementById('authWizardErrorMsg').classList.add('hidden');
    }
    window.showStep = showStep;

    const showError = (msg, isSuccess = false) => {
        const errEl = document.getElementById('authWizardErrorMsg');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.color = isSuccess ? '#10b981' : 'red';
        errEl.classList.remove('hidden');
    };

    // ============================================================
    // FIX: getRedirectResult — fully rewritten to handle mobile
    // redirect flow without relying on closeMod() (modal not open
    // on redirect landing) or inner-scoped showWhatsNewModal
    // ============================================================
    getRedirectResult(auth)
        .then(async (result) => {
            const actionType = localStorage.getItem('pickpose_google_action') || 'login';
            localStorage.removeItem('pickpose_google_action'); // Always clear the flag

            if (result && result.user) {
                console.log("Redirect Auth Success:", result.user.email);

                const userRef = doc(db, "users", result.user.uid);
                const snap = await getDoc(userRef);

                if (actionType === 'login') {
                    if (snap.exists()) {
                        // ✅ SUCCESS: valid user returned from redirect
                        // Do NOT call closeMod() — modal was never opened on this reload
                        // onAuthStateChanged will fire and handle the UI correctly
                        document.getElementById('onboardingOverlay')?.classList.add('hidden');
                        document.body.style.overflow = '';
                        updateHeaderAuthUI(result.user);
                    } else {
                        // No account found — sign out and show error
                        await signOut(auth);
                        window.openAuthModal('authGoogleChoice');
                        showError("Sign Up! You have no account.");
                    }
                } else if (actionType === 'signup') {
                    if (snap.exists()) {
                        // Already has an account
                        window.openAuthModal('authGoogleChoice');
                        showError("Account already exists! Please click 'Log In with Google' instead.", true);
                    } else {
                        // New signup — needs username
                        wizardData.isGoogleSignup = true;
                        wizardData.email = result.user.email;
                        window.openAuthModal('authSignupStep4');
                    }
                }
            }
            // If result is null: normal page load (not a redirect return) — do nothing
        })
        .catch((error) => {
            console.error("Redirect Auth Error:", error.code, error.message);
            localStorage.removeItem('pickpose_google_action');

            if (error.code === 'auth/redirect-cancelled-by-user') {
                // User cancelled — show onboarding if not logged in
                if (!auth.currentUser) {
                    document.getElementById('onboardingOverlay')?.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                }
                return;
            }

            // All other errors — open modal and display message
            window.openAuthModal('authModeSelection');

            if (error.code === 'auth/web-storage-unsupported') {
                showError("Mobile Auth Error: Your browser blocks third-party cookies/storage. Please disable 'Block All Cookies' or 'Private/Incognito' mode.");
            } else if (error.code === 'auth/unauthorized-domain') {
                showError(`Domain Not Authorized: Please add '${window.location.hostname}' to Firebase Authorized Domains in Console.`);
            } else {
                showError("Redirect Login failed: " + error.message);
            }
        });

    // Mode Selection
    document.getElementById('btnGoToLogin').addEventListener('click', () => showStep('authStepLogin'));
    document.getElementById('btnGoToSignup').addEventListener('click', () => showStep('authSignupStep1'));
    document.getElementById('btnBackToMenuLogin')?.addEventListener('click', () => showStep('authModeSelection'));
    document.getElementById('btnBackToMenuSignup')?.addEventListener('click', () => showStep('authModeSelection'));
    document.getElementById('btnBackToMenuGoogle')?.addEventListener('click', () => showStep('authModeSelection'));

    document.getElementById('btnGoogleLogin').addEventListener('click', () => showStep('authGoogleChoice'));

    // --- GOOGLE EXISTING LOGIN ---
    document.getElementById('btnGoogleExistingLogin').addEventListener('click', async () => {
        await handleGoogleAction('login');
    });

    // --- GOOGLE NEW SIGNUP ---
    document.getElementById('btnGoogleNewSignup').addEventListener('click', async () => {
        await handleGoogleAction('signup');
    });

    async function handleGoogleAction(actionType) {
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');

        showError("", true);
        const btnId = actionType === 'login' ? 'btnGoogleExistingLogin' : 'btnGoogleNewSignup';
        const btn = document.getElementById(btnId);
        const originalHtml = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connecting...`;

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

        try {
            if (isMobile || isStandalone) {
                // FIX: Set the action flag BEFORE calling signInWithRedirect
                // so getRedirectResult knows what to do when user returns
                localStorage.setItem('pickpose_google_action', actionType);
                console.log("Attempting Mobile Redirect for action:", actionType);
                try {
                    await signInWithRedirect(auth, provider);
                    // Page will redirect away — code below will not run
                } catch (redirectError) {
                    console.warn("Redirect failed, attempting Popup fallback...", redirectError);
                    localStorage.removeItem('pickpose_google_action'); // Clear flag if falling back to popup
                    const result = await signInWithPopup(auth, provider);
                    await processGoogleResult(result.user, actionType);
                }
            } else {
                console.log("Attempting Desktop Popup...");
                const result = await signInWithPopup(auth, provider);
                await processGoogleResult(result.user, actionType);
            }
        } catch (error) {
            console.error("Google Auth Error:", error.code, error.message);
            localStorage.removeItem('pickpose_google_action'); // Clear flag on error
            let userMsg = error.message;

            if (error.code === 'auth/popup-blocked') {
                userMsg = "Pop-up blocked! Please allow pop-ups for this site or try a different browser.";
            } else if (error.code === 'auth/web-storage-unsupported') {
                userMsg = "Storage not supported. Please disable 'Private/Incognito' mode or enable cookies.";
            } else if (error.code === 'auth/operation-not-allowed') {
                userMsg = "Google login is currently disabled in Firebase Console.";
            } else if (error.code === 'auth/unauthorized-domain') {
                userMsg = `Domain Not Authorized: Add '${window.location.hostname}' to Firebase Authorized Domains.`;
            } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
                userMsg = "Login cancelled.";
            }

            showError("Google Sign-In failed: " + userMsg);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }

    // Used by DESKTOP popup flow and popup fallback
    async function processGoogleResult(user, actionType) {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (actionType === 'login') {
            if (snap.exists()) {
                closeMod();
                document.getElementById('onboardingOverlay')?.classList.add('hidden');
                document.body.style.overflow = '';
                updateHeaderAuthUI();
            } else {
                await signOut(auth);
                window.openAuthModal('authGoogleChoice');
                showError("Sign Up! You have no account.");
            }
        } else if (actionType === 'signup') {
            if (snap.exists()) {
                window.openAuthModal('authGoogleChoice');
                showError("Account already exists! Please click 'Log In with Google' instead.", true);
            } else {
                wizardData.isGoogleSignup = true;
                wizardData.email = user.email;
                window.openAuthModal('authSignupStep4');
            }
        }
    }

    // --- LOGIN FLOW ---
    document.getElementById('btnLoginSubmit').addEventListener('click', async () => {
        const identifier = document.getElementById('loginIdentifier').value.trim();
        const pwd = document.getElementById('loginPassword').value;
        if (!identifier || pwd.length < 6) return showError("Please enter valid credentials.");

        const btn = document.getElementById('btnLoginSubmit');
        btn.disabled = true; btn.textContent = "Logging in...";
        showError("", true);

        try {
            let userEmail = identifier;
            if (!identifier.includes('@')) {
                const q = query(collection(db, "users"), where("username", "==", identifier));
                const snap = await getDocs(q);
                if (snap.empty) throw new Error("Username not found.");
                userEmail = snap.docs[0].data().email;
            }

            await signInWithEmailAndPassword(auth, userEmail, pwd);
            closeMod();
        } catch (error) {
            let msg = error.message;
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || msg === "Username not found.") {
                msg = "Sign Up! You have no account.";
            }
            showError("Login failed: " + msg);
        }
        btn.disabled = false; btn.textContent = "Log In";
    });

    // --- SIGNUP FLOW ---

    // Step 1: Send OTP via EmailJS
    document.getElementById('btnSignupSendOtp').addEventListener('click', async () => {
        const email = document.getElementById('signupEmail').value.trim();
        if (!email || !email.includes('@')) return showError("Please enter a valid email.");

        const btn = document.getElementById('btnSignupSendOtp');
        btn.disabled = true; btn.textContent = "Sending...";
        showError("", true);

        try {
            pendingOtp = Math.floor(100000 + Math.random() * 900000).toString();
            wizardData.email = email;

            const expiryTime = new Date();
            expiryTime.setMinutes(expiryTime.getMinutes() + 15);
            const timeString = expiryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            await emailjs.send('service_k0necvi', 'template_ymbsgzi', {
                to_email: email,
                email: email,
                user_email: email,
                to: email,
                passcode: pendingOtp,
                time: timeString
            });

            startResendCooldown();
            showStep('authSignupStep2');
        } catch (error) {
            console.error("EmailJS Error:", error);
            showError("Failed to send: " + (error.text || error.message || JSON.stringify(error)));
        }
        btn.disabled = false; btn.textContent = "Send OTP Code";
    });

    let resendTimer = null;
    function startResendCooldown() {
        const btn = document.getElementById('btnResendOtp');
        let timeLeft = 60;
        btn.disabled = true;
        btn.style.color = '#555';
        btn.style.cursor = 'not-allowed';
        btn.textContent = `Resend Code (${timeLeft}s)`;

        if (resendTimer) clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.style.color = 'var(--accent)';
                btn.style.cursor = 'pointer';
                btn.textContent = "Resend Code";
            } else {
                btn.textContent = `Resend Code (${timeLeft}s)`;
            }
        }, 1000);
    }

    // Step 2: Verify OTP
    document.getElementById('btnSignupVerifyOtp').addEventListener('click', () => {
        const entered = document.getElementById('signupOtp').value.trim();
        if (entered !== pendingOtp) return showError("Incorrect OTP Code.");
        showStep('authSignupStep3');
    });

    document.getElementById('btnResendOtp').addEventListener('click', () => {
        document.getElementById('btnSignupSendOtp').click();
        showError("Code resent successfully!", true);
    });

    // Step 3: Password Rules
    document.getElementById('btnSignupPassword').addEventListener('click', () => {
        const pwd = document.getElementById('signupPassword').value;
        if (pwd.length < 6) return showError("Password must be at least 6 characters.");

        const upper = (pwd.match(/[A-Z]/g) || []).length;
        const lower = (pwd.match(/[a-z]/g) || []).length;
        const digits = (pwd.match(/[0-9]/g) || []).length;

        if (upper < 2 || lower < 2 || digits < 2) {
            return showError("Must contain at least 2 uppercase, 2 lowercase, and 2 numbers.");
        }

        wizardData.password = pwd;
        showStep('authSignupStep4');
    });

    // Toggle Eye icons
    document.querySelectorAll('.pwd-toggle').forEach(eye => {
        eye.addEventListener('click', function () {
            const input = this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.replace('fa-eye', 'fa-eye-slash');
                this.classList.add('active-eye');
            } else {
                input.type = 'password';
                this.classList.replace('fa-eye-slash', 'fa-eye');
                this.classList.remove('active-eye');
            }
        });
    });

    // Step 4: Finalize Signup
    document.getElementById('btnSignupFinal').addEventListener('click', async () => {
        const uname = document.getElementById('signupUsername').value.trim();
        if (!uname || uname.length < 3) return showError("Username must be at least 3 chars.");

        const btn = document.getElementById('btnSignupFinal');
        btn.disabled = true; btn.textContent = "Creating Account...";
        showError("", true);

        try {
            const q = query(collection(db, "users"), where("username", "==", uname));
            const snap = await getDocs(q);
            if (!snap.empty) throw new Error("Username already taken! Please pick another.");

            if (wizardData.isGoogleSignup && auth.currentUser) {
                await setDoc(doc(db, "users", auth.currentUser.uid), {
                    username: uname,
                    email: auth.currentUser.email,
                    createdAt: new Date()
                });
            } else {
                const newCred = await createUserWithEmailAndPassword(auth, wizardData.email, wizardData.password);
                await setDoc(doc(db, "users", newCred.user.uid), {
                    username: uname,
                    email: wizardData.email,
                    createdAt: new Date()
                });
            }

            closeMod();
            document.getElementById('onboardingOverlay')?.classList.add('hidden');
            document.body.style.overflow = '';
            updateHeaderAuthUI();
        } catch (error) {
            showError("Signup failed: " + error.message);
        }
        btn.disabled = false; btn.textContent = "Complete Signup!";
    });
}

function updateHeaderAuthUI(explicitUser = null) {
    const user = explicitUser || auth.currentUser;
    const isLoggedInUser = user !== null;

    const userIcon = document.getElementById('userProfileIcon');
    const btnAbout = document.getElementById('btnAbout');
    const btnContact = document.getElementById('btnContact');
    const btnSubmitPose = document.getElementById('btnSubmitPose');
    const btnSubmitPoseMobile = document.getElementById('btnSubmitPoseMobile');

    if (isLoggedInUser) {
        if (userIcon) userIcon.classList.remove('hidden');
        if (btnSubmitPose) btnSubmitPose.classList.remove('hidden');
        if (btnSubmitPoseMobile) btnSubmitPoseMobile.classList.remove('hidden');

        if (btnAbout) btnAbout.classList.add('hidden');
        if (btnContact) btnContact.classList.add('hidden');

        const profileEmail = document.getElementById('profileEmail');
        const profileUsername = document.getElementById('profileUsername');

        if (profileEmail) profileEmail.textContent = user.email;
        if (profileUsername) {
            const userRef = doc(db, "users", user.uid);
            getDoc(userRef).then(snap => {
                if (snap.exists()) {
                    profileUsername.textContent = snap.data().username || user.email.split('@')[0];
                } else {
                    profileUsername.textContent = user.email.split('@')[0];
                }
            });
        }

        const btnAdmin = document.getElementById('btnAdminDashboard');
        if (btnAdmin) {
            if (user.email === 'saich@pickpose.app') {
                btnAdmin.classList.remove('hidden');
                btnAdmin.onclick = () => window.location.href = 'admin.html';
            } else {
                btnAdmin.classList.add('hidden');
            }
        }
    } else {
        if (userIcon) userIcon.classList.add('hidden');
        if (btnSubmitPose) btnSubmitPose.classList.add('hidden');
        if (btnSubmitPoseMobile) btnSubmitPoseMobile.classList.add('hidden');

        if (btnAbout) btnAbout.classList.remove('hidden');
        if (btnContact) btnContact.classList.remove('hidden');
    }
}

function openProfileDrawer() {
    const profileDrawer = document.getElementById('profileDrawer');
    if (profileDrawer) {
        profileDrawer.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

async function openProfileDetails() {
    const modal = document.getElementById('profileDetailsModal');
    const user = auth.currentUser;
    if (!user || !modal) return;

    document.getElementById('detailUid').textContent = user.uid;
    document.getElementById('detailEmail').textContent = user.email;

    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().createdAt) {
            const date = snap.data().createdAt.toDate ? snap.data().createdAt.toDate() : new Date(snap.data().createdAt);
            document.getElementById('detailJoined').textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            document.getElementById('detailJoined').textContent = "Unknown";
        }
    } catch (e) {
        document.getElementById('detailJoined').textContent = "Error loading";
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// --- MODAL & ZOOM LOGIC ---
let zoomState = { scale: 1, x: 0, y: 0 };
let isZooming = false;
let lastTouchDist = 0;
let lastTouchX = 0;
let lastTouchY = 0;

function setupModal() {
    const modal = document.getElementById('poseModal');
    const modalImg = document.getElementById('modalImg');
    const closeModalBtn = document.getElementById('closeModal');
    const imgWrapper = document.querySelector('.modal-image-wrapper');
    const shareMenu = document.getElementById('shareMenu');
    const btnShare = document.getElementById('btnShare');
    const closeShareMenu = document.getElementById('closeShareMenu');
    const modalBgClick = document.getElementById('poseModal');

    const resetZoom = () => {
        zoomState = { scale: 1, x: 0, y: 0 };
        updateZoomTransform();
    };

    const updateZoomTransform = () => {
        modalImg.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
    };

    const hideModal = () => {
        modal.classList.add('hidden');
        shareMenu.classList.add('hidden');
        document.body.style.overflow = 'auto';
        resetZoom();
    };
    closeModalBtn.addEventListener('click', hideModal);
    modalBgClick.addEventListener('click', hideModal);
    closeShareMenu?.addEventListener('click', () => shareMenu.classList.add('hidden'));

    if (btnShare) {
        btnShare.addEventListener('click', (e) => {
            e.stopPropagation();
            shareMenu.classList.toggle('hidden');
        });
    }

    document.querySelectorAll('.share-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!activePoseContext) return;
            const platform = btn.dataset.platform;
            const shareUrl = window.location.href;
            const shareText = `Check out this pose on PickPose: ${activePoseContext.title || 'Untitled Pose'}`;
            const imageUrl = activePoseContext.images[0];

            if (navigator.share && platform !== 'copy' && /Mobi|Android/i.test(navigator.userAgent)) {
                try {
                    await navigator.share({
                        title: 'PickPose',
                        text: shareText,
                        url: shareUrl
                    });
                    shareMenu.classList.add('hidden');
                    return;
                } catch (err) {
                    console.log("Web Share failed, using fallback");
                }
            }

            let intentUrl = "";
            switch (platform) {
                case 'whatsapp':
                    intentUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
                    window.open(intentUrl, '_blank');
                    break;
                case 'twitter':
                    intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
                    window.open(intentUrl, '_blank');
                    break;
                case 'pinterest':
                    intentUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(shareText)}`;
                    window.open(intentUrl, '_blank');
                    break;
                case 'instagram':
                    copyToClipboard(shareUrl);
                    alert("Instagram sharing is best on mobile app. Link copied to clipboard!");
                    break;
                case 'copy':
                    copyToClipboard(shareUrl);
                    triggerHaptic(30);
                    alert("Link copied to clipboard!");
                    break;
            }
            shareMenu.classList.add('hidden');
        });
    });

    function copyToClipboard(text) {
        const tempInput = document.createElement("input");
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
    }

    function prevPose() {
        const idx = currentFilteredPoses.findIndex(p => p.docId === activePoseContext.docId);
        if (idx > 0) {
            resetZoom();
            openModal(currentFilteredPoses[idx - 1]);
        }
    }

    function nextPose() {
        const idx = currentFilteredPoses.findIndex(p => p.docId === activePoseContext.docId);
        if (idx !== -1 && idx < currentFilteredPoses.length - 1) {
            resetZoom();
            openModal(currentFilteredPoses[idx + 1]);
        }
    }

    modalImg.addEventListener('dblclick', (e) => {
        if (zoomState.scale > 1) {
            resetZoom();
        } else {
            zoomState.scale = 2.5;
            updateZoomTransform();
        }
    });

    imgWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = zoomState.scale * delta;
        if (newScale >= 1 && newScale <= 4) {
            zoomState.scale = newScale;
            updateZoomTransform();
        }
    }, { passive: false });

    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    imgWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isZooming = true;
            lastTouchDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        } else if (e.touches.length === 1 && zoomState.scale > 1) {
            isPanning = true;
            panStartX = e.touches[0].pageX - zoomState.x;
            panStartY = e.touches[0].pageY - zoomState.y;
        }

        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    imgWrapper.addEventListener('touchmove', (e) => {
        if (isZooming && e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            const delta = dist / lastTouchDist;
            const newScale = zoomState.scale * delta;
            if (newScale >= 1 && newScale <= 5) {
                zoomState.scale = newScale;
                updateZoomTransform();
            }
            lastTouchDist = dist;
        } else if (isPanning && e.touches.length === 1) {
            e.preventDefault();
            zoomState.x = e.touches[0].pageX - panStartX;
            zoomState.y = e.touches[0].pageY - panStartY;
            updateZoomTransform();
        }
    }, { passive: false });

    imgWrapper.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) isZooming = false;
        if (e.touches.length === 0) isPanning = false;

        if (zoomState.scale <= 1.1) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }
    });

    modalImg.addEventListener('dragstart', (e) => e.preventDefault());

    const btnFavorite = document.getElementById('btnFavorite');
    if (btnFavorite) {
        btnFavorite.addEventListener('click', async () => {
            if (!activePoseContext) return;
            const success = await toggleFavorite(activePoseContext.docId);
            if (success) {
                if (favoritePoseIds.includes(activePoseContext.docId)) {
                    btnFavorite.classList.remove('fa-regular');
                    btnFavorite.classList.add('fa-solid');
                    btnFavorite.style.color = '#ef4444';
                } else {
                    btnFavorite.classList.remove('fa-solid');
                    btnFavorite.classList.add('fa-regular');
                    btnFavorite.style.color = 'inherit';
                }
            }
        });
    }

    const btnInfo = document.querySelector('.fa-circle-info');
    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            if (activePoseContext) {
                const desc = `Pose Information:\n• Title: ${activePoseContext.title || 'Untitled'}\n• Category: ${activePoseContext.category}\n• Tags: ${activePoseContext.tags ? activePoseContext.tags.join(', ') : 'none'}`;
                alert(desc);
            }
        });
    }

    const btnEdit = document.querySelector('.btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            alert('To edit this pose, please log in to the Admin Dashboard (admin.html).');
        });
    }

    const btnTrash = document.querySelector('.fa-trash');
    if (btnTrash) {
        btnTrash.addEventListener('click', () => {
            alert('To delete this pose, please log in to the Admin Dashboard (admin.html).');
        });
    }
}

function openModal(pose) {
    const modal = document.getElementById('poseModal');
    const modalImg = document.getElementById('modalImg');
    const modalTitle = document.getElementById('modalTitle');
    const imgWrapper = document.querySelector('.modal-image-wrapper');
    const modalTags = document.getElementById('modalTags');
    const btnFavorite = document.getElementById('btnFavorite');

    activePoseContext = pose;
    modalImg.src = pose.images[0];

    zoomState = { scale: 1, x: 0, y: 0 };
    modalImg.style.transform = `translate(0,0) scale(1)`;

    const diff = pose.difficulty || 'beginner';
    modalTitle.innerHTML = `<span>${pose.title || ''}</span> <span class="difficulty-btn ${diff}" style="font-size:10px; padding:3px 8px; margin-left:8px; border-radius:10px;">${diff}</span>`;

    document.body.style.overflow = 'hidden';

    if (btnFavorite) {
        if (favoritePoseIds.includes(pose.docId)) {
            btnFavorite.classList.remove('fa-regular');
            btnFavorite.classList.add('fa-solid');
            btnFavorite.style.color = '#ef4444';
        } else {
            btnFavorite.classList.remove('fa-solid');
            btnFavorite.classList.add('fa-regular');
            btnFavorite.style.color = 'inherit';
        }
    }

    if (modalTags && pose.tags) {
        modalTags.innerHTML = '';
        pose.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'pill-tag';
            span.textContent = `#${tag}`;
            span.addEventListener('click', () => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = tag;
                    searchQuery = tag.toLowerCase();
                    filterCards();
                }
                modal.classList.add('hidden');
            });
            modalTags.appendChild(span);
        });
    }

    modal.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    initPickpose();
    setupModal();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('Service Worker registered:', reg.scope);
                reg.update();

                reg.onupdatefound = () => {
                    const newWorker = reg.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New update available. Refreshing...');
                            window.location.reload();
                        }
                    };
                };
            }).catch(err => {
                console.log('Service Worker registration failed:', err);
            });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const installBtn = document.getElementById('btnDrawerInstall');
        if (installBtn) {
            installBtn.classList.remove('hidden');
        }

        const onboardingInstallBtn = document.getElementById('btnOnboardingInstall');
        if (onboardingInstallBtn) {
            onboardingInstallBtn.classList.remove('hidden');
            onboardingInstallBtn.addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(() => {
                    deferredPrompt = null;
                    onboardingInstallBtn.classList.add('hidden');
                });
            });
        }

        if (!sessionStorage.getItem('pwa_popup_dismissed')) {
            const popup = document.getElementById('pwaInstallPopup');
            if (popup) {
                setTimeout(() => {
                    popup.classList.remove('hidden');
                    setupPwaPopupListeners(popup);
                }, 2000);
            }
        }
    });

    function setupPwaPopupListeners(popup) {
        const btnInstall = document.getElementById('btnPwaInstall');
        const btnClose = document.getElementById('btnPwaClose');

        btnInstall?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA Popup User Response: ${outcome}`);
                deferredPrompt = null;
                popup.classList.add('hidden');
            }
        });

        btnClose?.addEventListener('click', () => {
            popup.classList.add('hidden');
            sessionStorage.setItem('pwa_popup_dismissed', 'true');
        });
    }

    window.addEventListener('appinstalled', async (evt) => {
        console.log('PickPose was installed.');
        logEvent(analytics, 'app_installed');
        try {
            const statsRef = doc(db, "stats", "global");
            await updateDoc(statsRef, { installs: increment(1) });
        } catch (e) { }
        const installBtn = document.getElementById('btnDrawerInstall');
        if (installBtn) {
            installBtn.classList.add('hidden');
        }
    });
});

// ============================================================
// ONBOARDING LOGIC
// ============================================================
function initOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    const carousel = document.getElementById('onboardingCarousel');
    const btnNext = document.getElementById('btnOnboardingNext');
    const dots = document.querySelectorAll('#onboardingDots .dot');

    if (!overlay || !carousel || !btnNext) return;

    const totalSlides = 3;

    btnNext.addEventListener('click', () => {
        if (currentOnboardingSlide < totalSlides - 1) {
            currentOnboardingSlide++;
            updateOnboardingUI();
        } else {
            localStorage.setItem('pickpose_onboarding_seen', 'true');
            window.openAuthModal('authModeSelection');
        }
    });

    function updateOnboardingUI() {
        carousel.scrollTo({
            left: carousel.offsetWidth * currentOnboardingSlide,
            behavior: 'smooth'
        });

        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentOnboardingSlide);
        });

        if (currentOnboardingSlide === totalSlides - 1) {
            btnNext.textContent = 'Get Started';
            btnNext.style.background = 'var(--primary)';
            btnNext.style.color = 'var(--primary-text)';
        } else {
            btnNext.textContent = 'Next';
        }
    }

    window.resetOnboardingCarousel = () => {
        currentOnboardingSlide = 0;
        updateOnboardingUI();
    };

    window.addEventListener('resize', () => {
        carousel.scrollLeft = carousel.offsetWidth * currentOnboardingSlide;
    });
}

// ============================================================
// IMAGE PROCESSING UTILITIES
// ============================================================
const TARGET_ASPECT = 4 / 5;

async function compressImageForUser(file, maxWidth = 1800, quality = 0.94) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = async () => {
                const crop = getSmartCropRectForUser(img.width, img.height, []);

                let outW = crop.w;
                let outH = crop.h;
                if (outW > maxWidth) {
                    outH = Math.round((outH * maxWidth) / outW);
                    outW = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
}

function getSmartCropRectForUser(imgW, imgH, faces) {
    const imgAspect = imgW / imgH;
    if (Math.abs(imgAspect - TARGET_ASPECT) < 0.05) {
        return { x: 0, y: 0, w: imgW, h: imgH };
    }
    let cropW, cropH, cropX, cropY;
    if (imgAspect > TARGET_ASPECT) {
        cropH = imgH;
        cropW = Math.round(imgH * TARGET_ASPECT);
    } else {
        cropW = imgW;
        cropH = Math.round(imgW / TARGET_ASPECT);
    }
    cropX = Math.round((imgW - cropW) / 2);
    cropY = Math.round((imgH - cropH) / 2);

    if (imgAspect <= TARGET_ASPECT) {
        cropY = Math.round((imgH - cropH) * 0.3);
    }
    return { x: cropX, y: cropY, w: cropW, h: cropH };
}
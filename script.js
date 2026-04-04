import { db, auth } from './firebase-config.js';
import { collection, getDocs, getDoc, setDoc, doc, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Default pose data — used to seed Firestore if empty
const defaultPosesData = [
    { id: 1, title: "", category: "culture", gender: "both", tags: ["tradition", "dance", "ritual"], images: ["images/crossed.png"] },
    { id: 2, title: "", category: "culture", gender: "female", tags: ["art", "classical", "heritage"], images: ["images/profile.png"] },
    { id: 3, title: "", category: "culture", gender: "male", tags: ["folk", "tradition", "ethnic"], images: ["images/hip.png"] },
    { id: 4, title: "", category: "culture", gender: "male", tags: ["music", "instrument", "classical"], images: ["images/lean.png"] },
    { id: 5, title: "", category: "culture", gender: "female", tags: ["pottery", "craft", "handmade"], images: ["images/stride.png"] },
    { id: 6, title: "", category: "culture", gender: "none", tags: ["painting", "mural", "art"], images: ["images/stairs.png"] },
    { id: 7, title: "", category: "culture", gender: "male", tags: ["sculpture", "stone", "carving"], images: ["images/crouch.png"] },
    { id: 8, title: "", category: "culture", gender: "female", tags: ["weaving", "textile", "loom"], images: ["images/jump.png"] },
    { id: 9, title: "", category: "culture", gender: "both", tags: ["ceremony", "prayer", "spiritual"], images: ["images/sprint.png"] },
    { id: 10, title: "", category: "culture", gender: "none", tags: ["market", "bazaar", "local"], images: ["images/pockets_front.png"] },
    { id: 11, title: "", category: "festivals", gender: "both", tags: ["celebration", "lights", "diwali"], images: ["images/crossed.png"] },
    { id: 12, title: "", category: "festivals", gender: "both", tags: ["colors", "holi", "spring"], images: ["images/hip.png"] },
    { id: 13, title: "", category: "festivals", gender: "female", tags: ["harvest", "pongal", "onam"], images: ["images/men1.png"] },
    { id: 14, title: "", category: "festivals", gender: "male", tags: ["procession", "parade", "crowd"], images: ["images/stride.png"] },
    { id: 15, title: "", category: "festivals", gender: "none", tags: ["fireworks", "night", "sky"], images: ["images/jump.png"] },
    { id: 16, title: "", category: "festivals", gender: "female", tags: ["decorations", "rangoli", "flowers"], images: ["images/lean.png"] },
    { id: 17, title: "", category: "festivals", gender: "male", tags: ["lanterns", "night", "glow"], images: ["images/profile.png"] },
    { id: 18, title: "", category: "festivals", gender: "both", tags: ["dance", "garba", "navratri"], images: ["images/sprint.png"] },
    { id: 19, title: "", category: "festivals", gender: "none", tags: ["food", "feast", "sweets"], images: ["images/stairs.png"] },
    { id: 20, title: "", category: "festivals", gender: "male", tags: ["music", "drums", "folk"], images: ["images/pockets_front.png"] },
    { id: 21, title: "", category: "clothing", gender: "female", tags: ["saree", "silk", "traditional"], images: ["images/profile.png"] },
    { id: 22, title: "", category: "clothing", gender: "male", tags: ["kurta", "ethnic", "embroidery"], images: ["images/crossed.png"] },
    { id: 23, title: "", category: "clothing", gender: "male", tags: ["turban", "headwear", "rajasthani"], images: ["images/men1.png"] },
    { id: 24, title: "", category: "clothing", gender: "female", tags: ["lehenga", "bridal", "wedding"], images: ["images/hip.png"] },
    { id: 25, title: "", category: "clothing", gender: "male", tags: ["sherwani", "groom", "formal"], images: ["images/pockets_front.png"] },
    { id: 26, title: "", category: "clothing", gender: "male", tags: ["dhoti", "cotton", "south"], images: ["images/lean.png"] },
    { id: 27, title: "", category: "clothing", gender: "female", tags: ["jewelry", "gold", "ornament"], images: ["images/stairs.png"] },
    { id: 28, title: "", category: "clothing", gender: "female", tags: ["dupatta", "scarf", "drape"], images: ["images/stride.png"] },
    { id: 29, title: "", category: "clothing", gender: "both", tags: ["bandhani", "tiedye", "pattern"], images: ["images/crouch.png"] },
    { id: 30, title: "", category: "clothing", gender: "male", tags: ["chikan", "lucknow", "white"], images: ["images/jump.png"] },
    { id: 31, title: "", category: "heritage places", gender: "none", tags: ["temple", "ancient", "stone"], images: ["images/stairs.png"] },
    { id: 32, title: "", category: "heritage places", gender: "none", tags: ["fort", "medieval", "wall"], images: ["images/crossed.png"] },
    { id: 33, title: "", category: "heritage places", gender: "both", tags: ["palace", "royal", "architecture"], images: ["images/profile.png"] },
    { id: 34, title: "", category: "heritage places", gender: "none", tags: ["monument", "memorial", "historic"], images: ["images/hip.png"] },
    { id: 35, title: "", category: "heritage places", gender: "none", tags: ["ruins", "excavation", "archaeological"], images: ["images/lean.png"] },
    { id: 36, title: "", category: "heritage places", gender: "none", tags: ["stepwell", "water", "gujarat"], images: ["images/men1.png"] },
    { id: 37, title: "", category: "heritage places", gender: "none", tags: ["mosque", "dome", "marble"], images: ["images/stride.png"] },
    { id: 38, title: "", category: "heritage places", gender: "both", tags: ["cave", "painting", "ajanta"], images: ["images/sprint.png"] },
    { id: 39, title: "", category: "heritage places", gender: "none", tags: ["garden", "mughal", "fountain"], images: ["images/pockets_front.png"] },
    { id: 40, title: "", category: "heritage places", gender: "none", tags: ["tower", "minaret", "qutub"], images: ["images/jump.png"] }
];

const GENDER_ENABLED_KEY = 'pickpose_gender_enabled';

// Global app state
let posesData = [];
let activeCategory = 'all';
let activeGender = 'all';
let searchQuery = '';
let favoritePoseIds = [];
let activePoseContext = null;
let activeDifficulty = 'all';
let currentFilteredPoses = []; // To track current list for navigation
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

// Helper: Trigger subtle vibration on mobile devices
function triggerHaptic(duration = 15) {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(duration);
    }
}

async function toggleFavorite(poseDocId) {
    if (!isLoggedIn()) {
        document.getElementById('authModal').classList.remove('hidden');
        return false; // Force user to log in to save favorites
    }

    const uid = auth.currentUser.uid;
    const idx = favoritePoseIds.indexOf(poseDocId);

    if (idx > -1) {
        favoritePoseIds.splice(idx, 1);
        triggerHaptic(10); // Light tap for removing
    } else {
        favoritePoseIds.push(poseDocId);
        triggerHaptic(20); // Stronger tap for adding
    }

    try {
        const favRef = doc(db, "user_favorites", uid);
        await setDoc(favRef, { poses: favoritePoseIds });
        filterCards(); // Update grid natively if filtering by Favorites
    } catch (err) {
        console.error("Failed to save favorite:", err);
    }
    return true;
}

async function loadPosesData() {
    // Show skeletons while loading
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

        // Seed database if empty
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

    // Shuffle the array to provide a varied experience (Requested by USER to avoid bulk uploads appearing together)
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

    // Load data from Firebase
    posesData = await loadPosesData();

    // Gender filter is now always visible via HTML persistent class


    if (grid) {
        renderGrid(posesData, grid);

        // Build filter buttons dynamically from pose categories
        buildFilterButtons(posesData, filterContainer, searchInput);

        // Filter Drawer Toggles (Listeners moved to buildFilterButtons for robustness)
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
                // Reset Gender
                const genderBtns = document.querySelectorAll('#genderFilterContainer .filter-btn');
                genderBtns.forEach(b => b.classList.remove('active'));
                const allGender = document.querySelector('#genderFilterContainer [data-gender="all"]');
                if (allGender) allGender.classList.add('active');
                activeGender = 'all';

                // Reset Difficulty
                const diffBtns = document.querySelectorAll('#difficultyFilterContainer .filter-btn');
                diffBtns.forEach(b => b.classList.remove('active'));
                const allDiff = document.querySelector('#difficultyFilterContainer [data-difficulty="all"]');
                if (allDiff) allDiff.classList.add('active');
                activeDifficulty = 'all';

                filterCards();
            });
        }

        // Setup gender filter listener (Now in drawer)
        const genderBtns = document.querySelectorAll('#genderFilterContainer .filter-btn');
        genderBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.filter-btn');
                genderBtns.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                activeGender = target.dataset.gender;
                // Live update or wait for apply? Let's do live.
                filterCards();
            });
        });

        // Setup difficulty filter listener (Now in drawer)
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


        // Saved Poses Listener moved to buildFilterButtons

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            filterCards();
        });

        // About & Contact Overlay Logic
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
                document.body.style.overflow = 'hidden'; // Stop background scroll
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

        // --- SUBMIT POSE MODAL (FOR USERS) ---
        const btnSubmitPose = document.getElementById('btnSubmitPose');
        const submitPoseModal = document.getElementById('submitPoseModal');
        const closeSubmitPoseModal = document.getElementById('closeSubmitPoseModal');
        const submitPoseModalBg = document.getElementById('submitPoseModalBg');
        const submitPoseForm = document.getElementById('submitPoseForm');
        const submitPoseSuccessMsg = document.getElementById('submitPoseSuccessMsg');

        // New Submission UI Elements
        const btnUserTabFile = document.getElementById('btnUserTabFile');
        const btnUserTabUrl = document.getElementById('btnUserTabUrl');
        const userSourceFileArea = document.getElementById('userSourceFileArea');
        const userSourceUrlArea = document.getElementById('userSourceUrlArea');
        const userPoseDropZone = document.getElementById('userPoseDropZone');
        const userPoseFileInput = document.getElementById('userPoseFileInput');
        const userPosePreviewGrid = document.getElementById('userPosePreviewGrid');
        
        let userUploadedImageData = null; // Store compressed base64

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

        // Tab Switching Logic
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

        // File Selection Logic
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
            const file = files[0]; // Limit to one for users
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

    // 1. Advanced Filters Button (at left)
    const btnToggleFilters = document.createElement('button');
    btnToggleFilters.id = 'btnToggleFilters';
    btnToggleFilters.className = 'nav-icon-btn';
    btnToggleFilters.title = 'Detailed Filters';
    btnToggleFilters.innerHTML = '<i class="fa-solid fa-sliders"></i>';
    container.appendChild(btnToggleFilters);

    // 2. Categories
    const categories = new Set();
    poses.forEach(p => {
        if (p.category) categories.add(p.category.toLowerCase());
    });
    const sortedCategories = Array.from(categories)
        .filter(cat => cat !== 'favorites') // Exclude 'favorites' since we have a custom button for it
        .sort();

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

    // 3. Saved Poses Button (at end of categories row)
    const btnSavedPoses = document.createElement('button');
    btnSavedPoses.id = 'btnSavedPoses';
    btnSavedPoses.className = 'nav-icon-link category-saved-btn';
    btnSavedPoses.title = 'Saved Poses';
    btnSavedPoses.innerHTML = '<i class="fa-solid fa-heart"></i><span>Saved</span>';
    container.appendChild(btnSavedPoses);

    // --- Utility Button Listeners ---
    if (btnToggleFilters) {
        btnToggleFilters.addEventListener('click', () => {
            const filterDrawer = document.getElementById('filterDrawer');
            if (filterDrawer) filterDrawer.classList.toggle('hidden');
        });
    }

    if (btnSavedPoses) {
        btnSavedPoses.addEventListener('click', () => {
            const isClosing = btnSavedPoses.classList.contains('active');
            
            // Clear category filters
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
            // Also deactivate Saved Poses if a category is clicked
            if (btnSavedPoses) btnSavedPoses.classList.remove('active');

            const targetBtn = e.target.closest('.filter-btn');
            targetBtn.classList.add('active');
            activeCategory = targetBtn.dataset.filter;
            filterCards();
        });
    });

    // Difficulty buttons are now exclusively in the Advanced Filter Drawer
}



function filterCards() {
    const grid = document.getElementById('posesGrid');
    if (!grid) return;

    // 1. Filter Data
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
            // "Both" matches "both" explicitly. (In a real app, logic might be more complex)
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
            matchDifficulty = pose.difficulty === activeDifficulty;
        }

        return matchCategory && matchGender && matchSearch && matchDifficulty;
    });

    // 2. Pagination / Paywall limit
    const MAX_LIMIT = 16;
    const isAuth = isLoggedIn();
    const totalCount = filtered.length;

    if (!isAuth && totalCount > MAX_LIMIT) {
        filtered = filtered.slice(0, MAX_LIMIT);
    }

    // 3. Render
    grid.innerHTML = '';
    currentFilteredPoses = filtered; // Update our global list for modal navigation
    
    filtered.forEach(pose => {
        const card = document.createElement('div');
        card.className = 'pose-card';
        const difficulty = pose.difficulty || 'beginner'; // fallback for old data
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

    // 4. Append Paywall if needed
    if (!isAuth && totalCount > MAX_LIMIT) {
        const paywall = document.createElement('div');
        paywall.className = 'paywall-banner';
        paywall.innerHTML = `
            <h4>Want to see more?</h4>
            <p>Sign up to unlock all poses in this category!</p>
            <button onclick="window.openAuthModal('authSignupStep1')">Sign Up Now</button>
        `;
        grid.appendChild(paywall);
    }
}

function renderGrid(data, gridElement) {
    // Initial render is just filtering
    filterCards();
}

function isLoggedIn() {
    return auth.currentUser !== null;
}

let isAuthInitialized = false;

// Expose modal opener globally so inline handlers (like Paywall) work
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

    // Init UI State callback for Firebase
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const favRef = doc(db, "user_favorites", user.uid);
                const snap = await getDoc(favRef);
                if (snap.exists()) {
                    favoritePoseIds = snap.data().poses || [];
                } else {
                    favoritePoseIds = [];
                }
            } catch (e) {
                console.error("Failed to load favorites:", e);
            }
        } else {
            favoritePoseIds = [];
            // If logged out while viewing favorites, switch to 'all'
            if (activeCategory === 'favorites') {
                activeCategory = 'all';
                const filterContainer = document.getElementById('filterContainer');
                if (filterContainer) {
                    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.filter === 'all');
                    });
                }
            }
        }
        isAuthInitialized = true;
        updateHeaderAuthUI();
        filterCards(); // Refresh grid with auth state resolved
    });

    if (!authModal) return;

    // Separate Header Buttons
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
                // Auth state observer handles the UI update
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                alert("Logout failed: " + err.message);
            }
        });
    }

    // Handle Profile Drawer toggle
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

        // Close drawer if clicking elsewhere
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

    // Drawer Menu Navigation
    const btnProfileDetails = document.getElementById('btnProfileDetails');
    const btnDrawerAddPose = document.getElementById('btnDrawerAddPose');
    const btnDrawerAbout = document.getElementById('btnDrawerAbout');
    const btnDrawerContact = document.getElementById('btnDrawerContact');
    const btnDrawerLogout = document.getElementById('btnDrawerLogout');

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

    if (btnDrawerLogout) {
        btnDrawerLogout.addEventListener('click', async () => {
            profileDrawer.classList.add('hidden');
            document.body.style.overflow = '';
            try {
                await signOut(auth);
            } catch (err) {
                alert("Logout failed: " + err.message);
            }
        });
    }

    // Account Details Modal Close
    const profileDetailsModal = document.getElementById('profileDetailsModal');
    const closeProfileDetails = document.getElementById('closeProfileDetails');
    const profileDetailsBg = document.getElementById('profileDetailsBg');

    const closeDetails = () => {
        profileDetailsModal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    if (closeProfileDetails) closeProfileDetails.addEventListener('click', closeDetails);
    if (profileDetailsBg) profileDetailsBg.addEventListener('click', closeDetails);

    // Modal Close
    const closeMod = () => {
        authModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
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
    window.showStep = showStep; // EXPOSE SO openAuthModal CAN DETECT IT

    const showError = (msg, isSuccess = false) => {
        const errEl = document.getElementById('authWizardErrorMsg');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.color = isSuccess ? '#10b981' : 'red';
        errEl.classList.remove('hidden');
    };

    // --- HANDLE REDIRECT RESULT (FOR MOBILE) ---
    getRedirectResult(auth)
        .then(async (result) => {
            if (result && result.user) {
                const user = result.user;
                // Create profile if new
                const userRef = doc(db, "users", user.uid);
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                    await setDoc(userRef, {
                        username: user.email.split('@')[0],
                        email: user.email,
                        createdAt: new Date()
                    });
                }
                closeMod();
            }
        })
        .catch((error) => {
            console.error("Redirect Auth Error:", error);
            if (error.code !== 'auth/web-storage-unsupported') {
                showError("Login failed: " + error.message);
            }
        });

    // Mode Selection
    document.getElementById('btnGoToLogin').addEventListener('click', () => showStep('authStepLogin'));
    document.getElementById('btnGoToSignup').addEventListener('click', () => showStep('authSignupStep1'));
    document.getElementById('btnBackToMenuLogin')?.addEventListener('click', () => showStep('authModeSelection'));
    document.getElementById('btnBackToMenuSignup')?.addEventListener('click', () => showStep('authModeSelection'));

    // --- GOOGLE LOGIN ---
    document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        // Request additional scopes if needed
        provider.addScope('profile');
        provider.addScope('email');

        showError("", true);
        const btn = document.getElementById('btnGoogleLogin');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connecting...`;

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        try {
            if (isMobile) {
                // Redirect is more reliable on mobile to avoid popup blockers
                await signInWithRedirect(auth, provider);
            } else {
                // Popup is better for desktop UX
                const result = await signInWithPopup(auth, provider);
                const user = result.user;

                // Check if user exists in Firestore, if not create a basic profile
                const userRef = doc(db, "users", user.uid);
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                    await setDoc(userRef, {
                        username: user.email.split('@')[0],
                        email: user.email,
                        createdAt: new Date()
                    });
                }
                closeMod();
            }
        } catch (error) {
            console.error("Google Auth Error:", error);
            let userMsg = error.message;
            
            if (error.code === 'auth/popup-blocked') {
                userMsg = "Pop-up blocked! Please allow pop-ups for this site or try on a different browser.";
            } else if (error.code === 'auth/operation-not-allowed') {
                userMsg = "Google login is not enabled in Firebase. Please contact the administrator.";
            } else if (error.code === 'auth/unauthorized-domain') {
                userMsg = "This domain is not authorized in Firebase. Please add '" + window.location.hostname + "' to authorized domains.";
            } else if (error.code === 'auth/cancelled-popup-request') {
                userMsg = "Login cancelled.";
            }

            showError("Google Sign-In failed: " + userMsg);
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    });

    // --- LOGIN FLOW ---
    document.getElementById('btnLoginSubmit').addEventListener('click', async () => {
        const identifier = document.getElementById('loginIdentifier').value.trim();
        const pwd = document.getElementById('loginPassword').value;
        if (!identifier || pwd.length < 6) return showError("Please enter valid credentials.");

        const btn = document.getElementById('btnLoginSubmit');
        btn.disabled = true; btn.textContent = "Logging in...";
        showError("", true); // clear

        try {
            let userEmail = identifier;
            // If they entered a username (no @), look up their email in Firestore
            if (!identifier.includes('@')) {
                const q = query(collection(db, "users"), where("username", "==", identifier));
                const snap = await getDocs(q);
                if (snap.empty) throw new Error("Username not found.");
                userEmail = snap.docs[0].data().email;
            }

            // Execute Login
            await signInWithEmailAndPassword(auth, userEmail, pwd);
            closeMod();
        } catch (error) {
            showError("Login failed: " + error.message);
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
            // Generate 6 digit OTP
            pendingOtp = Math.floor(100000 + Math.random() * 900000).toString();
            wizardData.email = email;

            // Calculate expiry time (15 mins from now) for the email template
            const expiryTime = new Date();
            expiryTime.setMinutes(expiryTime.getMinutes() + 15);
            const timeString = expiryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Send via EmailJS using user keys
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
        document.getElementById('btnSignupSendOtp').click(); // trigger resend
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

    // Step 4: Finalize Signup (Check Username + Create Auth)
    document.getElementById('btnSignupFinal').addEventListener('click', async () => {
        const uname = document.getElementById('signupUsername').value.trim();
        if (!uname || uname.length < 3) return showError("Username must be at least 3 chars.");

        const btn = document.getElementById('btnSignupFinal');
        btn.disabled = true; btn.textContent = "Creating Account...";
        showError("", true);

        try {
            // 1. Check if username is taken in Firestore
            const q = query(collection(db, "users"), where("username", "==", uname));
            const snap = await getDocs(q);
            if (!snap.empty) throw new Error("Username already taken! Please pick another.");

            // 2. Create Firebase Account
            const newCred = await createUserWithEmailAndPassword(auth, wizardData.email, wizardData.password);

            // 3. Save to Firestore
            await setDoc(doc(db, "users", newCred.user.uid), {
                username: uname,
                email: wizardData.email,
                createdAt: new Date()
            });

            closeMod();
        } catch (error) {
            showError("Signup failed: " + error.message);
        }
        btn.disabled = false; btn.textContent = "Complete Signup!";
    });
}

function updateHeaderAuthUI() {
    const btnLogin = document.getElementById('btnNavLogin');
    const btnSignup = document.getElementById('btnNavSignup');
    const userIcon = document.getElementById('userProfileIcon');
    const btnAbout = document.getElementById('btnAbout');
    const btnContact = document.getElementById('btnContact');
    const btnSubmitPose = document.getElementById('btnSubmitPose');
    const btnSubmitPoseMobile = document.getElementById('btnSubmitPoseMobile');

    if (!btnLogin) return;

    if (isLoggedIn()) {
        btnLogin.classList.add('hidden');
        btnSignup.classList.add('hidden');
        if (userIcon) userIcon.classList.remove('hidden');
        if (btnSubmitPose) btnSubmitPose.classList.remove('hidden');
        if (btnSubmitPoseMobile) btnSubmitPoseMobile.classList.remove('hidden');
        
        // Hide About/Contact from navbar when logged in (Consolidated to profile menu)
        if (btnAbout) btnAbout.classList.add('hidden');
        if (btnContact) btnContact.classList.add('hidden');

        // Populate Drawer Info
        const user = auth.currentUser;
        const profileEmail = document.getElementById('profileEmail');
        const profileUsername = document.getElementById('profileUsername');
        
        if (profileEmail) profileEmail.textContent = user.email;
        if (profileUsername) {
            // Try to get username from Firestore
            const userRef = doc(db, "users", user.uid);
            getDoc(userRef).then(snap => {
                if (snap.exists()) {
                    profileUsername.textContent = snap.data().username || user.email.split('@')[0];
                } else {
                    profileUsername.textContent = user.email.split('@')[0];
                }
            });
        }
    } else {
        btnLogin.classList.remove('hidden');
        btnSignup.classList.remove('hidden');
        if (userIcon) userIcon.classList.add('hidden');
        if (btnSubmitPose) btnSubmitPose.classList.add('hidden');
        if (btnSubmitPoseMobile) btnSubmitPoseMobile.classList.add('hidden');
        
        // Show About/Contact for guests
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
    
    // Member since
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().createdAt) {
            const date = snap.data().createdAt.toDate ? snap.data().createdAt.toDate() : new Date(snap.data().createdAt);
            document.getElementById('detailJoined').textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            document.getElementById('detailJoined').textContent = "Unknown";
        }
    } catch(e) {
        document.getElementById('detailJoined').textContent = "Error loading";
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// --- MODAL & 360 SPIN LOGIC ---
let isDragging = false;
let startX = 0;
let currentFrame = 0;
let activePoseImages = [];

function setupModal() {
    const modal = document.getElementById('poseModal');
    const modalImg = document.getElementById('modalImg');
    const closeModalBtn = document.getElementById('closeModal');
    const imgWrapper = document.querySelector('.modal-image-wrapper');
    const shareMenu = document.getElementById('shareMenu');
    const btnShare = document.getElementById('btnShare');
    const closeShareMenu = document.getElementById('closeShareMenu');

    const hideModal = () => {
        modal.classList.add('hidden');
        shareMenu.classList.add('hidden');
        document.body.style.overflow = 'auto';
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

    // Platform-specific share handlers
    document.querySelectorAll('.share-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!activePoseContext) return;
            const platform = btn.dataset.platform;
            const shareUrl = window.location.href; // In production this would be the specific pose URL
            const shareText = `Check out this pose on PickPose: ${activePoseContext.title || 'Untitled Pose'}`;
            const imageUrl = activePoseContext.images[0];

            // Use Web Share API if on mobile and platform isn't 'copy'
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

            // Fallback intent URLs or Copy Link
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
                    // Instagram doesn't have a direct share URL for web. We'll copy link as fallback.
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

    // --- Touch Gestures for Mobile ---
    modal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Min swipe distance of 50px
        if (Math.max(absX, absY) > 50) {
            if (absX > absY) {
                // Horizontal Swipe
                if (dx > 0) prevPose();
                else nextPose();
            } else {
                // Vertical Swipe
                if (dy > 100) hideModal(); // Swipe down to close
            }
        }
    }

    function nextPose() {
        const idx = currentFilteredPoses.findIndex(p => p.docId === activePoseContext.docId);
        if (idx !== -1 && idx < currentFilteredPoses.length - 1) {
            openModal(currentFilteredPoses[idx + 1]);
        }
    }

    function prevPose() {
        const idx = currentFilteredPoses.findIndex(p => p.docId === activePoseContext.docId);
        if (idx > 0) {
            openModal(currentFilteredPoses[idx - 1]);
        }
    }

    // Prevent default ghost drag
    modalImg.addEventListener('dragstart', (e) => e.preventDefault());

    imgWrapper.addEventListener('mousedown', (e) => {
        if (activePoseImages.length <= 1) return;
        isDragging = true;
        startX = e.clientX;
        imgWrapper.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || activePoseImages.length <= 1) return;

        const dx = e.clientX - startX;
        const sensitivity = 40;

        if (Math.abs(dx) > sensitivity) {
            const frameShift = dx > 0 ? -1 : 1;
            currentFrame = (currentFrame + frameShift + activePoseImages.length) % activePoseImages.length;
            modalImg.src = activePoseImages[currentFrame];
            startX = e.clientX;
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        imgWrapper.style.cursor = activePoseImages.length > 1 ? 'e-resize' : 'default';
    });

    // Setup Favorite Heart clicking
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

    // Connect previously non-working Info button
    const btnInfo = document.querySelector('.fa-circle-info');
    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            if (activePoseContext) {
                const desc = `Pose Information:\n• Title: ${activePoseContext.title || 'Untitled'}\n• Category: ${activePoseContext.category}\n• Tags: ${activePoseContext.tags ? activePoseContext.tags.join(', ') : 'none'}`;
                alert(desc);
            }
        });
    }

    // Connect previously non-working Edit button
    const btnEdit = document.querySelector('.btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            alert('To edit this pose, please log in to the Admin Dashboard (admin.html).');
        });
    }

    // Connect previously non-working Trash button
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

    activePoseImages = pose.images;
    currentFrame = 0;
    activePoseContext = pose; // Save for heart toggle

    modalImg.src = activePoseImages[currentFrame];
    
    const diff = pose.difficulty || 'beginner';
    modalTitle.innerHTML = `<span>${pose.title || ''}</span> <span class="difficulty-btn ${diff}" style="font-size:10px; padding:3px 8px; margin-left:8px; border-radius:10px;">${diff}</span>`;
    
    document.body.style.overflow = 'hidden';

    // Toggle Heart Icon UI
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

    // Render Clickable Tags
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
                modal.classList.add('hidden'); // Close modal on search
            });
            modalTags.appendChild(span);
        });
    }

    modal.classList.remove('hidden');

    if (activePoseImages.length > 1) {
        imgWrapper.style.cursor = 'e-resize';
        modalTitle.textContent = pose.title + " 🔄";
    } else {
        imgWrapper.style.cursor = 'default';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initPickpose();
    setupModal();
});

// ============================================================
// IMAGE PROCESSING UTILITIES (PORTED FROM ADMIN)
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
                // 1. Detect faces (simulated for user side if not loaded)
                const crop = getSmartCropRectForUser(img.width, img.height, []);

                // 2. Scale cropped region
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
    
    // Bias toward top third for poses if tall
    if (imgAspect <= TARGET_ASPECT) {
        cropY = Math.round((imgH - cropH) * 0.3);
    }
    return { x: cropX, y: cropY, w: cropW, h: cropH };
}

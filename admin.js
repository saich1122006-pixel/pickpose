import { db, auth } from './firebase-config.js';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let adminPoses = [];
let selectedDocIds = new Set();
let uploadedImagesQueue = []; // Array of base64 strings for multi-upload

// List of allowed admin emails
const ADMIN_EMAILS = ['admin@pickpose.com'];

const GENDER_ENABLED_KEY = 'pickpose_gender_enabled';

// --- Default pose data (used on first load to seed DB if empty) ---
const defaultPoses = [
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

// ============================================================
// DATA HELPERS
// ============================================================

function getUniqueCategories(poses) {
    const cats = new Set();
    poses.forEach(p => {
        if (p.category) cats.add(p.category.toLowerCase());
    });
    return Array.from(cats).sort();
}

function populateCategoryList() {
    const cats = getUniqueCategories(adminPoses);
    const datalist = document.getElementById('categoryList');
    if (!datalist) return;
    datalist.innerHTML = '';
    cats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        datalist.appendChild(opt);
    });
}

async function loadPosesData() {
    let poses = [];
    try {
        const querySnapshot = await getDocs(collection(db, "poses"));
        querySnapshot.forEach((docSnap) => {
            poses.push({ docId: docSnap.id, ...docSnap.data() });
        });

        if (poses.length === 0) {
            console.log("Seeding database defaults from admin...");
            for (const p of defaultPoses) {
                await addDoc(collection(db, "poses"), p);
                poses.push(p);
            }
        }
    } catch (error) {
        console.error("Firestore Error:", error);
        alert("Database connection failed. Please ensure Firebase Firestore is enabled in your project console! Error: " + error.message);
    }

    return poses.sort((a,b) => b.id - a.id);
}

function getNextId(poses) {
    if (poses.length === 0) return 1;
    return Math.max(...poses.map(p => p.id)) + 1;
}

// ============================================================
// AUTH
// ============================================================

function isLoggedIn() {
    return auth.currentUser !== null;
}

// ============================================================
// TOAST
// ============================================================

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    toastMsg.textContent = msg;
    toast.classList.remove('hidden', 'error');
    if (isError) toast.classList.add('error');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================================
// RENDER ADMIN GRID
// ============================================================

function renderAdminGrid() {
    const grid = document.getElementById('adminGrid');
    const searchVal = document.getElementById('adminSearch').value.toLowerCase().trim();
    const catFilter = document.getElementById('adminCategoryFilter').value;
    
    const poses = adminPoses;

    const filtered = poses.filter(p => {
        // 1. Category Filter Match
        const matchCategory = (catFilter === 'all' || (p.category && p.category.toLowerCase() === catFilter.toLowerCase()));
        
        // 2. Search Filter Match
        let matchSearch = true;
        if (searchVal) {
            const title = (p.title || '').toLowerCase();
            const category = (p.category || '').toLowerCase();
            const tags = p.tags ? p.tags.join(' ').toLowerCase() : '';
            matchSearch = title.includes(searchVal) || category.includes(searchVal) || tags.includes(searchVal);
        }

        return matchCategory && matchSearch;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color: var(--admin-text-muted);">
            <i class="fa-solid fa-inbox" style="font-size:40px; margin-bottom:12px; display:block;"></i>
            No poses found.
        </div>`;
        updateBulkBar();
        return;
    }

    filtered.forEach(pose => {
        const card = document.createElement('div');
        card.className = 'admin-card' + (selectedDocIds.has(pose.docId) ? ' selected' : '');
        card.innerHTML = `
            <input type="checkbox" class="card-select-checkbox" data-docid="${pose.docId}" ${selectedDocIds.has(pose.docId) ? 'checked' : ''}>
            <img class="admin-card-img" src="${pose.images[0]}" alt="${pose.title}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%231a1a23%22 width=%22200%22 height=%22200%22/><text fill=%22%238888a0%22 font-family=%22sans-serif%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22>No Image</text></svg>'">
            <div class="admin-card-body">
                <div class="admin-card-title">${pose.title || 'Untitled Pose'}</div>
                <div class="admin-card-category">${pose.category}${pose.gender && pose.gender !== 'none' ? ` &bull; ${pose.gender}` : ''}</div>
                <div class="admin-card-actions">
                    <button class="btn-edit-card" data-docid="${pose.docId}">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button class="btn-delete-card" data-docid="${pose.docId}">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Checkbox click
    grid.querySelectorAll('.card-select-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            const docId = cb.dataset.docid;
            if (cb.checked) {
                selectedDocIds.add(docId);
                cb.closest('.admin-card').classList.add('selected');
            } else {
                selectedDocIds.delete(docId);
                cb.closest('.admin-card').classList.remove('selected');
            }
            updateBulkBar();
        });
    });

    // Attach edit listeners
    grid.querySelectorAll('.btn-edit-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(btn.dataset.docid);
        });
    });

    // Attach delete listeners
    grid.querySelectorAll('.btn-delete-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingDeleteDocId = btn.dataset.docid;
            pendingBulkDelete = false;
            document.getElementById('deleteModal').querySelector('h3').textContent = 'Delete Pose?';
            document.getElementById('deleteModal').querySelector('p').textContent = 'This action cannot be undone. The pose will be permanently removed from your gallery.';
            document.getElementById('deleteModal').classList.remove('hidden');
        });
    });

    updateStats(poses);
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('selectedCount');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const selectAllCb = document.getElementById('selectAllCheckbox');

    if (adminPoses.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    bar.classList.remove('hidden');
    const count = selectedDocIds.size;
    countEl.textContent = count === 0 ? 'None selected' : `${count} selected`;
    bulkDeleteBtn.disabled = count === 0;
    selectAllCb.checked = count > 0 && count === adminPoses.length;
}

function updateStats(poses) {
    document.getElementById('totalPoses').textContent = poses.length;
    document.getElementById('malePoses').textContent = poses.filter(p => p.gender === 'male' || p.gender === 'both').length;
    document.getElementById('femalePoses').textContent = poses.filter(p => p.gender === 'female' || p.gender === 'both').length;
}

function populateAdminCategoryFilter() {
    const select = document.getElementById('adminCategoryFilter');
    if (!select) return;
    
    // Save current selection
    const currentSelection = select.value;
    
    // Clear existing except "All"
    select.innerHTML = '<option value="all">All Categories</option>';
    
    const categories = new Set();
    adminPoses.forEach(p => {
        if (p.category) categories.add(p.category.toLowerCase());
    });
    
    Array.from(categories).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        select.appendChild(opt);
    });
    
    // Restore selection if it still exists
    if (Array.from(categories).includes(currentSelection)) {
        select.value = currentSelection;
    }
}

// ============================================================
// INIT
// ============================================================

let pendingDeleteDocId = null;
let pendingEditDocId = null;
let pendingBulkDelete = false;
let uploadedImageData = null;

function openEditModal(docId) {
    const pose = adminPoses.find(p => p.docId === docId);
    if (!pose) return;

    pendingEditDocId = docId;
    document.getElementById('editPoseTags').value = pose.tags ? pose.tags.join(', ') : '';
    document.getElementById('editModal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('adminDashboard');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    // Check if already logged in via Firebase Auth
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Role verification: check if the logged in user is an admin
            if (!ADMIN_EMAILS.includes(user.email)) {
                // Not an admin, sign them out and show error
                await signOut(auth);
                loginError.style.color = 'var(--admin-danger)';
                loginError.textContent = "Access Denied: You do not have administrator privileges.";
                loginError.classList.remove('hidden');
                setTimeout(() => loginError.classList.add('hidden'), 5000);
                
                dashboard.classList.add('hidden');
                loginScreen.classList.remove('hidden');
                return;
            }

            loginScreen.classList.add('hidden');
            dashboard.classList.remove('hidden');
            
            // Load from Firebase
            adminPoses = await loadPosesData();
            populateAdminCategoryFilter();
            renderAdminGrid();
            populateCategoryList();
        } else {
            dashboard.classList.add('hidden');
            loginScreen.classList.remove('hidden');
        }
    });

    // Settings Toggle
    const genderToggle = document.getElementById('toggleGenderFilter');
    if (genderToggle) {
        genderToggle.checked = localStorage.getItem(GENDER_ENABLED_KEY) === 'true';
        genderToggle.addEventListener('change', (e) => {
            localStorage.setItem(GENDER_ENABLED_KEY, e.target.checked);
            showToast('Settings saved');
        });
    }

    // --- SELECT ALL ---
    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
        if (e.target.checked) {
            adminPoses.forEach(p => selectedDocIds.add(p.docId));
        } else {
            selectedDocIds.clear();
        }
        renderAdminGrid(document.getElementById('adminSearch').value.toLowerCase());
    });

    // --- BULK DELETE ---
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
        const count = selectedDocIds.size;
        if (count === 0) return;
        pendingBulkDelete = true;
        document.getElementById('deleteModal').querySelector('h3').textContent = `Delete ${count} Pose${count > 1 ? 's' : ''}?`;
        document.getElementById('deleteModal').querySelector('p').textContent = `This will permanently delete ${count} pose${count > 1 ? 's' : ''} from your gallery. This cannot be undone.`;
        document.getElementById('deleteModal').classList.remove('hidden');
    });

    // --- LOGIN ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        const btn = loginForm.querySelector('.btn-login');
        btn.textContent = 'Authenticating...';
        btn.disabled = true;

        try {
            let userEmail = identifier;
            if (!identifier.includes('@')) {
                const q = query(collection(db, "users"), where("username", "==", identifier));
                const snap = await getDocs(q);
                if (snap.empty) throw new Error("Username not found");
                userEmail = snap.docs[0].data().email;
            }

            await signInWithEmailAndPassword(auth, userEmail, pass);
            // onAuthStateChanged handles UI change
        } catch (error) {
            loginError.style.color = 'var(--admin-danger)';
            loginError.textContent = error.message;
            loginError.classList.remove('hidden');
            setTimeout(() => loginError.classList.add('hidden'), 3000);
        }
        btn.textContent = 'Access Dashboard';
        btn.disabled = false;
    });

    // --- LOGOUT ---
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth).then(() => {
            document.getElementById('loginUser').value = '';
            document.getElementById('loginPass').value = '';
        });
    });

    // --- SIDEBAR TABS ---
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-tab]');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tab;

            sidebarLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(tab + 'Tab').classList.add('active');

            document.getElementById('pageTitle').textContent =
                tab === 'manage' ? 'Manage Poses' : 'Add New Pose';

            // Close sidebar on mobile
            document.querySelector('.admin-sidebar').classList.remove('open');
        });
    });

    // --- MOBILE MENU TOGGLE ---
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.admin-sidebar').classList.toggle('open');
    });

    // --- SEARCH & FILTER ---
    document.getElementById('adminSearch').addEventListener('input', () => {
        renderAdminGrid();
    });

    document.getElementById('adminCategoryFilter').addEventListener('change', () => {
        renderAdminGrid();
    });

    // --- DELETE MODAL ---
    document.getElementById('cancelDelete').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.add('hidden');
        pendingDeleteDocId = null;
    });

    document.querySelector('.delete-modal-bg').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.add('hidden');
        pendingDeleteDocId = null;
    });

    document.getElementById('confirmDelete').addEventListener('click', async () => {
        const btn = document.getElementById('confirmDelete');
        const oldText = btn.textContent;
        btn.textContent = 'Deleting...';
        btn.disabled = true;

        try {
            if (pendingBulkDelete && selectedDocIds.size > 0) {
                // Bulk delete
                const idsToDelete = [...selectedDocIds];
                for (const docId of idsToDelete) {
                    await deleteDoc(doc(db, "poses", docId));
                    adminPoses = adminPoses.filter(p => p.docId !== docId);
                }
                selectedDocIds.clear();
                showToast(`${idsToDelete.length} pose${idsToDelete.length > 1 ? 's' : ''} deleted`);
            } else if (pendingDeleteDocId !== null) {
                // Single delete
                await deleteDoc(doc(db, "poses", pendingDeleteDocId));
                adminPoses = adminPoses.filter(p => p.docId !== pendingDeleteDocId);
                selectedDocIds.delete(pendingDeleteDocId);
                showToast('Pose deleted successfully');
            }
            renderAdminGrid(document.getElementById('adminSearch').value.toLowerCase());
        } catch (err) {
            showToast('Failed to delete: ' + err.message, true);
        }

        btn.textContent = oldText;
        btn.disabled = false;
        document.getElementById('deleteModal').classList.add('hidden');
        pendingDeleteDocId = null;
        pendingBulkDelete = false;
    });

    // --- EDIT MODAL ---
    document.getElementById('cancelEdit').addEventListener('click', () => {
        document.getElementById('editModal').classList.add('hidden');
        pendingEditDocId = null;
    });

    document.getElementById('editModalBg').addEventListener('click', () => {
        document.getElementById('editModal').classList.add('hidden');
        pendingEditDocId = null;
    });

    document.getElementById('confirmEdit').addEventListener('click', async () => {
        if (!pendingEditDocId) return;

        const btn = document.getElementById('confirmEdit');
        const oldText = btn.textContent;
        const tagsStr = document.getElementById('editPoseTags').value.trim();
        const newTags = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [];

        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            const poseRef = doc(db, "poses", pendingEditDocId);
            await updateDoc(poseRef, { tags: newTags });

            // Update local state
            const pose = adminPoses.find(p => p.docId === pendingEditDocId);
            if (pose) pose.tags = newTags;

            showToast('Tags updated successfully');
            renderAdminGrid(document.getElementById('adminSearch').value.toLowerCase());
            document.getElementById('editModal').classList.add('hidden');
            pendingEditDocId = null;
        } catch (err) {
            showToast('Failed to update: ' + err.message, true);
        }

        btn.textContent = oldText;
        btn.disabled = false;
    });

    // --- IMAGE SOURCE TABS ---
    const sourceTabs = document.querySelectorAll('.source-tab');
    const uploadSource = document.getElementById('uploadSource');
    const urlSource = document.getElementById('urlSource');
    let activeImageSource = 'upload'; // 'upload' or 'url'

    sourceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sourceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeImageSource = tab.dataset.source;

            uploadSource.classList.toggle('active', activeImageSource === 'upload');
            urlSource.classList.toggle('active', activeImageSource === 'url');
        });
    });

    const uploadArea = document.getElementById('uploadArea');
    const poseImage = document.getElementById('poseImage');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');

    uploadArea.addEventListener('click', () => poseImage.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleImageFiles(Array.from(e.dataTransfer.files));
        }
    });

    poseImage.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFiles(Array.from(e.target.files));
        }
    });

    const TARGET_ASPECT = 4 / 5; // Pose card aspect ratio

    // Detect faces using browser's native FaceDetector API
    async function detectFaces(img) {
        if (!('FaceDetector' in window)) return [];
        try {
            const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
            return await detector.detect(img);
        } catch (e) {
            console.log('FaceDetector unavailable:', e.message);
            return [];
        }
    }

    // Calculate smart crop rectangle focused on faces/body
    function getSmartCropRect(imgW, imgH, faces) {
        const imgAspect = imgW / imgH;

        // Already matching aspect ratio (±5%) — no crop needed
        if (Math.abs(imgAspect - TARGET_ASPECT) < 0.05) {
            return { x: 0, y: 0, w: imgW, h: imgH };
        }

        let cropW, cropH, cropX, cropY;

        if (imgAspect > TARGET_ASPECT) {
            // Image is WIDER than 4:5 → crop sides
            cropH = imgH;
            cropW = Math.round(imgH * TARGET_ASPECT);
        } else {
            // Image is TALLER than 4:5 → crop top/bottom
            cropW = imgW;
            cropH = Math.round(imgW / TARGET_ASPECT);
        }

        // Default: center crop
        cropX = Math.round((imgW - cropW) / 2);
        cropY = Math.round((imgH - cropH) / 2);

        if (faces.length > 0) {
            // ── Face-aware crop ──
            // Find bounding box enclosing ALL faces
            let allMinX = Infinity, allMinY = Infinity, allMaxX = 0, allMaxY = 0;
            faces.forEach(f => {
                const b = f.boundingBox;
                allMinX = Math.min(allMinX, b.x);
                allMinY = Math.min(allMinY, b.y);
                allMaxX = Math.max(allMaxX, b.x + b.width);
                allMaxY = Math.max(allMaxY, b.y + b.height);
            });

            const faceCenterX = (allMinX + allMaxX) / 2;
            const faceCenterY = (allMinY + allMaxY) / 2;
            // Estimate full body as ~4x face height below face top
            const faceHeight = allMaxY - allMinY;
            const bodyBottomEstimate = Math.min(allMinY + faceHeight * 4.5, imgH);

            if (imgAspect > TARGET_ASPECT) {
                // Wider image: center crop horizontally on face
                cropX = Math.round(faceCenterX - cropW / 2);
            } else {
                // Taller image: place face in upper 30% of frame
                const idealFaceY = cropH * 0.25;
                cropY = Math.round(faceCenterY - idealFaceY);

                // But also try to include estimated body
                const bodyMargin = bodyBottomEstimate - (cropY + cropH);
                if (bodyMargin > 0) {
                    // Body extends below crop — shift down slightly
                    cropY = Math.round(Math.min(cropY + bodyMargin * 0.5, imgH - cropH));
                }
            }

            // Clamp to image bounds
            cropX = Math.max(0, Math.min(cropX, imgW - cropW));
            cropY = Math.max(0, Math.min(cropY, imgH - cropH));
        } else {
            // ── No face detected: rule-of-thirds upper-center bias ──
            // For poses, the subject is usually in the upper-center
            if (imgAspect <= TARGET_ASPECT) {
                // Taller: bias toward top third
                cropY = Math.round((imgH - cropH) * 0.3);
            }
        }

        return { x: cropX, y: cropY, w: cropW, h: cropH };
    }

    async function compressImage(file, maxWidth = 1200, quality = 0.85) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = async () => {
                    // 1. Detect faces on original image
                    const faces = await detectFaces(img);
                    if (faces.length > 0) {
                        console.log(`🎯 Detected ${faces.length} face(s) — smart cropping`);
                    } else {
                        console.log('📐 No faces detected — using rule-of-thirds crop');
                    }

                    // 2. Calculate smart crop on original dimensions
                    const crop = getSmartCropRect(img.width, img.height, faces);

                    // 3. Scale cropped region to fit maxWidth
                    let outW = crop.w;
                    let outH = crop.h;
                    if (outW > maxWidth) {
                        outH = Math.round((outH * maxWidth) / outW);
                        outW = maxWidth;
                    }

                    // 4. Draw cropped + scaled result
                    const canvas = document.createElement('canvas');
                    canvas.width = outW;
                    canvas.height = outH;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);

                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
            };
        });
    }

    async function handleImageFiles(files) {
        const validFiles = files.filter(f => f.type.startsWith('image/'));
        if (validFiles.length === 0) {
            showToast('Please select image files', true);
            return;
        }

        uploadPlaceholder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><p>AI cropping & compressing ' + validFiles.length + ' image(s)...</p>';

        for (const file of validFiles) {
            const data = await compressImage(file);
            uploadedImagesQueue.push(data);
        }

        renderUploadPreviews();
        uploadPlaceholder.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><p>Click or drag & drop to add more</p><span>Select multiple images at once</span>';
        showToast(`${validFiles.length} image(s) compressed`);
        updateAddBtnText();
    }

    function renderUploadPreviews() {
        const grid = document.getElementById('uploadPreviewGrid');
        grid.innerHTML = '';
        if (uploadedImagesQueue.length === 0) {
            grid.classList.add('hidden');
            return;
        }
        grid.classList.remove('hidden');
        uploadedImagesQueue.forEach((data, idx) => {
            const item = document.createElement('div');
            item.className = 'upload-preview-item';
            item.innerHTML = `
                <img src="${data}" alt="Preview ${idx + 1}">
                <button type="button" class="remove-preview" data-idx="${idx}"><i class="fa-solid fa-xmark"></i></button>
            `;
            grid.appendChild(item);
        });

        // Remove buttons
        grid.querySelectorAll('.remove-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                uploadedImagesQueue.splice(idx, 1);
                renderUploadPreviews();
                updateAddBtnText();
            });
        });
    }

    function updateAddBtnText() {
        const txtEl = document.getElementById('addBtnText');
        if (!txtEl) return;
        const count = uploadedImagesQueue.length;
        txtEl.textContent = count > 1 ? `Add ${count} Poses` : 'Add Pose';
    }

    // --- PASTE URL ---
    const imageUrlInput = document.getElementById('imageUrlInput');
    const loadUrlBtn = document.getElementById('loadUrlBtn');
    const urlPreviewContainer = document.getElementById('urlPreviewContainer');
    const urlPreview = document.getElementById('urlPreview');
    const urlError = document.getElementById('urlError');
    let pastedImageUrl = null;

    async function processImageUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            // Set timeout for image load
            const timeout = setTimeout(() => {
                img.src = ''; // Cancel loading
                reject(new Error("Image request timed out"));
            }, 10000);

            if (url.startsWith('http')) {
                img.crossOrigin = 'Anonymous';
                img.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            } else {
                img.src = url;
            }
            
            img.onload = async () => {
                clearTimeout(timeout);
                try {
                    // Smart face-aware crop
                    const faces = await detectFaces(img);
                    const crop = getSmartCropRect(img.width, img.height, faces);
                    const maxWidth = 1200;

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
                    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } catch (e) {
                    reject(new Error("Image processing failed: " + e.message));
                }
            };
            
            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error("Image inaccessible or invalid"));
            };
        });
    }

    loadUrlBtn.addEventListener('click', async () => {
        let url = imageUrlInput.value.trim();
        if (!url) {
            showToast('Please paste an image URL', true);
            return;
        }

        // Automatically extract direct image link from Google Image Search URLs
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('google.com') && urlObj.pathname.includes('/imgres')) {
                const imgurl = urlObj.searchParams.get('imgurl');
                if (imgurl) {
                    url = imgurl;
                    imageUrlInput.value = url; // Update input field to show the direct link
                }
            }
        } catch (e) {
            // Ignore if it's not a valid URL object
        }

        // Reset state
        urlPreviewContainer.classList.add('hidden');
        urlError.classList.add('hidden');
        pastedImageUrl = null;
        
        const originalBtnText = loadUrlBtn.innerHTML;
        loadUrlBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        loadUrlBtn.disabled = true;

        try {
            const base64Data = await processImageUrl(url);
            pastedImageUrl = base64Data;
            
            urlPreview.onload = () => {
                urlPreviewContainer.classList.remove('hidden');
                showToast('Image loaded and processed!');
                loadUrlBtn.innerHTML = originalBtnText;
                loadUrlBtn.disabled = false;
            };
            urlPreview.src = base64Data;
        } catch (error) {
            console.warn("Proxy compression failed, falling back to direct link:", error);
            
            // Fallback: directly assign raw URL and trust the browser like before
            urlPreview.onload = () => {
                pastedImageUrl = url;
                urlPreviewContainer.classList.remove('hidden');
                showToast('Image loaded (raw link)!');
                loadUrlBtn.innerHTML = originalBtnText;
                loadUrlBtn.disabled = false;
            };
            
            urlPreview.onerror = () => {
                urlPreviewContainer.classList.add('hidden');
                urlError.classList.remove('hidden');
                pastedImageUrl = null;
                showToast('Could not load image. Link may be protected.', true);
                loadUrlBtn.innerHTML = originalBtnText;
                loadUrlBtn.disabled = false;
            };
            
            urlPreview.src = url;
        }

        loadUrlBtn.innerHTML = originalBtnText;
        loadUrlBtn.disabled = false;
    });

    imageUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadUrlBtn.click();
        }
    });

    // --- ADD POSE FORM ---
    document.getElementById('addPoseForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('poseTitle').value.trim();
        const category = document.getElementById('poseCategory').value.toLowerCase().trim();
        
        // Collect tags from checkboxes
        const selectedCheckboxes = document.querySelectorAll('#poseTagsGrid input[type="checkbox"]:checked');
        const gridTags = Array.from(selectedCheckboxes).map(cb => cb.value);
        
        // Collect custom tags
        const customTagsStr = document.getElementById('poseCustomTags').value.trim();
        const customTags = customTagsStr ? customTagsStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [];
        
        // Merge and deduplicate
        const tags = [...new Set([...gridTags, ...customTags])];

        if (!category) {
            showToast('Please enter a category', true);
            return;
        }

        const genderRadio = document.querySelector('input[name="poseGender"]:checked');
        const gender = genderRadio ? genderRadio.value : 'none';

        const difficultyRadio = document.querySelector('input[name="poseDifficulty"]:checked');
        const difficulty = difficultyRadio ? difficultyRadio.value : 'beginner';

        // Collect all images to save
        let imagesToSave = [];
        if (activeImageSource === 'upload') {
            imagesToSave = [...uploadedImagesQueue];
        } else if (activeImageSource === 'url' && pastedImageUrl) {
            imagesToSave = [pastedImageUrl];
        }

        if (imagesToSave.length === 0) {
            showToast('Please add at least one image', true);
            return;
        }

        // Provide visual feedback for upload process
        const submitBtn = document.querySelector('#addPoseForm button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving ${imagesToSave.length} pose${imagesToSave.length > 1 ? 's' : ''}...`;
        submitBtn.disabled = true;

        try {
            let savedCount = 0;
            for (const imageUrl of imagesToSave) {
                const newPose = {
                    id: Date.now() + savedCount,
                    title,
                    category,
                    gender,
                    difficulty,
                    tags: tags.length > 0 ? tags : ['image'],
                    images: [imageUrl]
                };

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Connection timed out. Please verify Firestore is enabled!")), 10000)
                );
                
                const docRef = await Promise.race([
                    addDoc(collection(db, "poses"), newPose),
                    timeoutPromise
                ]);
                
                adminPoses.unshift({ docId: docRef.id, ...newPose });
                savedCount++;
            }
            // Restore button before reset (so addBtnText span exists)
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;

            // Switch to manage tab? Let's stay on add tab if they have more to add, 
            // but the user's previous code switched tabs. I will keep the tab switch for now 
            // as it's the current behavior, but ensure the form remains partially filled.
            
            // Selective reset: Keep metadata, clear images
            resetAddForm(false); 
            showToast(`${savedCount} pose${savedCount > 1 ? 's' : ''} added successfully!`);

            // Switch to manage tab (Optional: you might want to disable this for true bulk flow)
            // sidebarLinks.forEach(l => l.classList.remove('active'));
            // ... (keeping the existing tab switch logic as per current app flow)
            sidebarLinks.forEach(l => l.classList.remove('active'));
            document.querySelector('[data-tab="manage"]').classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById('manageTab').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Manage Poses';
            renderAdminGrid();
            populateCategoryList();

        } catch (error) {
            showToast('Error uploading: ' + error.message, true);
        }

        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    });

    // --- RESET FORM ---
    document.getElementById('resetFormBtn').addEventListener('click', () => resetAddForm(true));

    function resetAddForm(fullReset = true) {
        // If fullReset is true, we clear everything. 
        // If false, we keep the metadata (Title, Category, Tags, Gender, Difficulty)
        
        if (fullReset) {
            document.getElementById('addPoseForm').reset();
            // Clear custom tags and checkboxes explicitly if reset() doesn't hit them
            const customTagsInput = document.getElementById('poseCustomTags');
            if (customTagsInput) customTagsInput.value = '';
            document.querySelectorAll('#poseTagsGrid input[type="checkbox"]').forEach(cb => cb.checked = false);
            
            const noneRadio = document.querySelector('input[name="poseGender"][value="none"]');
            if (noneRadio) noneRadio.checked = true;
            
            const beginnerRadio = document.querySelector('input[name="poseDifficulty"][value="beginner"]');
            if (beginnerRadio) beginnerRadio.checked = true;
        }

        // Always clear Image data on any reset
        uploadedImageData = null;
        uploadedImagesQueue = [];
        pastedImageUrl = null;
        document.getElementById('uploadPreviewGrid').innerHTML = '';
        document.getElementById('uploadPreviewGrid').classList.add('hidden');
        uploadPlaceholder.style.display = '';
        urlPreviewContainer.classList.add('hidden');
        urlPreview.src = '';
        urlError.classList.add('hidden');
        imageUrlInput.value = '';

        // Stay on current source tab or reset? Usually clear image means reset to upload
        // sourceTabs.forEach(t => t.classList.remove('active'));
        // document.querySelector('[data-source="upload"]').classList.add('active');
        // uploadSource.classList.add('active');
        // urlSource.classList.remove('active');
        // activeImageSource = 'upload';

        updateAddBtnText();
    }
});

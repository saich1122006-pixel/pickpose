import { db, auth } from './firebase-config.js';
import { collection, getDocs, getDoc, setDoc, addDoc, deleteDoc, doc, query, where, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let adminPoses = [];
let selectedDocIds = new Set();
let pinnedCategories = []; // Loaded from app_metadata
let uploadedImagesQueue = []; // Array of base64 strings for multi-upload

// List of allowed admin emails
const ADMIN_EMAILS = ['saich@pickpose.app'];

const GENDER_ENABLED_KEY = 'pickpose_gender_enabled';

// No default poses — all content managed via admin panel
const defaultPoses = [];


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

// --- IMAGE ENHANCEMENT ENGINE ---
function applySmartEnhance(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. Color Correction (Vibrance, Contrast, Brightness)
    // We apply these via CSS filters on the canvas context for high performance
    ctx.filter = 'contrast(1.15) saturate(1.15) brightness(1.03)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none'; // Reset filter

    // 2. Convolution Sharpening (High Performance 3x3 Matrix)
    const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const side = Math.round(Math.sqrt(weights.length));
    const halfSide = Math.floor(side / 2);
    const src = ctx.getImageData(0, 0, w, h);
    const sw = src.width;
    const sh = src.height;
    const srcData = src.data;
    const dst = ctx.createImageData(w, h);
    const dstData = dst.data;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const sy = y;
            const sx = x;
            const dstOff = (y * w + x) * 4;
            let r = 0, g = 0, b = 0;

            for (let cy = 0; cy < side; cy++) {
                for (let cx = 0; cx < side; cx++) {
                    const scy = sy + cy - halfSide;
                    const scx = sx + cx - halfSide;
                    if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
                        const srcOff = (scy * sw + scx) * 4;
                        const wt = weights[cy * side + cx];
                        r += srcData[srcOff] * wt;
                        g += srcData[srcOff + 1] * wt;
                        b += srcData[srcOff + 2] * wt;
                    }
                }
            }
            dstData[dstOff] = r;
            dstData[dstOff + 1] = g;
            dstData[dstOff + 2] = b;
            dstData[dstOff + 3] = srcData[dstOff + 3]; // Keep alpha
        }
    }
    ctx.putImageData(dst, 0, 0);
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

async function updateStats(poses) {
    document.getElementById('totalPoses').textContent = poses.length;
    document.getElementById('malePoses').textContent = poses.filter(p => p.gender === 'male' || p.gender === 'both').length;
    document.getElementById('femalePoses').textContent = poses.filter(p => p.gender === 'female' || p.gender === 'both').length;

    // Fetch Global Stats (Views/Installs)
    try {
        const statsSnap = await getDoc(doc(db, "stats", "global"));
        if (statsSnap.exists()) {
            const data = statsSnap.data();
            document.getElementById('statTotalViews').textContent = data.views || 0;
            document.getElementById('statAppInstalls').textContent = data.installs || 0;
        }

        // --- NEW: USER ANALYTICS ---
        const usersSnap = await getDocs(collection(db, "users"));
        document.getElementById('statTotalUsers').textContent = usersSnap.size;

        // Online Now (Active in last 5 minutes)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const qOnline = query(collection(db, "users"), where("lastActive", ">=", fiveMinsAgo));
        const onlineSnap = await getDocs(qOnline);
        document.getElementById('statOnlineUsers').textContent = onlineSnap.size;

    } catch (e) {
        console.warn("Error fetching global/user stats:", e);
    }
}

// Auto-refresh user stats every 60 seconds
setInterval(() => {
    if (adminPoses.length > 0) updateStats(adminPoses);
}, 60000);

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
            
            // Load Category Priority
            try {
                const catSnap = await getDoc(doc(db, "app_metadata", "categories"));
                if (catSnap.exists()) {
                    pinnedCategories = catSnap.data().priorityOrder || [];
                }
            } catch (err) {
                console.error("Failed to load category priority:", err);
            }

            document.getElementById('btnPushUpdate')?.addEventListener('click', async () => {
        const msg = document.getElementById('updateMessage').value.trim();
        const btn = document.getElementById('btnPushUpdate');
        
        if (!msg) {
            showToast('Please enter an update message', true);
            return;
        }

        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pushing...';
        btn.disabled = true;

        try {
            const version = Date.now().toString(); // Simple unique version based on timestamp
            await setDoc(doc(db, "app_metadata", "broadcast"), {
                version: version,
                message: msg,
                timestamp: new Date().toISOString()
            });
            
            showToast('Update Broadcasted to all users! 📣');
            document.getElementById('updateMessage').value = '';
        } catch (err) {
            console.error("Broadcast failed:", err);
            showToast('Broadcast failed: ' + err.message, true);
        }

        btn.innerHTML = oldText;
        btn.disabled = false;
    });

    // --- CATEGORY MANAGER LOGIC ---
    function renderCategoryManager() {
        const pinnedList = document.getElementById('pinnedCategoryList');
        const allList = document.getElementById('allCategoryList');
        if (!pinnedList || !allList) return;

        // Get all unique categories from poses
        const availableCategories = Array.from(new Set(adminPoses.map(p => p.category?.toLowerCase()).filter(c => c)));
        availableCategories.sort();

        // 1. Render Pinned
        pinnedList.innerHTML = '';
        if (pinnedCategories.length === 0) {
            pinnedList.innerHTML = '<p class="empty-msg" style="color: var(--text-muted); font-size: 13px;">No pinned categories yet.</p>';
        } else {
            pinnedCategories.forEach((cat, index) => {
                const item = document.createElement('div');
                item.className = 'category-item';
                item.innerHTML = `
                    <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    <div class="category-controls">
                        <button class="btn-cat-action move-up" data-index="${index}" title="Move Up"><i class="fa-solid fa-chevron-up"></i></button>
                        <button class="btn-cat-action move-down" data-index="${index}" title="Move Down"><i class="fa-solid fa-chevron-down"></i></button>
                        <button class="btn-cat-action unpin" data-cat="${cat}" title="Unpin"><i class="fa-solid fa-thumbtack-slash"></i></button>
                    </div>
                `;
                pinnedList.appendChild(item);
            });
        }

        // 2. Render Available (excluding those already pinned)
        allList.innerHTML = '';
        const unpinned = availableCategories.filter(c => !pinnedCategories.includes(c));
        if (unpinned.length === 0) {
            allList.innerHTML = '<p class="empty-msg" style="color: var(--text-muted); font-size: 13px;">All categories are pinned.</p>';
        } else {
            unpinned.forEach(cat => {
                const item = document.createElement('div');
                item.className = 'category-item';
                item.innerHTML = `
                    <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    <div class="category-controls">
                        <button class="btn-cat-action pin" data-cat="${cat}" title="Pin to Top"><i class="fa-solid fa-thumbtack"></i></button>
                    </div>
                `;
                allList.appendChild(item);
            });
        }

        // --- EVENT DELEGATION FOR CATEGORIES ---
        // Moved to a more stable logic: we use the container and only verify once.
        // The previous check might fail if the element is re-rendered by different tabs.
        setupCategoryListeners();
    }

    function setupCategoryListeners() {
        const pinnedList = document.getElementById('pinnedCategoryList');
        const allList = document.getElementById('allCategoryList');
        if (!pinnedList || !allList) return;

        // Ensure we only attach once globally
        if (window.categoryListenersAttached) return;
        window.categoryListenersAttached = true;

        pinnedList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-cat-action');
            if (!btn) return;

            const cat = btn.dataset.cat?.toLowerCase().trim();
            if (btn.classList.contains('unpin')) {
                pinnedCategories = pinnedCategories.filter(c => c.toLowerCase().trim() !== cat);
                saveCategoryPriority();
            } else if (btn.classList.contains('move-up')) {
                const idx = parseInt(btn.dataset.index);
                if (idx > 0) {
                    [pinnedCategories[idx], pinnedCategories[idx-1]] = [pinnedCategories[idx-1], pinnedCategories[idx]];
                    saveCategoryPriority();
                }
            } else if (btn.classList.contains('move-down')) {
                const idx = parseInt(btn.dataset.index);
                if (idx < pinnedCategories.length - 1) {
                    [pinnedCategories[idx], pinnedCategories[idx+1]] = [pinnedCategories[idx+1], pinnedCategories[idx]];
                    saveCategoryPriority();
                }
            }
        });

        allList.addEventListener('click', (e) => {
            const btn = e.target.closest('.pin');
            if (!btn) return;
            
            const catToPin = btn.dataset.cat?.toLowerCase().trim();
            if (catToPin && !pinnedCategories.some(c => c.toLowerCase().trim() === catToPin)) {
                pinnedCategories.push(catToPin);
                saveCategoryPriority();
            }
        });
    }

    async function saveCategoryPriority() {
        renderCategoryManager();
        try {
            await setDoc(doc(db, "app_metadata", "categories"), {
                priorityOrder: pinnedCategories,
                updatedAt: new Date().toISOString()
            });
            showToast('Category priority updated! 🏷️');
            
            // Also update the version in broadcast to trigger a refresh in users' browsers if needed
            // (Optional, but ensures users see the new order immediately)
        } catch (err) {
            console.error("Save failed:", err);
            showToast("Failed to save order", true);
        }
    }

    // --- TAB SWITCH ENGINE ---
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tab;
            
            // UI
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${tab}Tab`).classList.add('active');
            
            document.getElementById('pageTitle').textContent = link.querySelector('span').textContent;

            if (tab === 'categories') renderCategoryManager();
        });
    });

    // Sign out from top bar
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

            const pageTitle = document.getElementById('pageTitle');
            if (tab === 'manage') pageTitle.textContent = 'Manage Poses';
            else if (tab === 'add') pageTitle.textContent = 'Add New Pose';
            else if (tab === 'pending') {
                pageTitle.textContent = 'Pending Submissions';
                loadPendingPoses();
            }
            else if (tab === 'messages') {
                pageTitle.textContent = 'Visitor Messages';
                loadMessages();
            }

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



    async function compressImage(file, maxWidth = 1800, quality = 0.92) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = async () => {
                    // No crop - use full dimensions to preserve natural aspect ratio
                    let outW = img.width;
                    let outH = img.height;
                    
                    if (outW > maxWidth) {
                        outH = Math.round((outH * maxWidth) / outW);
                        outW = maxWidth;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = outW;
                    canvas.height = outH;
                    const ctx = canvas.getContext('2d');
                    
                    // Draw the entire image, scaled but not cropped
                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, outW, outH);

                    // Apply Smart Enhance if enabled
                    const isEnhanceEnabled = document.getElementById('smartEnhanceToggle')?.checked;
                    if (isEnhanceEnabled) {
                        applySmartEnhance(canvas);
                    }

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

        uploadPlaceholder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><p>Optimizing ' + validFiles.length + ' image(s)...</p>';

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
                    // No crop - use full dimensions for natural aspect ratio
                    const maxWidth = 1800;
                    let outW = img.width;
                    let outH = img.height;
                    
                    if (outW > maxWidth) {
                        outH = Math.round((outH * maxWidth) / outW);
                        outW = maxWidth;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = outW;
                    canvas.height = outH;
                    const ctx = canvas.getContext('2d');
                    
                    // Draw entire image scaled but not cropped
                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, outW, outH);

                    // Apply Smart Enhance if enabled
                    const isEnhanceEnabled = document.getElementById('smartEnhanceToggle')?.checked;
                    if (isEnhanceEnabled) {
                        applySmartEnhance(canvas);
                    }

                    resolve(canvas.toDataURL('image/jpeg', 0.90));
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
// ============================================================
// MODERATION & MESSAGES LOGIC
// ============================================================

async function loadPendingPoses() {
    const grid = document.getElementById('pendingGrid');
    grid.innerHTML = '<div class="loader-placeholder">Loading submissions...</div>';
    
    try {
        const q = query(collection(db, "pending_poses"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        grid.innerHTML = '';
        
        if (snap.empty) {
            grid.innerHTML = '<div class="empty-state">No pending submissions.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'admin-card pending';
            card.innerHTML = `
                <div class="pending-badge">Pending</div>
                <div class="admin-card-img"><img src="${data.images[0]}" alt="Pending"></div>
                <div class="admin-card-info">
                    <div class="admin-card-title">User: ${data.userEmail || 'Guest'}</div>
                    <div class="admin-card-meta">${data.category} | ${data.tags.join(', ')}</div>
                </div>
                <div class="admin-card-actions">
                    <button class="btn-approve" data-id="${docSnap.id}">Approve</button>
                    <button class="btn-delete" data-id="${docSnap.id}">Reject</button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (err) {
        console.error("Load Pending failed:", err);
        if (err.message && err.message.includes("index")) {
            grid.innerHTML = `<div class="error-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Sorting error: You need to create a Firestore index for this collection. Check the browser console (F12) for the setup link.</p>
            </div>`;
        } else {
            grid.innerHTML = '<div class="error-state">Failed to load submissions.</div>';
        }
    }
}

async function approvePose(docId) {
    console.log("Approving pose:", docId);
    if (!confirm("Approve this pose and move it to the public gallery?")) return;
    
    try {
        const ref = doc(db, "pending_poses", docId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            console.error("Pending pose not found:", docId);
            return;
        }
        
        const data = snap.data();
        const finalPose = {
            images: data.images,
            category: data.category,
            gender: data.gender,
            tags: data.tags,
            title: data.title || "",
            difficulty: data.difficulty || "beginner",
            createdAt: new Date()
        };

        await addDoc(collection(db, "poses"), finalPose);
        await deleteDoc(ref);
        
        alert("Pose approved and published!");
        loadPendingPoses();
    } catch (err) {
        console.error("Approval failed:", err);
        alert("Error approving pose.");
    }
}

async function rejectPose(docId) {
    console.log("Rejecting pose:", docId);
    if (!confirm("Are you sure you want to reject and delete this submission?")) return;
    try {
        await deleteDoc(doc(db, "pending_poses", docId));
        console.log("Pose rejected:", docId);
        loadPendingPoses();
    } catch (err) {
        console.error("Reject failed:", err);
        alert("Delete failed.");
    }
}

async function loadMessages() {
    const grid = document.getElementById('messagesGrid');
    grid.innerHTML = '<div class="loader-placeholder">Loading messages...</div>';
    
    try {
        const q = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        grid.innerHTML = '';
        
        if (snap.empty) {
            grid.innerHTML = '<div class="empty-state">No messages yet.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Just now';
            const card = document.createElement('div');
            card.className = 'message-card';
            card.innerHTML = `
                <div class="message-header">
                    <div class="message-sender">
                        <span class="sender-name">${data.name}</span>
                        <span class="sender-email">${data.email}</span>
                    </div>
                    <span class="message-time">${date}</span>
                </div>
                <div class="message-body">${data.message}</div>
                <div class="message-actions">
                    <a href="mailto:${data.email}" class="btn-reply"><i class="fa-solid fa-reply"></i> Reply</a>
                    <button class="btn-delete" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (err) {
        console.error("Load Messages failed:", err);
        if (err.message && err.message.includes("index")) {
            grid.innerHTML = `<div class="error-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Inbox index missing. Check console for setup link.</p>
            </div>`;
        } else {
            grid.innerHTML = '<div class="error-state">Failed to load messages.</div>';
        }
    }
}

async function deleteMessage(docId) {
    console.log("Deleting message:", docId);
    if (!confirm("Delete this message?")) return;
    try {
        await deleteDoc(doc(db, "contact_messages", docId));
        console.log("Message deleted:", docId);
        loadMessages();
    } catch (err) {
        console.error("Delete message failed:", err);
        alert("Delete failed.");
    }
}

// ============================================================
// EVENT DELEGATION FOR MODERATION
// ============================================================
document.getElementById('pendingGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.id) return;
    
    const docId = btn.dataset.id;
    if (btn.classList.contains('btn-approve')) {
        approvePose(docId);
    } else if (btn.classList.contains('btn-delete')) {
        rejectPose(docId);
    }
});

document.getElementById('messagesGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.id) return;
    
    const docId = btn.dataset.id;
    if (btn.classList.contains('btn-delete')) {
        deleteMessage(docId);
    }
});

// --- ADMIN SHARING CENTER ---
// Use the custom Firebase Hosting URL if on localhost or use window.location.origin
const PRODUCTION_URL = "https://pickpose.app";
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const APP_URL = IS_LOCAL ? PRODUCTION_URL : window.location.origin + window.location.pathname.replace('admin.html', 'index.html');

const INVITE_MESSAGE = `Elevate your photography with PickPose. Access a curated gallery of professional poses directly on your device. Download the official app now: ${APP_URL}/install 📸✨`;

document.getElementById('btnCopyAppLink')?.addEventListener('click', () => {
    navigator.clipboard.writeText(INVITE_MESSAGE).then(() => {
        showToast("Invitation copied to clipboard!");
    });
});

document.getElementById('btnWhatsAppShare')?.addEventListener('click', () => {
    const url = `https://wa.me/?text=${encodeURIComponent(INVITE_MESSAGE)}`;
    window.open(url, '_blank');
});

// --- BROADCAST LOGIC ---
document.getElementById('btnPushUpdate')?.addEventListener('click', async () => {
    const msgInput = document.getElementById('updateMessage');
    const msg = msgInput.value.trim();
    if (!msg) return alert("Please enter a message to broadcast.");

    const btn = document.getElementById('btnPushUpdate');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Broadcasting...';

    try {
        const broadcastRef = doc(db, "app_metadata", "broadcast");
        const snap = await getDoc(broadcastRef);
        
        // Auto-increment version if it exists, else start at 1
        let currentVersion = 0;
        if (snap.exists() && snap.data().version) {
            currentVersion = parseInt(snap.data().version) || 0;
        }
        const newVersion = (currentVersion + 1).toString();

        await setDoc(broadcastRef, {
            message: msg,
            version: newVersion,
            timestamp: new Date()
        });

        showToast("Broadcast sent successfully!");
        msgInput.value = '';
    } catch (err) {
        console.error("Broadcast failed:", err);
        alert("Failed to send broadcast: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Attach to window as backup (optional but good for compatibility)
window.approvePose = approvePose;
window.rejectPose = rejectPose;
window.deleteMessage = deleteMessage;
window.loadPendingPoses = loadPendingPoses;
window.loadMessages = loadMessages;

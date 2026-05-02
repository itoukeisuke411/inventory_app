// --- IndexedDB Wrapper ---
const DB_NAME = 'InventoryDB';
const DB_VERSION = 1;
const STORE_NAME = 'items';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function getItems() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getItem(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(Number(id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveItem(item) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        if (item.id) {
            item.id = Number(item.id);
        } else {
            delete item.id; // ensure autoIncrement works
        }
        item.updatedAt = new Date().toISOString();
        const request = item.id ? store.put(item) : store.add(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function deleteItem(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(Number(id));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function clearItems() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Image Compression & Base64 ---
function compressImage(file, maxWidth = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = Math.round((height *= maxWidth / width));
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Return as Base64 JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        };
    });
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const searchInput = document.getElementById('search-input');
    const exportBtn = document.getElementById('export-btn');
    const importInput = document.getElementById('import-input');
    const listView = document.getElementById('list-view');
    const formView = document.getElementById('form-view');
    const itemListEl = document.getElementById('item-list');
    const emptyStateEl = document.getElementById('empty-state');
    
    const addBtn = document.getElementById('add-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const itemForm = document.getElementById('item-form');
    
    // Form inputs
    const idInput = document.getElementById('item-id');
    const nameInput = document.getElementById('item-name');
    const locationInput = document.getElementById('item-location');
    const categoryInput = document.getElementById('item-category');
    const statusInput = document.getElementById('item-status');
    const notesInput = document.getElementById('item-notes');
    const imageInput = document.getElementById('item-image-input');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    let deleteTargetId = null;

    let currentImageData = null;
    let allItems = []; // To store items for filtering

    // View Switching
    function showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        
        if (viewId === 'list-view') {
            addBtn.style.display = 'flex';
            loadList();
        } else {
            addBtn.style.display = 'none';
        }
    }

    // Load List
    async function loadList() {
        allItems = await getItems();
        renderList(allItems);
    }

    function renderList(items) {
        itemListEl.innerHTML = '';
        
        if (items.length === 0) {
            emptyStateEl.style.display = 'block';
        } else {
            emptyStateEl.style.display = 'none';
            // Sort by latest
            const sortedItems = [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            sortedItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'item-card';
                card.onclick = () => editItem(item.id);
                
                const thumbHtml = item.image 
                    ? `<img src="${item.image}" class="item-thumb" alt="thumbnail">`
                    : `<div class="item-thumb placeholder">📦</div>`;
                
                card.innerHTML = `
                    ${thumbHtml}
                    <div class="item-info">
                        <div class="item-title">${escapeHtml(item.name)}</div>
                        <div class="item-meta">場所: ${escapeHtml(item.location || '-')}</div>
                        <div class="item-meta">分類: ${escapeHtml(item.category || '-')}</div>
                        <div class="item-status-badge status-${item.status}">${item.status}</div>
                    </div>
                `;
                itemListEl.appendChild(card);
            });
        }
    }

    // Search Logic
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderList(allItems);
            return;
        }
        const filtered = allItems.filter(item => 
            (item.name || '').toLowerCase().includes(query)
        );
        renderList(filtered);
    });

    // Edit Item
    async function editItem(id) {
        const item = await getItem(id);
        if (!item) return;
        
        idInput.value = item.id;
        nameInput.value = item.name;
        locationInput.value = item.location;
        categoryInput.value = item.category;
        statusInput.value = item.status;
        notesInput.value = item.notes;
        
        currentImageData = item.image || null;
        updateImagePreview();
        
        // Add delete button specifically for editing mode
        let delBtn = document.getElementById('edit-delete-btn');
        if (!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'edit-delete-btn';
            delBtn.type = 'button';
            delBtn.className = 'btn btn-danger';
            delBtn.style.marginTop = '12px';
            delBtn.style.width = '100%';
            delBtn.textContent = 'このアイテムを削除';
            itemForm.appendChild(delBtn);
        }
        delBtn.onclick = () => showDeleteModal(item.id);
        delBtn.style.display = 'block';
        
        showView('form-view');
    }

    // Reset Form
    function resetForm() {
        itemForm.reset();
        idInput.value = '';
        currentImageData = null;
        updateImagePreview();
        
        const delBtn = document.getElementById('edit-delete-btn');
        if (delBtn) delBtn.style.display = 'none';
    }

    // Handle Image
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            currentImageData = await compressImage(file);
            updateImagePreview();
        }
    });

    removeImageBtn.addEventListener('click', () => {
        currentImageData = null;
        imageInput.value = '';
        updateImagePreview();
    });

    function updateImagePreview() {
        if (currentImageData) {
            imagePreview.innerHTML = `<img src="${currentImageData}" alt="Preview">`;
            removeImageBtn.style.display = 'block';
        } else {
            imagePreview.innerHTML = `<span class="placeholder-text">📷 写真を追加</span>`;
            removeImageBtn.style.display = 'none';
        }
    }

    // Save
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const item = {
            id: idInput.value || undefined,
            name: nameInput.value,
            location: locationInput.value,
            category: categoryInput.value,
            status: statusInput.value,
            notes: notesInput.value,
            image: currentImageData
        };
        
        await saveItem(item);
        showView('list-view');
    });

    // Delete Modal Logic
    function showDeleteModal(id) {
        deleteTargetId = id;
        modalOverlay.classList.add('active');
    }

    modalCancel.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
        deleteTargetId = null;
    });

    modalConfirm.addEventListener('click', async () => {
        if (deleteTargetId) {
            await deleteItem(deleteTargetId);
            modalOverlay.classList.remove('active');
            showView('list-view');
        }
    });

    // Event Listeners
    exportBtn.addEventListener('click', async () => {
        try {
            const items = await getItems();
            const dataStr = JSON.stringify(items);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('エクスポートに失敗しました。');
        }
    });

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                let dataToImport = [];
                const content = event.target.result;
                
                if (fileName.endsWith('.json')) {
                    const data = JSON.parse(content);
                    if (!Array.isArray(data)) throw new Error('Invalid format');
                    dataToImport = data;
                } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
                    // 簡単なCSVパーサー (カンマ区切り)
                    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
                    if (lines.length < 2) throw new Error('No data found');
                    
                    // 1行目はヘッダーとしてスキップし、2行目から読み込む
                    // 想定: 物品名,保管場所,カテゴリ,状態,備考
                    for (let i = 1; i < lines.length; i++) {
                        const cols = lines[i].split(',').map(c => c.trim());
                        if (cols.length >= 1 && cols[0] !== '') {
                            dataToImport.push({
                                name: cols[0],
                                location: cols[1] || '',
                                category: cols[2] || '',
                                status: cols[3] || '良好',
                                notes: cols[4] || '',
                                image: null // テキストからのインポート時は画像なし
                            });
                        }
                    }
                } else {
                    throw new Error('Unsupported file type');
                }
                
                if (dataToImport.length > 0) {
                    const overwrite = confirm('現在のデータをすべて削除して「上書き」しますか？\n\n[OK] = 上書きする\n[キャンセル] = 現在のデータに「追加」する');
                    if (overwrite) {
                        await clearItems();
                    }
                    
                    for (const item of dataToImport) {
                        await saveItem(item);
                    }
                    alert(`${dataToImport.length}件のアイテムをインポートしました。`);
                    loadList();
                } else {
                    alert('インポートするデータがありませんでした。');
                }
            } catch (err) {
                alert('ファイルの読み込みに失敗しました。正しい形式（ひな形通り）のファイルを選択してください。');
                console.error(err);
            }
            importInput.value = ''; // reset
        };
        reader.readAsText(file);
    });

    addBtn.addEventListener('click', () => {
        resetForm();
        showView('form-view');
    });

    cancelBtn.addEventListener('click', () => {
        showView('list-view');
    });

    // Utility
    function escapeHtml(unsafe) {
        return (unsafe || '').replace(/[&<"'>]/g, function (match) {
            switch (match) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
            }
        });
    }

    // Init
    loadList();
});

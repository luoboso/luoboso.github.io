/**
 * Main application logic for the Facebook Sync Admin Interface.
 * Handles authentication, draft management, editing, and publishing.
 */

// ─── State ────────────────────────────────────────────────

let github = null;
let allDrafts = [];
let allArticles = []; // New state variable
let activeTab = 'pending';
let activeDraftIndex = -1;
let selectedIndices = new Set();
let pendingImportFiles = null;

// ─── DOM Refs ─────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const tokenInput = $('github-token');
const authBtn = $('auth-btn');
const authError = $('auth-error');
const logoutBtn = $('logout-btn');
const refreshBtn = $('refresh-btn');
const syncStatus = $('sync-status');
const tabs = $('tabs');
const listBody = $('list-body');
const listInfo = $('list-info');
const selectAllCheckbox = $('select-all-checkbox');
const editorEmpty = $('editor-empty');
const editorContent = $('editor-content');
const editTitle = $('edit-title');
const editCat = $('edit-category');
const editTags = $('edit-tags');
const editDescription = $('edit-description');
const contentPreview = $('content-preview');
const imagesSection = $('images-section');
const imagesPreview = $('images-preview');
const seoItems = $('seo-items');
const metaDate = $('meta-date');
const metaFbLink = $('meta-fb-link');
const selectedCount = $('selected-count');
const publishBtn = $('publish-btn');
const rejectBtn = $('reject-btn');
const restoreBtn = $('restore-btn');
const publishModal = $('publish-modal');
const publishModalBody = $('publish-modal-body');
const cancelPublishBtn = $('cancel-publish-btn');
const confirmPublishBtn = $('confirm-publish-btn');
const loadingOverlay = $('loading-overlay');
const loadingText = $('loading-text');
const regenerateTitleBtn = $('regenerate-title-btn');
const regenerateDescriptionBtn = $('regenerate-description-btn');

// New DOM references
const listActionsBar = $('list-actions-bar');
const exportCsvBtn = $('export-csv-btn');
const importCsvBtn = $('import-csv-btn');
const csvFileInput = $('csv-file-input');
const searchInput = $('search-input');
const sortSelect = $('sort-select');
const editDateGroup = $('edit-date-group');
const editDate = $('edit-date');
const editContentGroup = $('edit-content-group');
const editContent = $('edit-content');
const contentPreviewGroup = $('content-preview-group');
const batchEditBtn = $('batch-edit-btn');
const batchEditModal = $('batch-edit-modal');
const cancelBatchBtn = $('cancel-batch-btn');
const confirmBatchBtn = $('confirm-batch-btn');
const batchChangeCategoryCheck = $('batch-change-category-check');
const batchCategory = $('batch-category');
const batchChangeTagsCheck = $('batch-change-tags-check');
const batchTags = $('batch-tags');

// ─── Initialization ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  bindEvents();

  // Check for saved token
  const savedToken = localStorage.getItem('github_token');
  if (savedToken) {
    authenticate(savedToken);
  }
});

function initCategories() {
  // Combine primary and subcategories
  const allCats = [...CONFIG.primaryCategories, ...CONFIG.subCategories];

  editCat.innerHTML = '<option value="">選擇分類</option>';
  batchCategory.innerHTML = '<option value="">選擇分類</option>';
  for (const cat of allCats) {
    editCat.innerHTML += `<option value="${cat}">${cat}</option>`;
    batchCategory.innerHTML += `<option value="${cat}">${cat}</option>`;
  }

  // Load custom categories from localStorage
  let customCats = [];
  try {
    customCats = JSON.parse(localStorage.getItem('custom_categories') || '[]');
  } catch (e) {}
  for (const cat of customCats) {
    if (!allCats.includes(cat)) {
      editCat.innerHTML += `<option value="${cat}">${cat}</option>`;
      batchCategory.innerHTML += `<option value="${cat}">${cat}</option>`;
    }
  }

  // Add "Create new" option at the very bottom
  editCat.innerHTML += '<option value="__new_category__">+ 新增自訂分類...</option>';
}

function bindEvents() {
  authBtn.addEventListener('click', () => authenticate(tokenInput.value.trim()));
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authenticate(tokenInput.value.trim());
  });

  logoutBtn.addEventListener('click', logout);
  refreshBtn.addEventListener('click', () => {
    if (activeTab === 'articles') {
      loadArticles();
    } else {
      loadDrafts();
    }
  });

  // Tab switching
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) switchTab(tab.dataset.tab);
  });

  // Select all
  selectAllCheckbox.addEventListener('change', toggleSelectAll);

  // Editor field changes → auto-save & SEO update
  editTitle.addEventListener('input', onFieldChange);
  editDate.addEventListener('input', onFieldChange);
  editContent.addEventListener('input', onFieldChange);
  editCat.addEventListener('change', () => {
    if (editCat.value === '__new_category__') {
      const newCat = prompt('請輸入新分類名稱：');
      const trimmedCat = newCat ? newCat.trim() : '';
      if (trimmedCat) {
        // Check if exists
        let exists = false;
        for (let i = 0; i < editCat.options.length; i++) {
          if (editCat.options[i].value === trimmedCat) {
            editCat.selectedIndex = i;
            exists = true;
            break;
          }
        }
        if (!exists) {
          // Save to localStorage
          let customCats = [];
          try {
            customCats = JSON.parse(localStorage.getItem('custom_categories') || '[]');
          } catch (e) {}
          if (!customCats.includes(trimmedCat)) {
            customCats.push(trimmedCat);
            localStorage.setItem('custom_categories', JSON.stringify(customCats));
          }

          // Add to dropdown
          const opt = document.createElement('option');
          opt.value = trimmedCat;
          opt.textContent = trimmedCat;
          editCat.insertBefore(opt, editCat.options[editCat.options.length - 1]);
          editCat.value = trimmedCat;
        }
      } else {
        editCat.value = '';
      }
    }
    onFieldChange();
  });
  editTags.addEventListener('input', onFieldChange);
  editDescription.addEventListener('input', onFieldChange);

  // Actions
  publishBtn.addEventListener('click', showPublishModal);
  rejectBtn.addEventListener('click', rejectSelected);
  restoreBtn.addEventListener('click', restoreSelected);
  cancelPublishBtn.addEventListener('click', () => {
    publishModal.hidden = true;
    pendingImportFiles = null;
    publishModal.querySelector('h2').textContent = '確認發布';
    confirmPublishBtn.textContent = '確認發布';
  });
  confirmPublishBtn.addEventListener('click', confirmPublish);
  regenerateTitleBtn.addEventListener('click', regenerateTitle);
  regenerateDescriptionBtn.addEventListener('click', regenerateDescription);

  // Search & Sort Events
  searchInput.addEventListener('input', renderList);
  sortSelect.addEventListener('change', renderList);

  // CSV Events
  exportCsvBtn.addEventListener('click', exportArticlesCSV);
  importCsvBtn.addEventListener('click', () => csvFileInput.click());
  csvFileInput.addEventListener('change', importArticlesCSV);

  // Batch Edit Events
  batchEditBtn.addEventListener('click', () => {
    batchEditModal.hidden = false;
  });
  cancelBatchBtn.addEventListener('click', () => {
    batchEditModal.hidden = true;
  });
  confirmBatchBtn.addEventListener('click', confirmBatchEdit);

  batchChangeCategoryCheck.addEventListener('change', (e) => {
    batchCategory.disabled = !e.target.checked;
  });
  batchChangeTagsCheck.addEventListener('change', (e) => {
    batchTags.disabled = !e.target.checked;
  });
}

// ─── Authentication ───────────────────────────────────────

async function authenticate(token) {
  if (!token) {
    showAuthError('請輸入 GitHub Token');
    return;
  }

  authBtn.disabled = true;
  authBtn.textContent = '驗證中...';
  authError.hidden = true;

  try {
    github = new GitHubAPI(token);
    const user = await github.verifyToken();

    localStorage.setItem('github_token', token);
    authScreen.hidden = true;
    appScreen.hidden = false;
    updateSyncStatus(`已登入: ${user.login}`, 'green');

    await loadDrafts();
  } catch (err) {
    showAuthError(`驗證失敗: ${err.message}`);
    github = null;
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = '登入';
  }
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

function logout() {
  localStorage.removeItem('github_token');
  github = null;
  allDrafts = [];
  authScreen.hidden = false;
  appScreen.hidden = true;
  tokenInput.value = '';
}

// ─── Data Loading ─────────────────────────────────────────

async function loadDrafts() {
  showLoading('載入中...');
  try {
    allDrafts = await github.getAllDrafts();
    // Also load articles list asynchronously so counts are updated
    try {
      const list = await github.listArticles();
      allArticles = list.map(item => ({
        filename: item.name,
        path: item.path,
        sha: item.sha,
        title: item.name.replace(/\.md$/, ''),
        loaded: false
      }));
    } catch (e) {
      console.warn('Failed to load articles list', e);
    }
    updateCounts();
    renderList();
    clearEditor();
    updateSyncStatus(`${allDrafts.length} 篇貼文`, 'green');
    toast('success', `載入 ${allDrafts.length} 篇貼文`);
  } catch (err) {
    toast('error', `載入失敗: ${err.message}`);
    updateSyncStatus('載入失敗', 'red');
  } finally {
    hideLoading();
  }
}

async function loadArticles() {
  showLoading('載入文章列表中...');
  try {
    const list = await github.listArticles();
    allArticles = list.map(item => ({
      filename: item.name,
      path: item.path,
      sha: item.sha,
      title: item.name.replace(/\.md$/, ''),
      loaded: false
    }));

    // Try to load content.json to enrich metadata
    try {
      const response = await fetch('../content.json');
      if (response.ok) {
        const data = await response.json();
        if (data && data.posts) {
          const postsMap = new Map();
          for (const p of data.posts) {
            postsMap.set(p.title, p);
          }
          for (const art of allArticles) {
            const p = postsMap.get(art.title);
            if (p) {
              art.date = p.date ? MarkdownGenerator.formatDate(p.date) : '';
              art.categories = p.categories ? p.categories.map(c => typeof c === 'object' ? c.name : c) : [];
              art.tags = p.tags ? p.tags.map(t => typeof t === 'object' ? t.name : t) : [];
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load content.json for metadata enrichment:', e);
    }

    updateCounts();
    renderList();
    clearEditor();
    updateSyncStatus(`${allArticles.length} 篇文章`, 'green');
    toast('success', `載入 ${allArticles.length} 篇文章`);
  } catch (err) {
    toast('error', `載入失敗: ${err.message}`);
    updateSyncStatus('載入文章失敗', 'red');
  } finally {
    hideLoading();
  }
}

// ─── Tab Management ───────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;
  selectedIndices.clear();
  activeDraftIndex = -1;

  // Clear search filter on tab switch
  if (searchInput) {
    searchInput.value = '';
  }

  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // Show/hide action buttons
  publishBtn.hidden = tab === 'rejected';
  rejectBtn.hidden = tab !== 'pending';
  restoreBtn.hidden = tab === 'pending';
  batchEditBtn.hidden = tab !== 'articles';
  listActionsBar.hidden = tab !== 'articles';

  // Customize publish button text depending on tab
  if (tab === 'published' || tab === 'articles') {
    publishBtn.innerHTML = '📝 更新選中文章';
  } else {
    publishBtn.innerHTML = '✅ 發布選中';
  }

  if (tab === 'articles') {
    if (allArticles.length === 0) {
      loadArticles();
    } else {
      renderList();
      clearEditor();
      updateSelection();
    }
  } else {
    renderList();
    clearEditor();
    updateSelection();
  }
}

function updateCounts() {
  const counts = { pending: 0, published: 0, rejected: 0 };
  for (const d of allDrafts) {
    const status = d.data.status || 'pending';
    if (counts[status] !== undefined) counts[status]++;
  }

  $('pending-count').textContent = counts.pending;
  $('published-count').textContent = counts.published;
  $('rejected-count').textContent = counts.rejected;
  $('articles-count').textContent = allArticles.length;
}

// ─── List Rendering ───────────────────────────────────────

function getFilteredDrafts() {
  const query = (searchInput.value || '').toLowerCase().trim();
  const sortType = sortSelect.value;

  let list = [];
  if (activeTab === 'articles') {
    list = allArticles.slice();
    if (query) {
      list = list.filter(art => 
        (art.title || '').toLowerCase().includes(query) ||
        (art.filename || '').toLowerCase().includes(query)
      );
    }
    list.sort((a, b) => {
      if (sortType === 'date-desc') {
        const dA = a.date ? new Date(a.date) : new Date(0);
        const dB = b.date ? new Date(b.date) : new Date(0);
        return dB - dA;
      } else if (sortType === 'date-asc') {
        const dA = a.date ? new Date(a.date) : new Date(0);
        const dB = b.date ? new Date(b.date) : new Date(0);
        return dA - dB;
      } else if (sortType === 'title-desc') {
        return (b.title || '').localeCompare(a.title || '', 'zh-Hant');
      } else {
        // title-asc
        return (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      }
    });
  } else {
    list = allDrafts.filter(d => (d.data.status || 'pending') === activeTab);
    if (query) {
      list = list.filter(d => 
        (d.data.suggested_title || '').toLowerCase().includes(query) ||
        (d.data.message || '').toLowerCase().includes(query)
      );
    }
    list.sort((a, b) => {
      const timeA = new Date(a.data.created_time || 0);
      const timeB = new Date(b.data.created_time || 0);
      if (sortType === 'date-asc') {
        return timeA - timeB;
      } else if (sortType === 'title-asc') {
        return (a.data.suggested_title || '').localeCompare(b.data.suggested_title || '', 'zh-Hant');
      } else if (sortType === 'title-desc') {
        return (b.data.suggested_title || '').localeCompare(a.data.suggested_title || '', 'zh-Hant');
      } else {
        // date-desc
        return timeB - timeA;
      }
    });
  }
  return list;
}

function renderList() {
  const filtered = getFilteredDrafts();
  listInfo.textContent = `${filtered.length} 篇`;
  selectAllCheckbox.checked = false;

  if (filtered.length === 0) {
    listBody.innerHTML = `
      <div class="editor-empty" style="height:200px">
        <p style="color:var(--text-muted)">沒有${
          activeTab === 'pending' ? '待審核' :
          activeTab === 'published' ? '已發布' :
          activeTab === 'articles' ? '文章' : '不發布'
        }的貼文</p>
      </div>`;
    return;
  }

  listBody.innerHTML = filtered.map((item, idx) => {
    const isArticle = activeTab === 'articles';
    const globalIdx = isArticle ? allArticles.indexOf(item) : allDrafts.indexOf(item);
    const isActive = globalIdx === activeDraftIndex;
    const isSelected = selectedIndices.has(globalIdx);

    if (isArticle) {
      const dateStr = item.date ? item.date.split(' ')[0] : '';
      return `
        <div class="post-item ${isActive ? 'active' : ''}"
             data-idx="${globalIdx}"
             onclick="selectPost(${globalIdx})">
          <input type="checkbox"
                 ${isSelected ? 'checked' : ''}
                 onclick="event.stopPropagation(); toggleSelect(${globalIdx})"
                 data-check-idx="${globalIdx}">
          <div class="post-item-body">
            ${dateStr ? `<div class="post-item-date">${dateStr}</div>` : ''}
            <div class="post-item-title">${escapeHtml(item.title)}</div>
            <div class="post-item-preview" style="color:var(--text-muted); font-size: 0.75rem">${escapeHtml(item.filename)}</div>
          </div>
        </div>`;
    } else {
      const d = item.data;
      const date = new Date(d.created_time);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      const title = d.suggested_title || '無標題';
      const preview = (d.message || '').slice(0, 80).replace(/\n/g, ' ');
      const imgCount = (d.images || []).length;
      return `
        <div class="post-item ${isActive ? 'active' : ''}"
             data-idx="${globalIdx}"
             onclick="selectPost(${globalIdx})">
          <input type="checkbox"
                 ${isSelected ? 'checked' : ''}
                 onclick="event.stopPropagation(); toggleSelect(${globalIdx})"
                 data-check-idx="${globalIdx}">
          <div class="post-item-body">
            <div class="post-item-date">${dateStr}</div>
            <div class="post-item-title">${escapeHtml(title)}</div>
            <div class="post-item-preview">${escapeHtml(preview)}</div>
            ${imgCount > 0 ? `<div class="post-item-images">🖼️ ${imgCount} 張圖片</div>` : ''}
          </div>
        </div>`;
    }
  }).join('');
}

// ─── Selection ────────────────────────────────────────────

async function selectPost(idx) {
  activeDraftIndex = idx;
  renderList();

  if (activeTab === 'articles') {
    const article = allArticles[idx];
    if (!article.loaded) {
      showLoading('載入文章詳細內容...');
      try {
        const fullArt = await github.getArticle(article.path);
        const parsed = MarkdownGenerator.parse(fullArt.content);
        article.content = parsed.content;
        article.title = parsed.title;
        article.date = parsed.date;
        article.categories = parsed.categories;
        article.tags = parsed.tags;
        article.description = parsed.description;
        article.sha = fullArt.sha;
        article.loaded = true;
      } catch (err) {
        toast('error', `載入文章失敗: ${err.message}`);
        activeDraftIndex = -1;
        renderList();
        clearEditor();
        hideLoading();
        return;
      }
      hideLoading();
    }
    loadEditorForArticle(article);
  } else {
    loadEditor(allDrafts[idx]);
  }
}

function toggleSelect(idx) {
  if (selectedIndices.has(idx)) {
    selectedIndices.delete(idx);
  } else {
    selectedIndices.add(idx);
  }
  updateSelection();
}

function toggleSelectAll() {
  const filtered = getFilteredDrafts();
  const isArticle = activeTab === 'articles';
  const list = isArticle ? allArticles : allDrafts;

  if (selectAllCheckbox.checked) {
    for (const item of filtered) {
      selectedIndices.add(list.indexOf(item));
    }
  } else {
    for (const item of filtered) {
      selectedIndices.delete(list.indexOf(item));
    }
  }
  updateSelection();
  renderList();
}

function updateSelection() {
  const count = selectedIndices.size;
  selectedCount.textContent = `已選 ${count} 篇`;
  publishBtn.disabled = count === 0;
  rejectBtn.disabled = count === 0;
  restoreBtn.disabled = count === 0;
}

// ─── Editor ───────────────────────────────────────────────

function loadEditor(draft) {
  editorEmpty.hidden = true;
  editorContent.hidden = false;

  const d = draft.data;

  // Fill fields
  editTitle.value = d._edited_title || d.suggested_title || '';
  editDescription.value = d._edited_description || d.suggested_description || '';

  // Categories
  const cats = d._edited_categories || d.suggested_categories || [];
  const activeCat = cats[0] || '';
  if (activeCat) {
    let exists = false;
    for (let i = 0; i < editCat.options.length; i++) {
      if (editCat.options[i].value === activeCat) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = activeCat;
      opt.textContent = activeCat;
      editCat.insertBefore(opt, editCat.options[editCat.options.length - 1]);
    }
  }
  editCat.value = activeCat;

  // Tags
  const tags = d._edited_tags || d.suggested_tags || [];
  editTags.value = tags.join(', ');

  // Content preview & Date/Content controls
  contentPreview.textContent = d.message || '(無內容)';
  editDateGroup.hidden = true;
  editContentGroup.hidden = true;
  contentPreviewGroup.hidden = false;

  // Images
  if (d.images && d.images.length > 0) {
    imagesSection.hidden = false;
    imagesPreview.innerHTML = d.images.map((img, i) => {
      return `<img id="preview-img-${i}" alt="post image" src="" loading="lazy" style="opacity: 0.2; transition: opacity 0.3s; max-height: 150px; object-fit: cover;">`;
    }).join('');

    // Fetch private images asynchronously using GitHub API token
    d.images.forEach(async (img, i) => {
      const cleanPath = img.startsWith('/') ? img : '/' + img;
      const filePath = `source${cleanPath}`;
      const imgEl = $('preview-img-' + i);
      if (!imgEl) return;

      try {
        const objectUrl = await github.getPrivateImage(filePath);
        imgEl.src = objectUrl;
        imgEl.style.opacity = '1';
      } catch (err) {
        console.warn('Failed to load private image, falling back to raw url:', err);
        const rawUrl = `https://raw.githubusercontent.com/${CONFIG.github.owner}/${CONFIG.github.repo}/${CONFIG.github.branch}/${filePath}`;
        imgEl.src = rawUrl;
        imgEl.style.opacity = '1';
        imgEl.onerror = () => imgEl.style.display = 'none';
      }
    });
  } else {
    imagesSection.hidden = true;
    imagesPreview.innerHTML = '';
  }

  // Meta
  const date = new Date(d.created_time);
  metaDate.textContent = date.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  metaFbLink.href = `${CONFIG.facebookPageUrl}/posts/${d.fb_id.split('_')[1] || d.fb_id}`;

  // SEO score
  updateSEOScore();
}

function clearEditor() {
  editorEmpty.hidden = false;
  editorContent.hidden = true;
  activeDraftIndex = -1;
}

function onFieldChange() {
  if (activeDraftIndex < 0) return;

  if (activeTab === 'articles') {
    const article = allArticles[activeDraftIndex];
    article.title = editTitle.value;
    article.date = editDate.value;
    article.categories = [editCat.value].filter(Boolean);
    article.tags = editTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    article.description = editDescription.value;
    article.content = editContent.value;
  } else {
    const draft = allDrafts[activeDraftIndex];
    draft.data._edited_title = editTitle.value;
    draft.data._edited_description = editDescription.value;
    draft.data._edited_categories = [editCat.value].filter(Boolean);
    draft.data._edited_tags = editTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  }

  updateSEOScore();
  renderList(); // Update title in list
}

function updateSEOScore() {
  if (activeDraftIndex < 0) return;

  let images = [];
  let message = '';

  if (activeTab === 'articles') {
    const article = allArticles[activeDraftIndex];
    message = editContent.value || '';
    const imgRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = imgRegex.exec(message)) !== null) {
      images.push(match[1]);
    }
  } else {
    const draft = allDrafts[activeDraftIndex];
    images = draft.data.images || [];
    message = draft.data.message || '';
  }

  const post = {
    title: editTitle.value,
    description: editDescription.value,
    categories: [editCat.value].filter(Boolean),
    tags: editTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean),
    images: images,
    message: message,
  };

  const checks = MarkdownGenerator.calculateSEOScore(post);
  seoItems.innerHTML = checks.map(c =>
    `<div class="seo-item ${c.status}">
      ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'}
      ${c.label} — <small>${c.detail}</small>
    </div>`
  ).join('');
}

// ─── Title Regeneration (placeholder - needs Gemini in browser) ──

async function regenerateTitle() {
  if (activeDraftIndex < 0) return;

  const draft = allDrafts[activeDraftIndex];
  const message = draft.data.message;

  if (!message) {
    toast('error', '無貼文內容可供生成標題');
    return;
  }

  // Client-side title suggestion using simple heuristics
  // (Gemini API is called server-side during sync; this is a fallback)
  const lines = message.split('\n').filter(l => l.trim());
  let title = '';

  // Try to extract a meaningful title
  for (const line of lines) {
    const clean = line.replace(/#\S+/g, '').trim();
    if (clean.length >= 5 && clean.length <= 30) {
      title = clean;
      break;
    }
  }

  if (!title && lines[0]) {
    title = lines[0].replace(/#\S+/g, '').trim().slice(0, 25);
  }

  if (!title) {
    title = '無標題';
  }

  editTitle.value = title;
  onFieldChange();
  toast('info', '已重新產生標題（離線模式）');
}

async function regenerateDescription() {
  if (activeDraftIndex < 0) return;

  let message = '';
  if (activeTab === 'articles') {
    const article = allArticles[activeDraftIndex];
    message = editContent.value || '';
  } else {
    const draft = allDrafts[activeDraftIndex];
    message = draft.data.message || '';
  }

  if (!message) {
    toast('error', '無內容可供生成摘要');
    return;
  }

  // Client-side description suggestion using simple heuristics (offline fallback)
  // Clean up markdown syntax, hashtags, headers, newlines, and keep first 120 chars
  const clean = message
    .replace(/#\S+/g, '') // remove hashtags
    .replace(/!\[.*?\]\(.*?\)/g, '') // remove images
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // remove links but keep text
    .replace(/[*#`_\-|>]/g, '') // remove markdown formatting
    .replace(/\s+/g, ' ') // collapse whitespaces
    .trim();

  const description = clean.slice(0, 120) + (clean.length > 120 ? '...' : '');

  editDescription.value = description;
  onFieldChange();
  toast('info', '已從內容自動生成摘要（離線模式）');
}

// ─── Publish Flow ─────────────────────────────────────────

async function loadArticleContent(article) {
  if (article.loaded) return;
  const fullArt = await github.getArticle(article.path);
  const parsed = MarkdownGenerator.parse(fullArt.content);
  article.content = parsed.content;
  article.title = parsed.title;
  article.date = parsed.date;
  article.categories = parsed.categories;
  article.tags = parsed.tags;
  article.description = parsed.description;
  article.sha = fullArt.sha;
  article.loaded = true;
}

function loadEditorForArticle(article) {
  editorEmpty.hidden = true;
  editorContent.hidden = false;

  // Show date & content, hide preview & images
  editDateGroup.hidden = false;
  editContentGroup.hidden = false;
  contentPreviewGroup.hidden = true;
  imagesSection.hidden = true;

  // Fill fields
  editTitle.value = article.title || '';
  editDate.value = article.date || '';
  editContent.value = article.content || '';
  editDescription.value = article.description || '';

  // Categories
  const cats = article.categories || [];
  const activeCat = cats[0] || '';
  if (activeCat) {
    let exists = false;
    for (let i = 0; i < editCat.options.length; i++) {
      if (editCat.options[i].value === activeCat) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = activeCat;
      opt.textContent = activeCat;
      editCat.insertBefore(opt, editCat.options[editCat.options.length - 1]);
    }
  }
  editCat.value = activeCat;

  // Tags
  const tags = article.tags || [];
  editTags.value = tags.join(', ');

  // Meta info
  metaDate.textContent = article.date || '無發布時間';
  metaFbLink.href = '#';
  metaFbLink.removeAttribute('href');

  // SEO Score
  updateSEOScore();
}

async function showPublishModal() {
  pendingImportFiles = null;
  publishModal.querySelector('h2').textContent = '確認發布';
  confirmPublishBtn.textContent = '確認發布';

  const selectedIdxs = [...selectedIndices];
  if (selectedIdxs.length === 0) return;

  const isArticleMode = activeTab === 'articles';
  if (isArticleMode) {
    showLoading('正在載入選中文章的詳細內容...');
    try {
      for (const idx of selectedIdxs) {
        await loadArticleContent(allArticles[idx]);
      }
    } catch (err) {
      toast('error', `載入文章失敗: ${err.message}`);
      hideLoading();
      return;
    }
    hideLoading();
  }

  const posts = getSelectedPosts();
  if (posts.length === 0) return;

  const actionText = (isArticleMode || activeTab === 'published') ? '更新' : '發布';

  publishModalBody.innerHTML = `
    <p>即將${actionText} <strong>${posts.length}</strong> 篇文章，直接提交（Commit）至儲存庫：</p>
    <div style="margin-top:1rem; max-height:250px; overflow-y:auto">
      ${posts.map(p => {
        const title = escapeHtml(p.title);
        const cats = p.categories.join(' > ') || '(無分類)';
        const dateStr = p.date ? p.date.split(' ')[0] : (p.draft ? p.draft.data.created_time.split('T')[0] : '');
        return `
          <div class="publish-item">
            <strong>${title}</strong><br>
            <small style="color:var(--text-muted)">${cats} ${dateStr ? '| ' + dateStr : ''}</small>
          </div>
        `;
      }).join('')}
    </div>`;

  publishModal.hidden = false;
}

function getSelectedPosts() {
  if (activeTab === 'articles') {
    return [...selectedIndices].map(idx => {
      const art = allArticles[idx];
      return {
        isArticle: true,
        article: art,
        title: art.title || '無標題',
        date: art.date || '',
        categories: art.categories || [],
        tags: art.tags || [],
        description: art.description || '',
        content: art.content || '',
        path: art.path,
        sha: art.sha
      };
    });
  }
  return [...selectedIndices].map(idx => {
    const draft = allDrafts[idx];
    const d = draft.data;
    return {
      draft,
      title: d._edited_title || d.suggested_title || '無標題',
      categories: d._edited_categories || d.suggested_categories || ['絮絮叨叨'],
      tags: d._edited_tags || d.suggested_tags || [],
      description: d._edited_description || '',
      images: d.images || [],
      message: d.message || '',
    };
  });
}

async function confirmPublish() {
  publishModal.hidden = true;

  if (pendingImportFiles) {
    await executeCsvImport();
    return;
  }

  const posts = getSelectedPosts();
  if (posts.length === 0) return;

  const isArticleMode = activeTab === 'articles';
  const actionText = (isArticleMode || activeTab === 'published') ? '更新' : '發布';
  showLoading(`正在${actionText} (${posts.length} 篇文章)...`);

  try {
    if (isArticleMode) {
      const filesToCommit = posts.map(post => {
        const markdown = MarkdownGenerator.generateFromFields({
          title: post.title,
          date: post.date,
          categories: post.categories,
          tags: post.tags,
          description: post.description,
          content: post.content
        });
        return {
          path: post.path,
          content: markdown
        };
      });

      const commitMessage = `📝 Update ${posts.length} article${posts.length > 1 ? 's' : ''} metadata/content`;
      await github.updateArticles(filesToCommit, commitMessage);
      toast('success', `文章已更新並提交至 GitHub！`);

      selectedIndices.clear();
      await loadArticles();
    } else {
      await github.publishPosts(posts);
      toast('success', `文章已直接發布並提交至 GitHub！`);

      selectedIndices.clear();
      await loadDrafts();
    }
  } catch (err) {
    toast('error', `${actionText}失敗: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function confirmBatchEdit() {
  const selectedIdxs = [...selectedIndices];
  if (selectedIdxs.length === 0) {
    toast('error', '請先選擇要修改的文章');
    return;
  }

  const changeCategory = batchChangeCategoryCheck.checked;
  const changeTags = batchChangeTagsCheck.checked;

  if (!changeCategory && !changeTags) {
    toast('info', '未選擇任何修改項目');
    batchEditModal.hidden = true;
    return;
  }

  const newCat = batchCategory.value;
  const newCats = [newCat].filter(Boolean);
  const newTags = batchTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);

  batchEditModal.hidden = true;
  showLoading('正在載入選中文章並套用修改...');

  try {
    const filesToCommit = [];
    
    // 1. Ensure all selected articles are loaded
    for (let i = 0; i < selectedIdxs.length; i++) {
      const idx = selectedIdxs[i];
      const art = allArticles[idx];
      showLoading(`正在載入文章內容 [${i + 1}/${selectedIdxs.length}]: ${art.title}...`);
      await loadArticleContent(art);

      // 2. Apply updates
      if (changeCategory) {
        art.categories = newCats;
      }
      if (changeTags) {
        art.tags = newTags;
      }

      // 3. Generate markdown content
      const markdown = MarkdownGenerator.generateFromFields({
        title: art.title,
        date: art.date,
        categories: art.categories,
        tags: art.tags,
        description: art.description,
        content: art.content
      });

      filesToCommit.push({
        path: art.path,
        content: markdown
      });
    }

    // 4. Commit to GitHub in a single commit
    showLoading(`正在提交批次修改 (${filesToCommit.length} 篇文章)...`);
    const commitMessage = `📝 Batch edit ${filesToCommit.length} article${filesToCommit.length > 1 ? 's' : ''} metadata`;
    await github.updateArticles(filesToCommit, commitMessage);
    
    toast('success', `成功批次修改 ${filesToCommit.length} 篇文章！`);
    selectedIndices.clear();
    
    // Reset batch inputs
    batchChangeCategoryCheck.checked = false;
    batchChangeTagsCheck.checked = false;
    batchCategory.value = '';
    batchCategory.disabled = true;
    batchTags.value = '';
    batchTags.disabled = true;

    await loadArticles();
  } catch (err) {
    toast('error', `批次修改失敗: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function exportArticlesCSV() {
  if (allArticles.length === 0) {
    toast('error', '沒有可供匯出的文章');
    return;
  }

  try {
    const csvContent = CSVHelper.exportToCSV(allArticles);
    // Add UTF-8 BOM so Excel opens it correctly with Chinese characters
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `articles_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('success', '已成功匯出 CSV！');
  } catch (err) {
    toast('error', `匯出 CSV 失敗: ${err.message}`);
  }
}

async function importArticlesCSV(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const csvText = event.target.result;
      const parsedArticles = CSVHelper.parseCSV(csvText);
      
      if (parsedArticles.length === 0) {
        toast('error', 'CSV 檔案格式不正確或無資料');
        return;
      }

      // Diff with allArticles
      const modifiedArticles = [];
      const articlesMap = new Map();
      for (const art of allArticles) {
        articlesMap.set(art.filename, art);
      }

      for (const parsed of parsedArticles) {
        const local = articlesMap.get(parsed.filename);
        if (local) {
          // Compare fields
          const titleDiff = parsed.title !== local.title;
          const dateDiff = parsed.date !== local.date;
          const catDiff = JSON.stringify(parsed.categories) !== JSON.stringify(local.categories);
          const tagDiff = JSON.stringify(parsed.tags) !== JSON.stringify(local.tags);
          const descDiff = parsed.description !== local.description;

          if (titleDiff || dateDiff || catDiff || tagDiff || descDiff) {
            modifiedArticles.push({
              local,
              parsed,
              changes: {
                title: titleDiff,
                date: dateDiff,
                categories: catDiff,
                tags: tagDiff,
                description: descDiff
              }
            });
          }
        }
      }

      if (modifiedArticles.length === 0) {
        toast('info', '沒有偵測到任何變更的文章');
        csvFileInput.value = '';
        return;
      }

      // Show confirmation modal
      pendingImportFiles = modifiedArticles;
      
      // Update publishModal UI for CSV import
      publishModal.querySelector('h2').textContent = '確認匯入 CSV 變更';
      publishModalBody.innerHTML = `
        <p>即將套用 <strong>${modifiedArticles.length}</strong> 篇文章的屬性變更，並提交至 GitHub：</p>
        <div style="margin-top:1rem; max-height:250px; overflow-y:auto; border:1px solid var(--border-color); padding:0.5rem; border-radius:6px">
          ${modifiedArticles.map(m => {
            const chgList = [];
            if (m.changes.title) chgList.push(`標題: "${m.local.title}" ➔ "${m.parsed.title}"`);
            if (m.changes.date) chgList.push(`日期: "${m.local.date || '(無)'}" ➔ "${m.parsed.date}"`);
            if (m.changes.categories) chgList.push(`分類: [${m.local.categories?.join(', ') || ''}] ➔ [${m.parsed.categories?.join(', ') || ''}]`);
            if (m.changes.tags) chgList.push(`標籤: [${m.local.tags?.join(', ') || ''}] ➔ [${m.parsed.tags?.join(', ') || ''}]`);
            if (m.changes.description) chgList.push(`摘要變更`);
            return `
              <div style="padding:0.5rem 0; border-bottom:1px solid var(--border-secondary)">
                <strong>${escapeHtml(m.local.filename)}</strong>
                <ul style="margin-left:1.25rem; font-size:0.8rem; color:var(--text-secondary)">
                  ${chgList.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
                </ul>
              </div>
            `;
          }).join('')}
        </div>
      `;
      
      confirmPublishBtn.textContent = '確認匯入';
      publishModal.hidden = false;
    } catch (err) {
      toast('error', `解析 CSV 失敗: ${err.message}`);
    }
    csvFileInput.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

async function executeCsvImport() {
  if (!pendingImportFiles || pendingImportFiles.length === 0) return;

  const imports = pendingImportFiles;
  pendingImportFiles = null;
  publishModal.querySelector('h2').textContent = '確認發布';
  confirmPublishBtn.textContent = '確認發布';

  showLoading(`正在載入文章內容並準備提交 (${imports.length} 篇)...`);

  try {
    const filesToCommit = [];

    for (let i = 0; i < imports.length; i++) {
      const item = imports[i];
      const local = item.local;
      const parsed = item.parsed;

      showLoading(`正在載入文章內容 [${i + 1}/${imports.length}]: ${local.filename}...`);
      await loadArticleContent(local);

      local.title = parsed.title;
      local.date = parsed.date;
      local.categories = parsed.categories;
      local.tags = parsed.tags;
      local.description = parsed.description;

      const markdown = MarkdownGenerator.generateFromFields({
        title: local.title,
        date: local.date,
        categories: local.categories,
        tags: local.tags,
        description: local.description,
        content: local.content
      });

      filesToCommit.push({
        path: local.path,
        content: markdown
      });
    }

    showLoading(`正在提交匯入的 CSV 修改至 GitHub...`);
    const commitMessage = `📥 CSV Import: Updated metadata of ${filesToCommit.length} article${filesToCommit.length > 1 ? 's' : ''}`;
    await github.updateArticles(filesToCommit, commitMessage);

    toast('success', `成功匯入並更新了 ${filesToCommit.length} 篇文章！`);
    selectedIndices.clear();
    await loadArticles();
  } catch (err) {
    toast('error', `匯入提交失敗: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ─── Reject / Restore ─────────────────────────────────────

async function rejectSelected() {
  const indices = [...selectedIndices];
  if (indices.length === 0) return;

  showLoading(`標記不發布 (${indices.length} 篇)...`);

  try {
    for (const idx of indices) {
      await github.updateDraftStatus(allDrafts[idx], 'rejected');
    }
    toast('success', `已標記 ${indices.length} 篇為不發布`);
    selectedIndices.clear();
    updateCounts();
    renderList();
    clearEditor();
    updateSelection();
  } catch (err) {
    toast('error', `操作失敗: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function restoreSelected() {
  const indices = [...selectedIndices];
  if (indices.length === 0) return;

  showLoading(`恢復為待審核 (${indices.length} 篇)...`);

  try {
    for (const idx of indices) {
      await github.updateDraftStatus(allDrafts[idx], 'pending');
    }
    toast('success', `已恢復 ${indices.length} 篇為待審核`);
    selectedIndices.clear();
    updateCounts();
    renderList();
    clearEditor();
    updateSelection();
  } catch (err) {
    toast('error', `操作失敗: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ─── UI Utilities ─────────────────────────────────────────

function updateSyncStatus(text, color) {
  const statusText = syncStatus.querySelector('.status-text');
  const statusDot = syncStatus.querySelector('.status-dot');
  statusText.textContent = text;
  statusDot.style.background = color === 'green' ? 'var(--accent-green)' :
                                color === 'red' ? 'var(--accent-red)' :
                                'var(--accent-orange)';
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.hidden = false;
}

function hideLoading() {
  loadingOverlay.hidden = true;
}

function toast(type, message) {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${escapeHtml(message)}`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(50px)';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

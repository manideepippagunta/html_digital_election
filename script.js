(function() {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  1.  DATA LAYER  (localStorage)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const STORAGE_KEY = 'electionAppData_v2';

    function getDefaultCategories() {
        return [
            { id: 'head_boy', name: 'Head Boy' },
            { id: 'head_girl', name: 'Head Girl' },
            { id: 'deputy_head_boy', name: 'Deputy Head Boy' },
            { id: 'deputy_head_girl', name: 'Deputy Head Girl' },
            { id: 'house_captain_red', name: 'House Captain (Red)' },
            { id: 'house_vice_red', name: 'House Vice Captain (Red)' },
            { id: 'house_captain_yellow', name: 'House Captain (Yellow)' },
            { id: 'house_vice_yellow', name: 'House Vice Captain (Yellow)' },
            { id: 'house_captain_green', name: 'House Captain (Green)' },
            { id: 'house_vice_green', name: 'House Vice Captain (Green)' },
            { id: 'house_captain_blue', name: 'House Captain (Blue)' },
            { id: 'house_vice_blue', name: 'House Vice Captain (Blue)' },
            { id: 'discipline_leader', name: 'Discipline Leader' },
            { id: 'hygiene_leader', name: 'Hygiene Leader' },
            { id: 'sports_captain', name: 'Sports Captain' },
            { id: 'sports_vice_captain', name: 'Sports Vice Captain' },
            { id: 'cultural_secretary', name: 'Cultural Secretary' }
        ];
    }

    function getDefaultData() {
        return {
            schoolName: 'Springfield High',
            schoolSubtitle: 'Student Council Election 2026',
            categories: getDefaultCategories(),
            nominees: [],
            voters: [],
            settings: {
                electionMode: 'optional_pin',
                isActive: true,
                resultsPublished: false,
                adminPasswordHash: '',
                showSkipButton: true,
                showVerifyButton: true,
            },
            results: {} // will be computed
        };
    }

    let appData = null;

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // Ensure categories exist
                if (!parsed.categories || parsed.categories.length === 0) {
                    parsed.categories = getDefaultCategories();
                }
                // Ensure settings fields
                if (!parsed.settings) parsed.settings = {};
                if (!parsed.settings.electionMode) parsed.settings.electionMode = 'optional_pin';
                if (parsed.settings.isActive === undefined) parsed.settings.isActive = true;
                if (parsed.settings.resultsPublished === undefined) parsed.settings.resultsPublished = false;
                if (parsed.settings.showSkipButton === undefined) parsed.settings.showSkipButton = true;
                if (parsed.settings.showVerifyButton === undefined) parsed.settings.showVerifyButton = true;
                if (!parsed.settings.adminPasswordHash) {
                    parsed.settings.adminPasswordHash = hashString('admin123');
                }
                // Ensure school name/subtitle
                if (!parsed.schoolName) parsed.schoolName = 'Springfield High';
                if (!parsed.schoolSubtitle) parsed.schoolSubtitle = 'Student Council Election 2026';
                appData = parsed;
                return;
            }
        } catch (_) { /* ignore */ }
        appData = getDefaultData();
        appData.settings.adminPasswordHash = hashString('admin123');
        saveData();
    }

    function saveData() {
        // Recompute results before saving? We'll compute on the fly.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    }

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'h_' + Math.abs(hash).toString(36) + '_' + str.length;
    }

    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  2.  ENCRYPTION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function encryptVote(voteData, pin) {
        const key = await sha256(pin);
        const json = JSON.stringify(voteData);
        const encoded = new TextEncoder().encode(json);
        const keyBytes = new TextEncoder().encode(key);
        const encrypted = new Uint8Array(encoded.length);
        for (let i = 0; i < encoded.length; i++) {
            encrypted[i] = encoded[i] ^ keyBytes[i % keyBytes.length];
        }
        return btoa(String.fromCharCode(...encrypted));
    }

    async function decryptVote(encryptedBase64, pin) {
        try {
            const key = await sha256(pin);
            const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            const keyBytes = new TextEncoder().encode(key);
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
            }
            const json = new TextDecoder().decode(decrypted);
            return JSON.parse(json);
        } catch (_) {
            return null;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  3.  HELPERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    function getCategoryById(id) {
        return appData.categories.find(c => c.id === id);
    }

    function getNomineeById(id) {
        return appData.nominees.find(n => n.id === id);
    }

    function getVoterByRoll(roll) {
        return appData.voters.find(v => v.rollNumber.toLowerCase() === roll.toLowerCase().trim());
    }

    function getNomineesByCategory(categoryId) {
        return appData.nominees.filter(n => n.categoryId === categoryId);
    }

    // Compute results per category
    function computeResults() {
        const results = {};
        // Initialize for all categories
        for (const cat of appData.categories) {
            results[cat.id] = {};
        }
        // Iterate voters who have voted and not skipped
        for (const voter of appData.voters) {
            if (voter.hasVoted && !voter.skipped && voter.voteEncrypted) {
                // We need to decrypt to get votes, but we don't have PIN here.
                // So we store aggregated results at vote time.
                // We'll store a separate results object in appData.
                // For backward compatibility, we'll compute from stored votes if we have them.
                // To simplify, we'll store results incrementally when voting.
                // So we'll have appData.results as an object with categoryId -> nomineeId -> count.
                // We'll maintain that.
            }
        }
        // If we have stored results, use them.
        if (appData.results) {
            return appData.results;
        }
        // Fallback: compute from voters (expensive) - but we won't do that.
        return {};
    }

    // We'll store results in appData.results, updated on each vote.
    // So we need to initialize results.
    function initializeResults() {
        if (!appData.results) {
            appData.results = {};
        }
        for (const cat of appData.categories) {
            if (!appData.results[cat.id]) {
                appData.results[cat.id] = {};
            }
        }
        saveData();
    }

    function getVoteCountForNominee(nomineeId) {
        let total = 0;
        for (const catId in appData.results) {
            const catResults = appData.results[catId] || {};
            if (catResults[nomineeId]) {
                total += catResults[nomineeId];
            }
        }
        return total;
    }

    function getTotalVoters() { return appData.voters.length; }

    function getVotedCount() { return appData.voters.filter(v => v.hasVoted && !v.skipped).length; }

    function getSkippedCount() { return appData.voters.filter(v => v.skipped).length; }

    function getPendingCount() {
        return appData.voters.filter(v => !v.hasVoted && !v.skipped).length;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  4.  TOAST
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            gold: 'fa-star'
        };
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i} ${message}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 350);
        }, 3500);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  5.  RENDER FUNCTIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function renderHomepage() {
        const container = document.getElementById('categoriesContainer');
        if (appData.categories.length === 0) {
            container.innerHTML =
                '<div class="text-center text-muted" style="padding:40px 0;">No categories defined. Please add categories in settings.</div>';
            return;
        }

        let html = '';
        let hasNominees = false;
        for (const cat of appData.categories) {
            const nominees = getNomineesByCategory(cat.id);
            if (nominees.length === 0) {
                html += `
                    <div class="category-section">
                        <div class="cat-header">
                            <h3>${cat.name}</h3>
                            <span class="badge-count">0</span>
                        </div>
                        <div class="text-muted text-center" style="padding:12px 0;">No nominees for this category.</div>
                    </div>
                `;
                continue;
            }
            hasNominees = true;
            html += `
                <div class="category-section" data-category="${cat.id}">
                    <div class="cat-header">
                        <h3>${cat.name}</h3>
                        <span class="badge-count">${nominees.length}</span>
                    </div>
            `;
            for (const n of nominees) {
                const photoHtml = n.photo ?
                    `<img src="${n.photo}" alt="${n.name}" onerror="this.style.display='none';this.parentElement.textContent='👤';" />` :
                    '👤';
                const manifestoFull = n.manifesto?.problems || n.manifesto?.whyMe ?
                    `<div class="manifesto-full" id="mf_${n.id}">
                        <strong>Problems &amp; Promises:</strong> ${n.manifesto?.problems || '—'}<br>
                        <strong>Why choose me:</strong> ${n.manifesto?.whyMe || '—'}
                    </div>` :
                    '';
                html += `
                    <div class="nominee-option" data-nominee="${n.id}">
                        <input type="radio" name="category_${cat.id}" value="${n.id}" id="n_${n.id}" />
                        <div class="avatar">${photoHtml}</div>
                        <div class="info">
                            <div class="name">${n.name}</div>
                            ${manifestoFull ? `<button type="button" class="toggle-manifesto" data-id="${n.id}">View manifesto</button>` : ''}
                            ${manifestoFull}
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
        }

        container.innerHTML = html;

        // Attach event listeners for manifesto toggle
        container.querySelectorAll('.toggle-manifesto').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const el = document.getElementById('mf_' + id);
                if (el) {
                    el.classList.toggle('open');
                    this.textContent = el.classList.contains('open') ? 'Hide manifesto' : 'View manifesto';
                }
            });
        });

        // Highlight selected radio
        container.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const parent = this.closest('.nominee-option');
                if (parent) {
                    parent.closest('.category-section').querySelectorAll('.nominee-option').forEach(opt =>
                        opt.classList.remove('selected'));
                    parent.classList.add('selected');
                }
            });
        });

        // Update visibility of buttons based on settings and PIN mode
        updateButtonVisibility();

        // Show attendance (total voters who have voted)
        // We'll show a small badge in the homepage-actions or header
        const attendance = getVotedCount();
        const total = getTotalVoters();
        const attendanceHtml = `<span class="badge" style="background:var(--gold);color:#fff;padding:6px 16px;border-radius:30px;font-size:0.85rem;"><i class="fas fa-users"></i> Attendance: ${attendance}/${total}</span>`;
        // Insert after categoriesContainer
        const existing = document.querySelector('.homepage-actions .attendance-badge');
        if (existing) existing.remove();
        const actions = document.querySelector('.homepage-actions');
        const badge = document.createElement('span');
        badge.className = 'badge attendance-badge';
        badge.style.cssText =
            'background:var(--gold);color:#fff;padding:6px 16px;border-radius:30px;font-size:0.85rem;display:inline-flex;align-items:center;gap:8px;';
        badge.innerHTML = `<i class="fas fa-users"></i> Attendance: ${attendance}/${total}`;
        actions.prepend(badge);
    }

    function updateButtonVisibility() {
        const mode = appData.settings.electionMode || 'optional_pin';
        const showSkip = appData.settings.showSkipButton !== false;
        const showVerifySetting = appData.settings.showVerifyButton !== false;
        // Verify button is only relevant if PIN is used (optional or required)
        const showVerify = (mode !== 'no_pin') && showVerifySetting;

        document.getElementById('skipVoteBtn').style.display = showSkip ? 'inline-flex' : 'none';
        document.getElementById('verifyVoteBtn').style.display = showVerify ? 'inline-flex' : 'none';
    }

    function renderSettingsGeneral() {
        document.getElementById('schoolNameInput').value = appData.schoolName || '';
        document.getElementById('schoolSubtitleInput').value = appData.schoolSubtitle || '';
        document.getElementById('showSkipCheckbox').checked = appData.settings.showSkipButton !== false;
        document.getElementById('showVerifyCheckbox').checked = appData.settings.showVerifyButton !== false;
        document.getElementById('electionMode').value = appData.settings.electionMode || 'optional_pin';
        document.getElementById('electionStatus').value = appData.settings.isActive ? 'active' : 'closed';
        updateStatusBadge();
    }

    function renderCategoryList() {
        const container = document.getElementById('categoryList');
        if (appData.categories.length === 0) {
            container.innerHTML = '<div class="text-muted">No categories defined.</div>';
            return;
        }
        let html = '';
        for (const cat of appData.categories) {
            const nomineeCount = getNomineesByCategory(cat.id).length;
            html += `
                <div class="category-item">
                    <span class="cat-name">${cat.name} <span class="text-muted text-small">(${nomineeCount} nominees)</span></span>
                    <div class="cat-actions">
                        <button class="btn btn-danger btn-xs remove-category" data-id="${cat.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.remove-category').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (confirm('Delete this category and all its nominees and votes?')) {
                    removeCategory(id);
                }
            });
        });
    }

    function renderNomineeList() {
        const container = document.getElementById('nomineeList');
        if (appData.nominees.length === 0) {
            container.innerHTML = '<div class="text-muted text-center" style="padding:16px 0;">No nominees added yet.</div>';
            return;
        }
        // Populate category select for add form
        populateCategorySelect();

        let html = '';
        for (const n of appData.nominees) {
            const cat = getCategoryById(n.categoryId);
            const catName = cat ? cat.name : 'Unknown';
            const photoHtml = n.photo ?
                `<img src="${n.photo}" alt="${n.name}" onerror="this.style.display='none';this.parentElement.textContent='👤';" />` :
                '👤';
            const votes = getVoteCountForNominee(n.id);
            html += `
                <div class="nominee-item">
                    <div class="n-avatar">${photoHtml}</div>
                    <div class="n-info">
                        <div class="n-name">${n.name}</div>
                        <div class="n-cat">${catName} · ${votes} vote${votes!==1?'s':''}</div>
                    </div>
                    <div class="n-actions">
                        <button class="btn btn-danger btn-xs remove-nominee" data-id="${n.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.remove-nominee').forEach(btn => {
            btn.addEventListener('click', function() {
                if (confirm('Remove this nominee and all their votes?')) {
                    removeNominee(this.dataset.id);
                }
            });
        });
    }

    function populateCategorySelect() {
        const select = document.getElementById('nomCategory');
        select.innerHTML = '';
        for (const cat of appData.categories) {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            select.appendChild(opt);
        }
    }

    function renderVoterList() {
        const container = document.getElementById('voterListContainer');
        document.getElementById('voterCountBadge').textContent = appData.voters.length;
        if (appData.voters.length === 0) {
            container.innerHTML = '<div class="text-muted text-center" style="padding:16px 0;">No voters imported yet.</div>';
            return;
        }
        let html = '';
        for (const v of appData.voters) {
            let status = 'Pending';
            let cls = '';
            if (v.hasVoted && !v.skipped) { status = '✅ Voted';
                cls = 'voted'; } else if (v.skipped) { status = '⏭️ Skipped';
                cls = 'skipped'; }
            html += `
                <div class="voter-item">
                    <span><strong>${v.rollNumber}</strong> — ${v.name}</span>
                    <span class="v-status ${cls}">${status}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderStats() {
        const total = getTotalVoters();
        const voted = getVotedCount();
        const skipped = getSkippedCount();
        const pending = getPendingCount();
        const turnout = total > 0 ? Math.round((voted / total) * 100) : 0;

        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Voters</div></div>
            <div class="stat-card"><div class="stat-num">${voted}</div><div class="stat-label">Voted</div></div>
            <div class="stat-card"><div class="stat-num">${skipped}</div><div class="stat-label">Skipped</div></div>
            <div class="stat-card"><div class="stat-num">${pending}</div><div class="stat-label">Pending</div></div>
            <div class="stat-card"><div class="stat-num">${turnout}%</div><div class="stat-label">Turnout</div></div>
            <div class="stat-card"><div class="stat-num">${appData.nominees.length}</div><div class="stat-label">Total Nominees</div></div>
            <div class="stat-card"><div class="stat-num">${appData.categories.length}</div><div class="stat-label">Categories</div></div>
        `;
    }

    function renderResults() {
        const container = document.getElementById('resultsContainer');
        const published = appData.settings.resultsPublished;
        const isActive = appData.settings.isActive;

        if (!published && isActive) {
            container.innerHTML =
                '<div class="text-muted text-center" style="padding:20px 0;">Results are not yet published. Voting is still active.</div>';
            return;
        }

        if (!published && !isActive) {
            container.innerHTML =
                '<div class="text-muted text-center" style="padding:20px 0;">Results are pending publication.</div>';
            return;
        }

        // Show results per category
        let html = '';
        for (const cat of appData.categories) {
            const nominees = getNomineesByCategory(cat.id);
            if (nominees.length === 0) {
                html += `<h5 style="margin-top:16px;color:var(--primary);">${cat.name}</h5>
                        <div class="text-muted text-small">No nominees.</div>`;
                continue;
            }
            html += `<h5 style="margin-top:16px;color:var(--primary);">${cat.name}</h5>`;
            const catResults = appData.results[cat.id] || {};
            const maxVotes = Math.max(1, ...nominees.map(n => catResults[n.id] || 0));
            for (const n of nominees) {
                const v = catResults[n.id] || 0;
                const pct = maxVotes > 0 ? Math.round((v / maxVotes) * 100) : 0;
                html += `
                    <div class="result-bar-wrap">
                        <div class="rb-label">
                            <span>${n.name}</span>
                            <span><strong>${v}</strong> vote${v!==1?'s':''}</span>
                        </div>
                        <div class="rb-track">
                            <div class="rb-fill ${cat.id.includes('girl')?'gold':''}" style="width:${pct}%;"></div>
                        </div>
                    </div>
                `;
            }
        }
        container.innerHTML = html;
    }

    function updateStatusBadge() {
        const badge = document.getElementById('electionStatusBadge');
        const isActive = appData.settings.isActive;
        const published = appData.settings.resultsPublished;
        if (published) {
            badge.innerHTML = `<i class="fas fa-flag-checkered"></i> Results Published`;
            badge.style.background = 'rgba(255,255,255,0.20)';
        } else if (isActive) {
            badge.innerHTML = `<i class="fas fa-circle" style="color:#2ecc71;"></i> Voting Open`;
            badge.style.background = 'rgba(255,255,255,0.15)';
        } else {
            badge.innerHTML = `<i class="fas fa-circle" style="color:#e74c3c;"></i> Voting Closed`;
            badge.style.background = 'rgba(255,255,255,0.15)';
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  6.  CORE OPERATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function addCategory(name) {
        if (!name.trim()) return false;
        const id = name.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
        if (appData.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
            showToast('Category already exists.', 'error');
            return false;
        }
        appData.categories.push({ id, name: name.trim() });
        appData.results[id] = {};
        saveData();
        renderAllSettings();
        showToast(`Category "${name.trim()}" added.`, 'success');
        return true;
    }

    function removeCategory(id) {
        // Remove all nominees in this category
        const nominees = getNomineesByCategory(id);
        for (const n of nominees) {
            appData.nominees = appData.nominees.filter(nn => nn.id !== n.id);
            // Remove from results
            for (const catId in appData.results) {
                delete appData.results[catId][n.id];
            }
        }
        appData.categories = appData.categories.filter(c => c.id !== id);
        delete appData.results[id];
        saveData();
        renderAllSettings();
        showToast('Category removed.', 'info');
    }

    function resetDefaultCategories() {
        if (!confirm('Reset to default categories? This will remove all current categories and their nominees.')) return;
        appData.categories = getDefaultCategories();
        appData.nominees = [];
        appData.results = {};
        for (const cat of appData.categories) {
            appData.results[cat.id] = {};
        }
        saveData();
        renderAllSettings();
        showToast('Categories reset to default.', 'success');
    }

    function addNominee(name, categoryId, photo, problems, whyMe) {
        if (!name || !categoryId) return false;
        if (appData.nominees.some(n => n.name.toLowerCase() === name.toLowerCase() && n.categoryId === categoryId)) {
            showToast('A nominee with this name already exists in this category.', 'error');
            return false;
        }
        appData.nominees.push({
            id: generateId(),
            name: name.trim(),
            categoryId: categoryId,
            photo: photo || '',
            manifesto: {
                problems: problems || '',
                promises: problems || '',
                whyMe: whyMe || ''
            }
        });
        // Initialize results for this nominee (just in case)
        for (const catId in appData.results) {
            if (!appData.results[catId][this.id]) {
                appData.results[catId][this.id] = 0;
            }
        }
        saveData();
        renderAllSettings();
        showToast(`Added ${name} to ${getCategoryById(categoryId)?.name || ''}`, 'success');
        return true;
    }

    function removeNominee(id) {
        const nominee = getNomineeById(id);
        if (!nominee) return;
        appData.nominees = appData.nominees.filter(n => n.id !== id);
        // Remove from results
        for (const catId in appData.results) {
            delete appData.results[catId][id];
        }
        saveData();
        renderAllSettings();
        showToast(`Removed ${nominee.name}`, 'info');
    }

    function importVoters(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            showToast('CSV is empty.', 'error');
            return;
        }
        let added = 0,
            skipped = 0;
        let startIdx = 0;
        const first = lines[0].toLowerCase();
        if (first.includes('rollnumber') || first.includes('roll') || first.includes('name')) {
            startIdx = 1;
        }
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim());
            if (parts.length < 2) continue;
            const roll = parts[0];
            const name = parts.slice(1).join(',').trim();
            if (!roll || !name) continue;
            if (appData.voters.some(v => v.rollNumber.toLowerCase() === roll.toLowerCase())) {
                skipped++;
                continue;
            }
            appData.voters.push({
                id: generateId(),
                rollNumber: roll,
                name: name,
                hasVoted: false,
                skipped: false,
                pinHash: null,
                voteEncrypted: null,
                voteTimestamp: null
            });
            added++;
        }
        saveData();
        renderAllSettings();
        showToast(`Imported ${added} voters (${skipped} duplicates skipped).`, 'success');
    }

    function clearAllVoters() {
        if (!confirm('Remove all voters? This will also clear all votes.')) return;
        appData.voters = [];
        appData.results = {};
        for (const cat of appData.categories) {
            appData.results[cat.id] = {};
        }
        appData.settings.resultsPublished = false;
        saveData();
        renderAllSettings();
        showToast('All voters and votes cleared.', 'info');
    }

    async function castVotes(rollNumber, selections, pin) {
        // selections: { categoryId: nomineeId }
        const voter = getVoterByRoll(rollNumber);
        if (!voter) {
            showToast('Voter not found. Please check your roll number.', 'error');
            return false;
        }
        if (voter.hasVoted && !voter.skipped) {
            showToast('You have already voted!', 'error');
            return false;
        }
        if (voter.skipped) {
            showToast('You have already skipped voting.', 'error');
            return false;
        }

        const mode = appData.settings.electionMode || 'optional_pin';
        if (mode === 'required_pin' && (!pin || pin.length < 4)) {
            showToast('PIN is required (minimum 4 characters).', 'error');
            return false;
        }
        if (mode === 'optional_pin' && pin && pin.length < 4) {
            showToast('PIN must be at least 4 characters if set.', 'error');
            return false;
        }

        // Validate that all categories have a selection
        for (const cat of appData.categories) {
            if (!selections[cat.id]) {
                showToast(`Please select a nominee for ${cat.name}.`, 'error');
                return false;
            }
            // Check if nominee exists in that category
            const nominee = getNomineeById(selections[cat.id]);
            if (!nominee || nominee.categoryId !== cat.id) {
                showToast(`Invalid nominee for ${cat.name}.`, 'error');
                return false;
            }
        }

        let pinHash = null;
        if (pin && pin.length >= 4) {
            pinHash = hashString(pin);
        }

        // Encrypt the entire selection
        const voteData = {
            selections: selections,
            timestamp: new Date().toISOString()
        };

        let encrypted = null;
        if (pin && pin.length >= 4) {
            encrypted = await encryptVote(voteData, pin);
        } else {
            encrypted = btoa(JSON.stringify(voteData));
        }

        // Update voter
        voter.hasVoted = true;
        voter.skipped = false;
        voter.pinHash = pinHash;
        voter.voteEncrypted = encrypted;
        voter.voteTimestamp = new Date().toISOString();

        // Update results
        for (const catId in selections) {
            const nomineeId = selections[catId];
            if (!appData.results[catId]) appData.results[catId] = {};
            appData.results[catId][nomineeId] = (appData.results[catId][nomineeId] || 0) + 1;
        }

        saveData();
        renderAll();
        showToast('✅ Your votes have been cast!', 'success');
        return true;
    }

    async function skipVote(rollNumber) {
        const voter = getVoterByRoll(rollNumber);
        if (!voter) {
            showToast('Voter not found.', 'error');
            return false;
        }
        if (voter.hasVoted && !voter.skipped) {
            showToast('You have already voted.', 'error');
            return false;
        }
        if (voter.skipped) {
            showToast('You have already skipped.', 'error');
            return false;
        }
        voter.skipped = true;
        voter.hasVoted = true;
        saveData();
        renderAll();
        showToast('You have skipped voting.', 'info');
        return true;
    }

    async function verifyVote(rollNumber, pin) {
        const voter = getVoterByRoll(rollNumber);
        if (!voter) {
            showToast('Voter not found.', 'error');
            return null;
        }
        if (!voter.hasVoted || voter.skipped) {
            showToast('You have not cast a vote.', 'error');
            return null;
        }
        if (!voter.pinHash) {
            showToast('You did not set a PIN for this vote.', 'error');
            return null;
        }
        if (hashString(pin) !== voter.pinHash) {
            showToast('Incorrect PIN.', 'error');
            return null;
        }
        if (!voter.voteEncrypted) {
            showToast('No vote data found.', 'error');
            return null;
        }
        try {
            let voteData;
            if (voter.pinHash) {
                voteData = await decryptVote(voter.voteEncrypted, pin);
            } else {
                voteData = JSON.parse(atob(voter.voteEncrypted));
            }
            if (!voteData) {
                showToast('Failed to decrypt vote.', 'error');
                return null;
            }
            return voteData;
        } catch (_) {
            showToast('Failed to decrypt vote. Incorrect PIN or corrupted data.', 'error');
            return null;
        }
    }

    function resetElection() {
        if (!confirm('⚠️ Reset all votes and results? This cannot be undone!')) return;
        for (const v of appData.voters) {
            v.hasVoted = false;
            v.skipped = false;
            v.pinHash = null;
            v.voteEncrypted = null;
            v.voteTimestamp = null;
        }
        appData.results = {};
        for (const cat of appData.categories) {
            appData.results[cat.id] = {};
        }
        appData.settings.resultsPublished = false;
        saveData();
        renderAll();
        showToast('Election has been reset.', 'info');
    }

    function publishResults() {
        appData.settings.resultsPublished = !appData.settings.resultsPublished;
        saveData();
        renderAll();
        showToast(appData.settings.resultsPublished ? '📊 Results published!' : 'Results unpublished.', 'gold');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  7.  MODAL CONTROLS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function openModal(id) {
        document.getElementById(id).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
        document.body.style.overflow = '';
    }

    // ─── Cast Votes Modal ───
    function openCastVotesModal() {
        if (!appData.settings.isActive) {
            showToast('Voting is currently closed.', 'error');
            return;
        }
        if (appData.settings.resultsPublished) {
            showToast('Results have been published. Voting is closed.', 'error');
            return;
        }
        // Gather selections from homepage
        const selections = {};
        let allSelected = true;
        let reviewHtml = '';
        for (const cat of appData.categories) {
            const radio = document.querySelector(`input[name="category_${cat.id}"]:checked`);
            if (radio) {
                const nomineeId = radio.value;
                const nominee = getNomineeById(nomineeId);
                if (nominee) {
                    selections[cat.id] = nomineeId;
                    reviewHtml += `<div><strong>${cat.name}:</strong> ${nominee.name}</div>`;
                }
            } else {
                allSelected = false;
                reviewHtml += `<div><strong>${cat.name}:</strong> <span class="text-danger">Not selected</span></div>`;
            }
        }
        if (!allSelected) {
            showToast('Please select a nominee for every category.', 'error');
            return;
        }
        // Store selections in a data attribute for the modal
        document.getElementById('voteModal').dataset.selections = JSON.stringify(selections);
        document.getElementById('voteReviewContainer').innerHTML = reviewHtml;
        document.getElementById('voterIdInput').value = '';
        document.getElementById('voterPinInput').value = '';
        // Show/hide PIN field based on mode
        const mode = appData.settings.electionMode || 'optional_pin';
        const pinWrap = document.getElementById('pinFieldWrap');
        const pinInput = document.getElementById('voterPinInput');
        const pinStar = document.getElementById('pinRequiredStar');
        const helpText = document.getElementById('pinHelpText');
        if (mode === 'no_pin') {
            pinWrap.style.display = 'none';
        } else {
            pinWrap.style.display = 'block';
            if (mode === 'required_pin') {
                pinStar.style.display = 'inline';
                helpText.textContent = 'Set a 4+ digit PIN to verify your vote later.';
                pinInput.required = true;
            } else {
                pinStar.style.display = 'none';
                helpText.textContent = 'Optional: set a PIN to verify your vote later.';
                pinInput.required = false;
            }
        }
        openModal('voteModal');
    }

    // ─── Verify Modal ───
    function openVerifyModal() {
        document.getElementById('verifyVoterId').value = '';
        document.getElementById('verifyPin').value = '';
        document.getElementById('verifyResult').classList.add('hidden');
        document.getElementById('verifyResult').innerHTML = '';
        openModal('verifyModal');
    }

    // ─── Skip Modal ───
    function openSkipModal() {
        document.getElementById('skipVoterId').value = '';
        openModal('skipModal');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  8.  SETTINGS & PASSWORD
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let settingsUnlocked = false;

    function showSettingsPassword() {
        document.getElementById('passwordOverlay').classList.add('active');
        document.getElementById('settingsPasswordInput').value = '';
        document.getElementById('pwError').classList.add('hidden');
        document.getElementById('settingsPasswordInput').focus();
    }

    function unlockSettings(password) {
        const hash = hashString(password);
        if (hash === appData.settings.adminPasswordHash) {
            settingsUnlocked = true;
            document.getElementById('passwordOverlay').classList.remove('active');
            document.getElementById('settingsPage').classList.add('active');
            document.getElementById('homepage').style.display = 'none';
            renderAllSettings();
            showToast('Settings unlocked.', 'success');
        } else {
            document.getElementById('pwError').classList.remove('hidden');
            showToast('Incorrect password.', 'error');
        }
    }

    function closeSettings() {
        settingsUnlocked = false;
        document.getElementById('settingsPage').classList.remove('active');
        document.getElementById('homepage').style.display = 'block';
        renderAll();
    }

    function changeAdminPassword(newPass, confirmPass) {
        if (!newPass || newPass.length < 4) {
            showToast('Password must be at least 4 characters.', 'error');
            return;
        }
        if (newPass !== confirmPass) {
            showToast('Passwords do not match.', 'error');
            return;
        }
        appData.settings.adminPasswordHash = hashString(newPass);
        saveData();
        showToast('Admin password updated.', 'success');
        document.getElementById('newAdminPass').value = '';
        document.getElementById('confirmAdminPass').value = '';
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  9.  RENDER ALL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function renderAll() {
        if (document.getElementById('settingsPage').classList.contains('active')) {
            if (settingsUnlocked) {
                renderAllSettings();
            }
        } else {
            renderHomepage();
            updateStatusBadge();
            // Update header branding
            document.getElementById('schoolNameDisplay').innerHTML = `<i class="fas fa-school"></i> ${appData.schoolName || 'School'}`;
            document.getElementById('schoolSubtitleDisplay').textContent = appData.schoolSubtitle || '';
        }
    }

    function renderAllSettings() {
        renderSettingsGeneral();
        renderCategoryList();
        populateCategorySelect();
        renderNomineeList();
        renderVoterList();
        renderStats();
        renderResults();
        // Update header branding as well
        document.getElementById('schoolNameDisplay').innerHTML = `<i class="fas fa-school"></i> ${appData.schoolName || 'School'}`;
        document.getElementById('schoolSubtitleDisplay').textContent = appData.schoolSubtitle || '';
        updateStatusBadge();
        updateButtonVisibility();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  10. EVENT BINDING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function init() {
        loadData();
        initializeResults();

        // ─── Home / Settings toggle ───
        document.getElementById('settingsBtn').addEventListener('click', function() {
            if (document.getElementById('settingsPage').classList.contains('active')) {
                closeSettings();
                return;
            }
            showSettingsPassword();
        });

        document.getElementById('homeBtn').addEventListener('click', function() {
            if (document.getElementById('settingsPage').classList.contains('active')) {
                closeSettings();
            }
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);

        // ─── Password overlay ───
        document.getElementById('settingsPwSubmit').addEventListener('click', function() {
            const pw = document.getElementById('settingsPasswordInput').value;
            unlockSettings(pw);
        });
        document.getElementById('settingsPasswordInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('settingsPwSubmit').click();
            }
        });
        document.getElementById('settingsPwCancel').addEventListener('click', function() {
            document.getElementById('passwordOverlay').classList.remove('active');
        });

        // ─── Modal close buttons ───
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', function() {
                closeModal(this.dataset.close);
            });
        });
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModal(this.id);
                }
            });
        });

        // ─── Cast Votes button ───
        document.getElementById('castVoteBtn').addEventListener('click', openCastVotesModal);

        // ─── Vote form ───
        document.getElementById('voteForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const roll = document.getElementById('voterIdInput').value.trim();
            const pin = document.getElementById('voterPinInput').value;
            const mode = appData.settings.electionMode || 'optional_pin';

            if (!roll) {
                showToast('Please enter your roll number.', 'error');
                return;
            }
            if (mode === 'required_pin' && (!pin || pin.length < 4)) {
                showToast('PIN is required (minimum 4 characters).', 'error');
                return;
            }
            if (mode === 'optional_pin' && pin && pin.length < 4) {
                showToast('PIN must be at least 4 characters if set.', 'error');
                return;
            }

            const selections = JSON.parse(document.getElementById('voteModal').dataset.selections || '{}');
            const success = await castVotes(roll, selections, pin);
            if (success) {
                closeModal('voteModal');
            }
        });

        // ─── Verify form ───
        document.getElementById('verifyForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const roll = document.getElementById('verifyVoterId').value.trim();
            const pin = document.getElementById('verifyPin').value;
            if (!roll || !pin) {
                showToast('Please fill in all fields.', 'error');
                return;
            }
            const result = await verifyVote(roll, pin);
            const container = document.getElementById('verifyResult');
            container.classList.remove('hidden');
            if (result) {
                let html = `<div style="font-weight:700;margin-bottom:8px;">✅ Your votes:</div>`;
                for (const catId in result.selections) {
                    const nomineeId = result.selections[catId];
                    const nominee = getNomineeById(nomineeId);
                    const cat = getCategoryById(catId);
                    html += `<div><strong>${cat?cat.name:'Unknown'}:</strong> ${nominee?nominee.name:'Unknown'}</div>`;
                }
                html += `<div class="text-muted text-small" style="margin-top:6px;">${new Date(result.timestamp).toLocaleString()}</div>`;
                container.innerHTML = html;
                showToast('Vote verified successfully!', 'success');
            } else {
                container.innerHTML = `<div style="color:var(--danger);">❌ Could not verify your vote. Please check your PIN.</div>`;
            }
        });

        // ─── Skip form ───
        document.getElementById('skipForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const roll = document.getElementById('skipVoterId').value.trim();
            if (!roll) {
                showToast('Please enter your roll number.', 'error');
                return;
            }
            const success = await skipVote(roll);
            if (success) {
                closeModal('skipModal');
            }
        });

        // ─── Homepage action buttons ───
        document.getElementById('skipVoteBtn').addEventListener('click', openSkipModal);
        document.getElementById('verifyVoteBtn').addEventListener('click', openVerifyModal);

        // ─── Settings: General / Branding ───
        document.getElementById('brandingForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('schoolNameInput').value.trim();
            const subtitle = document.getElementById('schoolSubtitleInput').value.trim();
            if (name) appData.schoolName = name;
            if (subtitle) appData.schoolSubtitle = subtitle;
            saveData();
            renderAllSettings();
            showToast('Branding updated.', 'success');
        });

        document.getElementById('visibilityForm').addEventListener('submit', function(e) {
            e.preventDefault();
            appData.settings.showSkipButton = document.getElementById('showSkipCheckbox').checked;
            appData.settings.showVerifyButton = document.getElementById('showVerifyCheckbox').checked;
            saveData();
            renderAllSettings();
            showToast('Visibility settings saved.', 'success');
        });

        // ─── Settings: Election Mode ───
        document.getElementById('settingsForm').addEventListener('submit', function(e) {
            e.preventDefault();
            appData.settings.electionMode = document.getElementById('electionMode').value;
            appData.settings.isActive = document.getElementById('electionStatus').value === 'active';
            saveData();
            renderAllSettings();
            showToast('Election settings saved.', 'success');
        });

        // ─── Settings: Change Password ───
        document.getElementById('changePassBtn').addEventListener('click', function() {
            const newPass = document.getElementById('newAdminPass').value;
            const confirmPass = document.getElementById('confirmAdminPass').value;
            changeAdminPassword(newPass, confirmPass);
        });

        // ─── Settings: Categories ───
        document.getElementById('addCategoryForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('newCategoryName').value.trim();
            if (addCategory(name)) {
                this.reset();
            }
        });

        document.getElementById('resetDefaultCategoriesBtn').addEventListener('click', resetDefaultCategories);

        // ─── Settings: Nominees ───
        document.getElementById('addNomineeForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('nomName').value.trim();
            const categoryId = document.getElementById('nomCategory').value;
            const photo = document.getElementById('nomPhoto').value.trim();
            const problems = document.getElementById('nomProblems').value.trim();
            const why = document.getElementById('nomWhy').value.trim();
            if (!name || !categoryId) {
                showToast('Please fill in name and category.', 'error');
                return;
            }
            if (addNominee(name, categoryId, photo, problems, why)) {
                this.reset();
                document.getElementById('nomPhoto').value = '';
                document.getElementById('nomProblems').value = '';
                document.getElementById('nomWhy').value = '';
                renderNomineeList();
                renderStats();
            }
        });

        // ─── Settings: CSV Import ───
        const dropArea = document.getElementById('csvDropArea');
        const fileInput = document.getElementById('csvFileInput');

        dropArea.addEventListener('click', () => fileInput.click());
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = 'var(--primary)';
            dropArea.style.background = '#e8f0fe';
        });
        dropArea.addEventListener('dragleave', () => {
            dropArea.style.borderColor = '#dce3ec';
            dropArea.style.background = '#fafcfe';
        });
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = '#dce3ec';
            dropArea.style.background = '#fafcfe';
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                handleCsvFile(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleCsvFile(this.files[0]);
            }
            this.value = '';
        });

        async function handleCsvFile(file) {
            try {
                const text = await file.text();
                importVoters(text);
            } catch (_) {
                showToast('Failed to read file.', 'error');
            }
        }

        document.getElementById('sampleCsvBtn').addEventListener('click', function() {
            const sample = `rollNumber,name
1001,Emma Williams
1002,James Rodriguez
1003,Sophia Chen
1004,Michael Okafor
1005,Olivia Smith`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_voters.csv';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('clearVotersBtn').addEventListener('click', clearAllVoters);

        // ─── Settings: Results ───
        document.getElementById('publishResultsBtn').addEventListener('click', publishResults);
        document.getElementById('resetElectionBtn').addEventListener('click', resetElection);

        // ─── Settings: Export / Clear ───
        document.getElementById('exportDataBtn').addEventListener('click', function() {
            const json = JSON.stringify(appData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `election_data_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Data exported.', 'success');
        });

        document.getElementById('clearAllDataBtn').addEventListener('click', function() {
            if (!confirm('⚠️ Delete ALL election data? This cannot be undone!')) return;
            localStorage.removeItem(STORAGE_KEY);
            loadData();
            initializeResults();
            renderAll();
            showToast('All data cleared.', 'info');
        });

        // ─── Settings Tabs ───
        document.querySelectorAll('.settings-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.settings-tabs .tab-btn').forEach(b => b.classList.remove(
                'active'));
                this.classList.add('active');
                document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove(
                'active'));
                document.getElementById(this.dataset.tab).classList.add('active');
                // Refresh content
                if (this.dataset.tab === 'tabGeneral') renderSettingsGeneral();
                if (this.dataset.tab === 'tabCategories') renderCategoryList();
                if (this.dataset.tab === 'tabNominees') { populateCategorySelect();
                    renderNomineeList(); }
                if (this.dataset.tab === 'tabVoters') renderVoterList();
                if (this.dataset.tab === 'tabResults') { renderStats();
                    renderResults(); }
            });
        });

        // ─── Initial render ───
        renderAll();
        updateButtonVisibility();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  11. START
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    document.addEventListener('DOMContentLoaded', init);

})();

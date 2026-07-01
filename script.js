(function() {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  1.  DATA LAYER  (localStorage)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const STORAGE_KEY = 'electionAppData_v2';

    function getDefaultHouses() {
        return [
            { id: 'red', name: 'Red House', color: '#e74c3c' },
            { id: 'green', name: 'Green House', color: '#27ae60' },
            { id: 'yellow', name: 'Yellow House', color: '#f39c12' },
            { id: 'blue', name: 'Blue House', color: '#3498db' }
        ];
    }

    function getDefaultCategories() {
        return [
            { id: 'head_boy', name: 'Head Boy', houseSpecific: false, houseId: null },
            { id: 'head_girl', name: 'Head Girl', houseSpecific: false, houseId: null },
            { id: 'deputy_head_boy', name: 'Deputy Head Boy', houseSpecific: false, houseId: null },
            { id: 'deputy_head_girl', name: 'Deputy Head Girl', houseSpecific: false, houseId: null },
            { id: 'house_captain', name: 'House Captain', houseSpecific: true, houseId: null },
            { id: 'house_vice_captain', name: 'House Vice Captain', houseSpecific: true, houseId: null },
            { id: 'discipline_leader', name: 'Discipline Leader', houseSpecific: false, houseId: null },
            { id: 'hygiene_leader', name: 'Hygiene Leader', houseSpecific: false, houseId: null },
            { id: 'sports_captain', name: 'Sports Captain', houseSpecific: false, houseId: null },
            { id: 'sports_vice_captain', name: 'Sports Vice Captain', houseSpecific: false, houseId: null },
            { id: 'cultural_secretary', name: 'Cultural Secretary', houseSpecific: false, houseId: null }
        ];
    }

    function getDefaultData() {
        return {
            schoolName: 'Springfield High',
            schoolSubtitle: 'Student Council Election 2026',
            houses: getDefaultHouses(),
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
                lastHomeHouseId: null,
            },
            results: {} // will be computed
        };
    }

    let appData = null;
    let editingNomineeId = null;
    let editingVoterId = null;
    let activeHomeVoterId = null;
    let activeHomeHouseId = null;

    async function loadData() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                appData = JSON.parse(stored);
                activeHomeHouseId = appData.settings?.lastHomeHouseId || null;
                migrateVoterIds();
                return;
            }
        } catch (_) { /* ignore */ }
        appData = getDefaultData();
        activeHomeHouseId = null;
    }

    function migrateVoterIds() {
        if (!appData || !appData.voters) return;
        let changed = false;
        for (const v of appData.voters) {
            const rStr = (v.rollNumber || '').trim();
            const cStr = (v.className || '').trim();
            const sStr = (v.section || '').trim();
            const adm = (v.admissionNumber || '').trim();
            if (adm.toLowerCase() === '1' + cStr.toLowerCase() + sStr.toLowerCase() && rStr && rStr !== '1') {
                v.admissionNumber = rStr + cStr + sStr;
                changed = true;
            }
        }
        if (changed) {
            saveData();
        }
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        } catch (_) { /* storage full or unavailable */ }
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

    const COLOR_MAP = {
        'red': '#e74c3c',
        'green': '#27ae60',
        'yellow': '#f39c12',
        'blue': '#3498db',
        'orange': '#e67e22',
        'purple': '#9b59b6',
        'pink': '#e91e63',
        'teal': '#1abc9c',
        'cyan': '#00bcd4',
        'brown': '#795548',
        'grey': '#95a5a6',
        'gray': '#95a5a6',
        'black': '#2c3e50',
        'white': '#ffffff',
        'gold': '#d4a847',
        'silver': '#bdc3c7',
        'navy': '#1a3a6b',
        'lime': '#cddc39',
        'maroon': '#800000',
        'indigo': '#3f51b5',
        'magenta': '#e040fb'
    };

    function colorNameToHex(name) {
        if (!name) return null;
        const normalized = name.trim().toLowerCase();
        if (/^#([0-9a-f]{3}){1,2}$/i.test(normalized)) {
            return normalized;
        }
        if (COLOR_MAP[normalized]) {
            return COLOR_MAP[normalized];
        }
        return null;
    }

    function hexToColorName(hex) {
        if (!hex) return 'Blue';
        const normalized = hex.trim().toLowerCase();
        const name = Object.keys(COLOR_MAP).find(key => COLOR_MAP[key].toLowerCase() === normalized);
        if (name) {
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        return hex;
    }

    function getSupportedColorNames() {
        return Object.keys(COLOR_MAP)
            .filter(name => name !== 'gray')
            .map(name => name.charAt(0).toUpperCase() + name.slice(1))
            .join(', ');
    }

    function generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    function getCategoryById(id) {
        return appData.categories.find(c => c.id === id);
    }

    function getHouseById(id) {
        return appData.houses.find(h => h.id === id);
    }

    function getNomineeById(id) {
        return appData.nominees.find(n => n.id === id);
    }

    function getVoterByRoll(roll) {
        const voterId = roll.toLowerCase().trim();
        return appData.voters.find(v => (v.admissionNumber || '').toLowerCase() === voterId) ||
            appData.voters.find(v => (v.rollNumber || '').toLowerCase() === voterId);
    }

    function getVoterById(id) {
        return appData.voters.find(v => v.id === id);
    }

    function getActiveHomeVoter() {
        return activeHomeVoterId ? getVoterById(activeHomeVoterId) : null;
    }

    function getEffectiveHouseIdForVoter(voter) {
        if (!voter) return null;
        return voter.houseId || (voter.id === activeHomeVoterId ? activeHomeHouseId : null);
    }

    function hasHouseSpecificCategories() {
        return appData.categories.some(cat => cat.houseSpecific);
    }

    function getEligibleCategoriesForVoter(voter) {
        const houseId = getEffectiveHouseIdForVoter(voter);
        return appData.categories.filter(cat => !cat.houseSpecific || !!houseId);
    }

    function getNomineesForCategoryAndVoter(category, voter) {
        if (!category.houseSpecific) {
            return getNomineesByCategory(category.id);
        }
        const houseId = getEffectiveHouseIdForVoter(voter);
        if (!houseId) return [];
        return getNomineesByCategoryAndHouse(category.id, houseId);
    }

    function getNomineesByCategory(categoryId) {
        return appData.nominees.filter(n => n.categoryId === categoryId);
    }

    function getNomineesByCategoryAndHouse(categoryId, houseId) {
        return appData.nominees.filter(n => n.categoryId === categoryId && n.houseId === houseId);
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

    // House CRUD functions
    async function addHouse(name, color) {
        if (!name.trim()) return false;
        if (appData.houses.find(h => h.name.toLowerCase() === name.trim().toLowerCase())) {
            showToast('House already exists.', 'error');
            return false;
        }
        appData.houses.push({ id: generateId(), name: name.trim(), color: color || '#3498db' });
        saveData();
        renderAllSettings();
        showToast(`House "${name.trim()}" added.`, 'success');
        return true;
    }

    async function removeHouse(id) {
        appData.houses = appData.houses.filter(h => h.id !== id);
        saveData();
        renderAllSettings();
        showToast('House removed.', 'info');
        return true;
    }

    async function resetDefaultHouses() {
        if (!confirm('Reset to default houses? This will remove all current houses.')) return;
        appData.houses = getDefaultHouses();
        saveData();
        renderAllSettings();
        showToast('Houses reset to default.', 'success');
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
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
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
        renderHomeVoterCard();
        if (appData.categories.length === 0) {
            container.innerHTML =
                '<div class="text-center text-muted" style="padding:40px 0;">No categories defined. Please add categories in settings.</div>';
            updateButtonVisibility();
            renderAttendanceBadge();
            renderAttendanceStats();
            return;
        }
        const voter = getActiveHomeVoter();
        if (!voter) {
            container.innerHTML =
                '<div class="text-center text-muted" style="padding:32px 0;">Enter your admission number above to see your ballot.</div>';
            updateButtonVisibility();
            renderAttendanceBadge();
            renderAttendanceStats();
            return;
        }
        const effectiveHouseId = getEffectiveHouseIdForVoter(voter);
        if (hasHouseSpecificCategories() && !effectiveHouseId) {
            container.innerHTML =
                '<div class="text-center text-muted" style="padding:32px 0;">Select the voter house above to see house-wise nominees.</div>';
            updateButtonVisibility();
            renderAttendanceBadge();
            renderAttendanceStats();
            return;
        }

        let html = '';
        let hasNominees = false;
        const categories = getEligibleCategoriesForVoter(voter);
        for (const cat of categories) {
            const nominees = getNomineesForCategoryAndVoter(cat, voter);
            const house = cat.houseSpecific ? getHouseById(effectiveHouseId) : null;
            const heading = house ? `${cat.name} - ${house.name}` : cat.name;
            if (nominees.length === 0) {
                html += `
                    <div class="category-section">
                        <div class="cat-header">
                            <h3>${heading}</h3>
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
                        <h3>${heading}</h3>
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
        renderAttendanceBadge();
        renderAttendanceStats();
    }

    function renderHomeVoterCard() {
        const form = document.getElementById('homeVoterForm');
        const active = document.getElementById('homeVoterActive');
        const voter = getActiveHomeVoter();
        if (!form || !active) return;
        if (!voter) {
            form.style.display = 'flex';
            active.classList.add('hidden');
            active.innerHTML = '';
            return;
        }
        const effectiveHouseId = getEffectiveHouseIdForVoter(voter);
        const house = effectiveHouseId ? getHouseById(effectiveHouseId) : null;
        const houseOptions = appData.houses.map(h =>
            `<option value="${h.id}" ${h.id === activeHomeHouseId ? 'selected' : ''}>${h.name}</option>`
        ).join('');
        form.style.display = 'none';
        active.classList.remove('hidden');
        active.innerHTML = `
            <div>
                <strong>${voter.name}</strong>
                <span class="text-muted text-small">ID: ${voter.admissionNumber || voter.rollNumber || ''}${house ? ` · ${house.name}` : ''}</span>
            </div>
            ${voter.houseId ? '' : `
                <label class="home-house-select">
                    <span>House</span>
                    <select id="homeHouseSelect">
                        <option value="">Select House</option>
                        ${houseOptions}
                    </select>
                </label>
            `}
            <button type="button" class="btn btn-sm btn-outline" id="changeHomeVoterBtn"><i class="fas fa-sync-alt"></i> Change Voter</button>
        `;
        const houseSelect = document.getElementById('homeHouseSelect');
        if (houseSelect) {
            houseSelect.addEventListener('change', function() {
                activeHomeHouseId = this.value || null;
                appData.settings.lastHomeHouseId = activeHomeHouseId;
                saveData();
                renderHomepage();
            });
        }
        document.getElementById('changeHomeVoterBtn').addEventListener('click', function() {
            activeHomeVoterId = null;
            document.getElementById('homeVoterIdInput').value = '';
            renderHomepage();
        });
    }

    function renderAttendanceBadge() {
        const existing = document.querySelector('.homepage-actions .attendance-badge');
        if (existing) existing.remove();
        const actions = document.querySelector('.homepage-actions');
        if (!actions) return;
        const badge = document.createElement('span');
        badge.className = 'badge attendance-badge';
        badge.style.cssText =
            'background:var(--gold);color:#fff;padding:6px 16px;border-radius:30px;font-size:0.85rem;display:inline-flex;align-items:center;gap:8px;';
        badge.innerHTML = `<i class="fas fa-users"></i> Attendance: ${getVotedCount()}/${getTotalVoters()}`;
        actions.prepend(badge);
    }

    function renderAttendanceStats() {
        const container = document.getElementById('attendanceStats');
        if (!container) return;
        if (appData.voters.length === 0) {
            container.innerHTML = '';
            return;
        }
        const groups = {};
        for (const voter of appData.voters) {
            const className = (voter.className || 'Unassigned').trim() || 'Unassigned';
            const section = (voter.section || 'No Section').trim() || 'No Section';
            const key = `${className}||${section}`;
            if (!groups[key]) {
                groups[key] = { className, section, total: 0, voted: 0, skipped: 0 };
            }
            groups[key].total++;
            if (voter.hasVoted && !voter.skipped) groups[key].voted++;
            if (voter.skipped) groups[key].skipped++;
        }
        const cards = Object.values(groups)
            .sort((a, b) => `${a.className} ${a.section}`.localeCompare(`${b.className} ${b.section}`, undefined, { numeric: true }))
            .map(group => {
                const pending = group.total - group.voted - group.skipped;
                return `
                    <div class="attendance-card">
                        <div class="attendance-class">Class ${group.className} ${group.section}</div>
                        <div class="attendance-count">${group.voted}/${group.total}</div>
                        <div class="attendance-meta">${pending} pending · ${group.skipped} skipped</div>
                    </div>
                `;
            }).join('');
        container.innerHTML = `
            <div class="attendance-title"><i class="fas fa-chart-bar"></i> Attendance by Class &amp; Section</div>
            <div class="attendance-grid">${cards}</div>
        `;
    }

    function updateButtonVisibility() {
        const mode = appData.settings.electionMode || 'optional_pin';
        const showSkip = appData.settings.showSkipButton !== false;
        const showVerifySetting = appData.settings.showVerifyButton !== false;
        // Verify button is only relevant if PIN is used (optional or required)
        const showVerify = (mode !== 'no_pin') && showVerifySetting;
        const voter = getActiveHomeVoter();
        const canCast = !!voter && (!hasHouseSpecificCategories() || !!getEffectiveHouseIdForVoter(voter));

        document.getElementById('castVoteBtn').style.display = canCast ? 'inline-flex' : 'none';
        document.getElementById('skipVoteBtn').style.display = showSkip ? 'inline-flex' : 'none';
        document.getElementById('verifyVoteBtn').style.display = showVerify ? 'inline-flex' : 'none';

        const published = appData.settings.resultsPublished;
        const publicResultsBtn = document.getElementById('publicResultsBtn');
        if (publicResultsBtn) {
            publicResultsBtn.style.display = published ? 'inline-flex' : 'none';
        }
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
            const houseLabel = cat.houseSpecific ? (cat.houseId ? ` (${getHouseById(cat.houseId)?.name || 'Unknown'})` : ' (All Houses)') : '';
            html += `
                <div class="category-item">
                    <span class="cat-name">${cat.name}${houseLabel} <span class="text-muted text-small">(${nomineeCount} nominees)</span></span>
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

    function renderHouseList() {
        const container = document.getElementById('houseList');
        if (appData.houses.length === 0) {
            container.innerHTML = '<div class="text-muted">No houses defined.</div>';
            return;
        }
        let html = '';
        for (const h of appData.houses) {
            const voterCount = appData.voters.filter(v => v.houseId === h.id).length;
            html += `
                <div class="category-item">
                    <span class="cat-name">
                        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${h.color};margin-right:8px;"></span>
                        ${h.name} <span class="text-muted text-small">(${voterCount} voters)</span>
                    </span>
                    <div class="cat-actions">
                        <button class="btn btn-danger btn-xs remove-house" data-id="${h.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.remove-house').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                removeHouse(id);
            });
        });
    }

    function populateHouseSelect(selectId, includeAll = false) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';
        if (includeAll) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'All Houses';
            select.appendChild(opt);
        }
        for (const h of appData.houses) {
            const opt = document.createElement('option');
            opt.value = h.id;
            opt.textContent = h.name;
            select.appendChild(opt);
        }
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
                        <button class="btn btn-outline btn-xs edit-nominee" data-id="${n.id}" title="Edit nominee"><i class="fas fa-pen"></i></button>
                        <button class="btn btn-danger btn-xs remove-nominee" data-id="${n.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.edit-nominee').forEach(btn => {
            btn.addEventListener('click', function() {
                startEditNominee(this.dataset.id);
            });
        });
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
            container.innerHTML = '<div class="text-muted text-center" style="padding:16px 0;">No voters added yet.</div>';
            return;
        }
        let html = '';
        for (const v of appData.voters) {
            let status = 'Pending';
            let cls = '';
            if (v.hasVoted && !v.skipped) { status = '✅ Voted';
                cls = 'voted'; } else if (v.skipped) { status = '⏭️ Skipped';
                cls = 'skipped'; }
            const house = v.houseId ? getHouseById(v.houseId) : null;
            const details = [
                `ID: ${v.admissionNumber || v.rollNumber || '—'}`,
                v.className ? `Class ${v.className}` : '',
                v.section ? `Section ${v.section}` : '',
                v.rollNumber ? `Roll ${v.rollNumber}` : '',
                house ? house.name : ''
            ].filter(Boolean).join(' · ');
            html += `
                <div class="voter-item">
                    <div class="voter-info">
                        <div><strong>${v.name}</strong></div>
                        <div class="v-meta">${details}</div>
                    </div>
                    <div class="voter-actions">
                        <span class="v-status ${cls}">${status}</span>
                        <button class="btn btn-outline btn-xs edit-voter" data-id="${v.id}" title="Edit voter"><i class="fas fa-pen"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('.edit-voter').forEach(btn => {
            btn.addEventListener('click', function() {
                startEditVoter(this.dataset.id);
            });
        });
    }

    function renderStatsView(container) {
        if (!container) return;
        const total = getTotalVoters();
        const voted = getVotedCount();
        const skipped = getSkippedCount();
        const pending = getPendingCount();
        const turnout = total > 0 ? Math.round((voted / total) * 100) : 0;

        container.innerHTML = `
            <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Voters</div></div>
            <div class="stat-card"><div class="stat-num">${voted}</div><div class="stat-label">Voted</div></div>
            <div class="stat-card"><div class="stat-num">${skipped}</div><div class="stat-label">Skipped</div></div>
            <div class="stat-card"><div class="stat-num">${pending}</div><div class="stat-label">Pending</div></div>
            <div class="stat-card"><div class="stat-num">${turnout}%</div><div class="stat-label">Turnout</div></div>
            <div class="stat-card"><div class="stat-num">${appData.nominees.length}</div><div class="stat-label">Total Nominees</div></div>
            <div class="stat-card"><div class="stat-num">${appData.categories.length}</div><div class="stat-label">Categories</div></div>
        `;
    }

    function renderStats() {
        renderStatsView(document.getElementById('statsGrid'));
    }

    function renderResultsView(container, isAdmin) {
        if (!container) return;
        const published = appData.settings.resultsPublished;
        const isActive = appData.settings.isActive;

        // Non-admin can't see results if they aren't published
        if (!isAdmin && !published) {
            container.innerHTML = '<div class="text-muted text-center" style="padding:20px 0;">Results are not yet published.</div>';
            return;
        }

        let html = '';
        for (const cat of appData.categories) {
            const groups = cat.houseSpecific ?
                appData.houses.map(house => ({
                    title: `${cat.name} - ${house.name}`,
                    nominees: getNomineesByCategoryAndHouse(cat.id, house.id)
                })) :
                [{ title: cat.name, nominees: getNomineesByCategory(cat.id) }];

            const catResults = appData.results[cat.id] || {};

            for (const group of groups) {
                if (group.nominees.length === 0) {
                    continue;
                }

                // Calculate total votes in this category group
                const totalGroupVotes = group.nominees.reduce((sum, n) => sum + (catResults[n.id] || 0), 0);

                // Sort nominees by votes descending (Candidate ranking)
                const sortedNominees = [...group.nominees].sort((a, b) => {
                    const votesA = catResults[a.id] || 0;
                    const votesB = catResults[b.id] || 0;
                    return votesB - votesA;
                });

                // Find max votes to identify the winner(s)
                const maxVotes = Math.max(0, ...sortedNominees.map(n => catResults[n.id] || 0));

                html += `
                    <div class="result-category-card">
                        <div class="result-category-header">
                            <h5>${group.title}</h5>
                            <span class="total-group-votes"><i class="fas fa-vote-yea"></i> ${totalGroupVotes} vote${totalGroupVotes !== 1 ? 's' : ''} cast</span>
                        </div>
                        <div class="result-nominees-list">
                `;

                sortedNominees.forEach((n, index) => {
                    const v = catResults[n.id] || 0;
                    const pct = totalGroupVotes > 0 ? Math.round((v / totalGroupVotes) * 100) : 0;
                    const isWinner = v === maxVotes && maxVotes > 0;
                    const rank = index + 1;

                    const photoHtml = n.photo ?
                        `<img src="${n.photo}" alt="${n.name}" onerror="this.style.display='none';this.parentElement.textContent='👤';" />` :
                        '👤';

                    html += `
                        <div class="result-nominee-card ${isWinner ? 'winner-card' : ''}">
                            <div class="result-nominee-rank ${isWinner ? 'rank-winner' : ''}">
                                ${isWinner ? '<i class="fas fa-trophy winner-trophy"></i>' : `#${rank}`}
                            </div>
                            <div class="result-nominee-avatar">${photoHtml}</div>
                            <div class="result-nominee-details">
                                <div class="result-nominee-name">
                                    <span>${n.name}</span>
                                    ${isWinner ? '<span class="winner-badge"><i class="fas fa-crown"></i> Winner</span>' : ''}
                                </div>
                                <div class="result-bar-container">
                                    <div class="result-bar-track">
                                        <div class="result-bar-fill ${isWinner ? 'fill-winner' : ''}" style="width: ${pct}%;"></div>
                                    </div>
                                    <div class="result-bar-stats">
                                        <span class="pct-text">${pct}%</span>
                                        <span class="votes-text"><strong>${v}</strong> vote${v !== 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }
        }

        if (!html) {
            const hasNominees = appData.nominees && appData.nominees.length > 0;
            const title = hasNominees ? 'No votes have been recorded yet.' : 'No Results Available Yet';
            container.innerHTML = `
                <div style="text-align: center; padding: 50px 20px;">
                    <i class="fas fa-chart-bar" style="font-size: 3.5rem; color: #bdc3c7; margin-bottom: 15px;"></i>
                    <h3 style="color: var(--secondary); font-weight: 600; margin-bottom: 10px;">${title}</h3>
                    <p style="color: #7f8c8d; font-size: 0.95rem; max-width: 400px; margin: 0 auto; line-height: 1.5;">
                        Results will appear here once voting has started and at least one vote has been recorded.
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = html;
        }
    }

    function renderResults() {
        const container = document.getElementById('resultsContainer');
        renderResultsView(container, true);
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

    function openPublicResults() {
        settingsUnlocked = false;
        document.getElementById('settingsPage').classList.remove('active');
        document.getElementById('homepage').style.display = 'none';
        
        const publicResultsPage = document.getElementById('publicResultsPage');
        if (publicResultsPage) {
            publicResultsPage.classList.add('active');
            publicResultsPage.style.display = 'block';
        }
        
        renderStatsView(document.getElementById('publicStatsGrid'));
        renderResultsView(document.getElementById('publicResultsContainer'), false);
    }

    function closePublicResults() {
        const publicResultsPage = document.getElementById('publicResultsPage');
        if (publicResultsPage) {
            publicResultsPage.classList.remove('active');
            publicResultsPage.style.display = 'none';
        }
        document.getElementById('homepage').style.display = 'block';
        renderAll();
    }

    function getResultsCsvData() {
        if (appData.nominees.length === 0) return null;

        const schoolName = appData.branding?.schoolName || 'Your School';
        const electionTitle = appData.branding?.electionTitle || 'Student Council Election';
        const now = new Date();
        const formattedDate = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
            String(now.getDate()).padStart(2, '0') + ' ' + 
            now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        const totalVoters = appData.voters.length;
        const totalVotesCast = appData.voters.filter(v => v.hasVoted).length;
        const turnoutPct = totalVoters > 0 ? ((totalVotesCast / totalVoters) * 100).toFixed(1) + '%' : '0.0%';
        const resultsPublished = appData.settings?.resultsPublished ? 'Yes' : 'No';

        let csv = `School Name,${csvEscape(schoolName)}\n`;
        csv += `Election Title,${csvEscape(electionTitle)}\n`;
        csv += `Export Date,${csvEscape(formattedDate)}\n`;
        csv += `Total Registered Voters,${totalVoters}\n`;
        csv += `Total Votes Cast,${totalVotesCast}\n`;
        csv += `Turnout,${turnoutPct}\n`;
        csv += `Results Published,${resultsPublished}\n\n`;

        csv += 'Candidate Name,Category,House,Votes,Vote Percentage,Result,Rank\n';

        for (const cat of appData.categories) {
            const groups = cat.houseSpecific ?
                appData.houses.map(house => ({
                    houseName: house.name,
                    nominees: getNomineesByCategoryAndHouse(cat.id, house.id)
                })) :
                [{ houseName: 'N/A', nominees: getNomineesByCategory(cat.id) }];
            
            for (const group of groups) {
                if (group.nominees.length === 0) continue;
                
                const catResults = appData.results[cat.id] || {};
                
                let nomineesWithStats = group.nominees.map(n => ({
                    ...n, 
                    votes: catResults[n.id] || 0
                }));
                
                nomineesWithStats.sort((a, b) => b.votes - a.votes);
                
                const totalGroupVotes = nomineesWithStats.reduce((a, b) => a + b.votes, 0);
                const maxVotes = nomineesWithStats.length > 0 ? nomineesWithStats[0].votes : 0;
                const winnersCount = nomineesWithStats.filter(n => n.votes === maxVotes && maxVotes > 0).length;

                let currentRank = 0;
                let previousVotes = -1;

                for (let i = 0; i < nomineesWithStats.length; i++) {
                    const n = nomineesWithStats[i];
                    
                    if (n.votes !== previousVotes) {
                        currentRank++;
                    }
                    previousVotes = n.votes;
                    
                    const pct = totalGroupVotes > 0 ? ((n.votes / totalGroupVotes) * 100).toFixed(2) + '%' : '0.00%';
                    
                    let resultStr = 'Lost';
                    if (n.votes === maxVotes && maxVotes > 0) {
                        resultStr = winnersCount > 1 ? 'Won (Tie)' : 'Won';
                    }

                    const houseName = n.houseId ? (getHouseById(n.houseId)?.name || 'Unknown') : group.houseName;
                    const finalHouseName = houseName === 'N/A' || !houseName ? 'N/A' : houseName;
                    
                    csv += [
                        n.name,
                        cat.name,
                        finalHouseName,
                        n.votes,
                        pct,
                        resultStr,
                        currentRank
                    ].map(csvEscape).join(',') + '\n';
                }
            }
        }
        return csv;
    }

    function exportResultsCsv() {
        const csv = getResultsCsvData();
        if (!csv) {
            showToast('No results to export.', 'error');
            return;
        }
        downloadCsv(csv, `election_results_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportResultsExcel() {
        const csv = getResultsCsvData();
        if (!csv) {
            showToast('No results to export.', 'error');
            return;
        }
        generateExcelFromCsv(csv, `election_results_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    function getCategoriesCsvData() {
        if (appData.categories.length === 0) return null;
        let csv = 'name,houseSpecific,houseId\n';
        for (const cat of appData.categories) {
            csv += [
                cat.name,
                cat.houseSpecific ? 'true' : 'false',
                cat.houseId || ''
            ].map(csvEscape).join(',') + '\n';
        }
        return csv;
    }

    function exportCategories() {
        const csv = getCategoriesCsvData();
        if (!csv) { showToast('No categories to export.', 'error'); return; }
        downloadCsv(csv, `categories_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportCategoriesExcel() {
        const csv = getCategoriesCsvData();
        if (!csv) { showToast('No categories to export.', 'error'); return; }
        generateExcelFromCsv(csv, `categories_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  6.  CORE OPERATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function addCategory(name, houseSpecific = false, houseId = null) {
        if (!name.trim()) return false;
        if (appData.categories.find(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
            showToast('Category already exists.', 'error');
            return false;
        }
        appData.categories.push({ id: generateId(), name: name.trim(), houseSpecific: !!houseSpecific, houseId: houseId || null });
        saveData();
        renderAllSettings();
        showToast(`Category "${name.trim()}" added.`, 'success');
        return true;
    }

    async function removeCategory(id) {
        appData.categories = appData.categories.filter(c => c.id !== id);
        appData.nominees = appData.nominees.filter(n => n.categoryId !== id);
        if (appData.results) delete appData.results[id];
        saveData();
        renderAllSettings();
        showToast('Category removed.', 'info');
    }

    async function resetDefaultCategories() {
        if (!confirm('Reset to default categories? This will remove all current categories and their nominees.')) return;
        appData.categories = getDefaultCategories();
        appData.nominees = appData.nominees.filter(n => appData.categories.find(c => c.id === n.categoryId));
        appData.results = {};
        for (const cat of appData.categories) appData.results[cat.id] = {};
        saveData();
        renderAllSettings();
        showToast('Categories reset to default.', 'success');
    }

    async function addNominee(name, categoryId, photo, problems, whyMe, houseId = null) {
        if (!name || !categoryId) return false;
        appData.nominees.push({
            id: generateId(), name: name.trim(), categoryId, houseId: houseId || null,
            photo: photo || '', manifesto: { problems: problems || '', whyMe: whyMe || '' }
        });
        saveData();
        renderAllSettings();
        showToast(`Added ${name} to ${getCategoryById(categoryId)?.name || ''}`, 'success');
        return true;
    }

    async function updateNominee(id, name, categoryId, photo, problems, whyMe, houseId = null) {
        if (!name || !categoryId) return false;
        const idx = appData.nominees.findIndex(n => n.id === id);
        if (idx === -1) return false;
        appData.nominees[idx] = { ...appData.nominees[idx], name: name.trim(), categoryId,
            houseId: houseId || null, photo: photo || '',
            manifesto: { problems: problems || '', whyMe: whyMe || '' } };
        saveData();
        renderAllSettings();
        showToast(`Updated nominee ${name}`, 'success');
        return true;
    }

    async function removeNominee(id) {
        const nominee = getNomineeById(id);
        if (!nominee) return;
        if (editingNomineeId === id) resetNomineeForm();
        appData.nominees = appData.nominees.filter(n => n.id !== id);
        saveData();
        renderAllSettings();
        showToast(`Removed ${nominee.name}`, 'info');
    }

    function setNomineeFormMode(mode) {
        const isEditing = mode === 'edit';
        document.getElementById('nomineeFormTitle').innerHTML = isEditing ?
            '<i class="fas fa-user-edit"></i> Edit Nominee' :
            '<i class="fas fa-user-plus"></i> Add Nominee';
        document.getElementById('nomineeSubmitBtn').innerHTML = isEditing ?
            '<i class="fas fa-save"></i> Save Nominee' :
            '<i class="fas fa-plus"></i> Add Nominee';
        document.getElementById('cancelNomineeEditBtn').style.display = isEditing ? 'inline-flex' : 'none';
    }

    function resetNomineeForm() {
        const form = document.getElementById('addNomineeForm');
        if (!form) return;
        form.reset();
        editingNomineeId = null;
        document.getElementById('nomPhoto').value = '';
        document.getElementById('nomProblems').value = '';
        document.getElementById('nomWhy').value = '';
        document.getElementById('nomineeHouseSelectWrap').style.display = 'none';
        setNomineeFormMode('add');
    }

    function startEditNominee(id) {
        const nominee = getNomineeById(id);
        if (!nominee) return;
        editingNomineeId = id;
        document.getElementById('nomName').value = nominee.name || '';
        document.getElementById('nomCategory').value = nominee.categoryId || '';
        document.getElementById('nomPhoto').value = nominee.photo || '';
        document.getElementById('nomProblems').value = nominee.manifesto?.problems || nominee.manifesto?.promises || '';
        document.getElementById('nomWhy').value = nominee.manifesto?.whyMe || '';
        const cat = getCategoryById(nominee.categoryId);
        const wrap = document.getElementById('nomineeHouseSelectWrap');
        if (cat && cat.houseSpecific) {
            wrap.style.display = 'block';
            populateHouseSelect('nomHouseSelect');
            document.getElementById('nomHouseSelect').value = nominee.houseId || '';
        } else {
            wrap.style.display = 'none';
        }
        setNomineeFormMode('edit');
        document.getElementById('nomName').focus();
        document.getElementById('addNomineeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function parseCsvLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];
            if (char === '"' && inQuotes && next === '"') {
                current += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }

    function csvEscape(value) {
        const text = String(value ?? '');
        if (/[",\n\r]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function normalizeHeader(value) {
        return value.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function downloadCsv(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported successfully.', 'success');
    }

    async function generateExcelFromCsv(csvText, filename) {
        if (!window.ExcelJS) {
            showToast('Excel library not loaded.', 'error');
            return;
        }
        const lines = csvText.split(/\r?\n/);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Export Data');
        
        let headerRow = null;
        
        lines.forEach(line => {
            if (line.trim() === '') {
                worksheet.addRow([]);
            } else {
                const rowData = parseCsvLine(line);
                const row = worksheet.addRow(rowData);
                if (!headerRow && rowData.length >= 3) {
                    headerRow = row;
                }
            }
        });

        if (!headerRow) headerRow = worksheet.getRow(1);

        headerRow.font = { bold: true };
        headerRow.alignment = { horizontal: 'center' };
        
        worksheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: headerRow.number }
        ];

        const colCount = headerRow.actualCellCount || (headerRow.values ? headerRow.values.length - 1 : 1);
        worksheet.autoFilter = {
            from: { row: headerRow.number, column: 1 },
            to: { row: headerRow.number, column: colCount }
        };

        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, function(cell) {
                let text = cell.value ? cell.value.toString() : '';
                let linesInCell = text.split('\n');
                linesInCell.forEach(l => {
                    if (l.length > maxLength) maxLength = l.length;
                });
            });
            column.width = maxLength < 10 ? 10 : (maxLength > 60 ? 60 : maxLength + 2);
            column.alignment = { wrapText: true, vertical: 'top' };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported successfully.', 'success');
    }

    function buildVoterRecord(name, admissionNumber, className, section, rollNumber, houseId) {
        let finalAdmission = admissionNumber.trim();
        const rStr = (rollNumber || '').trim();
        const cStr = (className || '').trim();
        const sStr = (section || '').trim();

        // Auto-correct template IDs like 1IIIA where Roll is not 1 to [Roll][Class][Section]
        if (finalAdmission.toLowerCase() === '1' + cStr.toLowerCase() + sStr.toLowerCase() && rStr && rStr !== '1') {
            finalAdmission = rStr + cStr + sStr;
        }

        return {
            id: generateId(),
            name: name.trim(),
            admissionNumber: finalAdmission,
            rollNumber: rStr,
            className: cStr,
            section: sStr,
            houseId: houseId || null,
            hasVoted: false,
            skipped: false,
            pinHash: null,
            voteEncrypted: null,
            voteTimestamp: null
        };
    }

    async function addVoter(name, admissionNumber, className, section, rollNumber, houseId = null) {
        if (!name || !admissionNumber) return false;
        const dup = appData.voters.find(v =>
            v.admissionNumber === admissionNumber.trim()
        );
        if (dup) { showToast('Voter with this admission number already exists.', 'error'); return false; }
        const voter = buildVoterRecord(name, admissionNumber, className, section, rollNumber, houseId);
        appData.voters.push(voter);
        saveData();
        renderAllSettings();
        showToast(`Added voter ${name.trim()}.`, 'success');
        return true;
    }

    async function updateVoter(id, name, admissionNumber, className, section, rollNumber, houseId = null) {
        if (!name || !admissionNumber) return false;
        const idx = appData.voters.findIndex(v => v.id === id);
        if (idx === -1) { showToast('Voter not found.', 'error'); return false; }
        appData.voters[idx] = { ...appData.voters[idx], name: name.trim(),
            admissionNumber: admissionNumber.trim(), rollNumber: rollNumber || admissionNumber,
            className: className, section: section, houseId: houseId };
        saveData();
        renderAllSettings();
        showToast(`Updated voter ${name.trim()}.`, 'success');
        return true;
    }

    function setVoterFormMode(mode) {
        const isEditing = mode === 'edit';
        document.getElementById('voterFormTitle').innerHTML = isEditing ?
            '<i class="fas fa-user-edit"></i> Edit Voter' :
            '<i class="fas fa-user-plus"></i> Add Voter';
        document.getElementById('voterSubmitBtn').innerHTML = isEditing ?
            '<i class="fas fa-save"></i> Save Voter' :
            '<i class="fas fa-plus"></i> Add Voter';
        document.getElementById('cancelVoterEditBtn').style.display = isEditing ? 'inline-flex' : 'none';
    }

    function resetVoterForm() {
        const form = document.getElementById('addVoterForm');
        if (!form) return;
        form.reset();
        editingVoterId = null;
        document.getElementById('voterHouseSelect').value = '';
        setVoterFormMode('add');
    }

    function startEditVoter(id) {
        const voter = getVoterById(id);
        if (!voter) return;
        editingVoterId = id;
        populateHouseSelect('voterHouseSelect', true);
        document.getElementById('voterName').value = voter.name || '';
        document.getElementById('voterAdmissionNumber').value = voter.admissionNumber || voter.rollNumber || '';
        document.getElementById('voterClass').value = voter.className || '';
        document.getElementById('voterSection').value = voter.section || '';
        document.getElementById('voterRollNumber').value = voter.rollNumber || '';
        document.getElementById('voterHouseSelect').value = voter.houseId || '';
        setVoterFormMode('edit');
        document.getElementById('voterName').focus();
        document.getElementById('addVoterForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function importVoters(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            showToast('CSV is empty or invalid.', 'error');
            return;
        }
        let startIdx = 0;
        let headerMap = { name: 0, admissionnumber: 1, class: 2, section: 3, rollnumber: 4, houseid: 5 };
        let hasHeader = false;
        const first = parseCsvLine(lines[0]).map(normalizeHeader);
        if (first.some(h => ['votername', 'admissionnumber', 'admissionno', 'voterid', 'rollnumber', 'name'].includes(h))) {
            startIdx = 1;
            hasHeader = true;
            headerMap = {};
            first.forEach((header, idx) => {
                let key = header;
                if (header === 'votername' || header === 'name') key = 'name';
                if (header === 'admissionnumber' || header === 'admissionno' || header === 'voterid') key = 'admissionnumber';
                if (header === 'rollnumber' || header === 'rollno' || header === 'roll') key = 'rollnumber';
                if (header === 'houseid') key = 'houseid';
                headerMap[key] = idx;
            });
            if (headerMap.name === undefined || headerMap.admissionnumber === undefined) {
                showToast('Malformed CSV: Missing required columns for voter name or admission number.', 'error');
                return;
            }
        }

        const rows = [];
        for (let i = startIdx; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]);
            if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) continue;
            const name = (parts[headerMap.name] || '').trim();
            const admissionNumber = (parts[headerMap.admissionnumber] || '').trim();
            const className = (parts[headerMap.class] || '').trim();
            const section = (parts[headerMap.section] || '').trim();
            const rollNumber = (parts[headerMap.rollnumber] || '').trim();
            const houseId = (parts[headerMap.houseid] || '').trim() || null;
            let finalAdmission = admissionNumber.trim();
            const rStr = (rollNumber || '').trim();
            const cStr = (className || '').trim();
            const sStr = (section || '').trim();
            if (finalAdmission.toLowerCase() === '1' + cStr.toLowerCase() + sStr.toLowerCase() && rStr && rStr !== '1') {
                finalAdmission = rStr + cStr + sStr;
            }
            rows.push({ name, admission_number: finalAdmission, class_name: cStr, section: sStr, roll_number: rStr, house_id: houseId });
        }

        // Count how many incoming voters would be duplicates
        // Duplicate key = Admission Number ONLY (roll numbers are NOT globally unique across classes)
        const duplicates = rows.filter(r =>
            r.admission_number && appData.voters.find(v =>
                v.admissionNumber && v.admissionNumber.trim() === r.admission_number.trim()
            )
        );
        const newVoters = rows.filter(r =>
            !appData.voters.find(v =>
                v.admissionNumber && v.admissionNumber.trim() === r.admission_number.trim()
            )
        );

        let added = newVoters.length;
        let skipped = 0;
        let overwritten = 0;

        // Add new voters right away
        for (const r of newVoters) {
            appData.voters.push(buildVoterRecord(r.name, r.admission_number, r.class_name, r.section, r.roll_number, r.house_id));
        }

        if (duplicates.length > 0) {
            // Build and show inline choice dialog
            const choice = await showCsvImportChoiceDialog(
                `${newVoters.length} new voter(s) will be added.\n${duplicates.length} voter(s) already exist (same Admission Number).\n\nWhat should happen to the duplicates?`,
                duplicates.map(r => r.name)
            );
            if (choice === 'cancel') {
                // Undo the new voter additions
                for (let i = 0; i < newVoters.length; i++) appData.voters.pop();
                showToast('Import cancelled.', 'info');
                return;
            }
            if (choice === 'override') {
                for (const r of duplicates) {
                    const idx = appData.voters.findIndex(v =>
                        v.admissionNumber && v.admissionNumber.trim() === r.admission_number.trim()
                    );
                    if (idx !== -1) {
                        appData.voters[idx] = {
                            ...appData.voters[idx],
                            name: r.name,
                            className: r.class_name,
                            section: r.section,
                            rollNumber: r.roll_number,
                            houseId: r.house_id || appData.voters[idx].houseId
                        };
                        overwritten++;
                    }
                }
            } else {
                // merge = skip duplicates
                skipped = duplicates.length;
            }
        }

        saveData();
        renderAllSettings();
        const parts = [];
        if (added > 0) parts.push(`${added} added`);
        if (overwritten > 0) parts.push(`${overwritten} updated`);
        if (skipped > 0) parts.push(`${skipped} duplicates skipped`);
        showToast(`Voters imported: ${parts.join(', ')}.`, 'success');
    }

    // Helper: show a CSV import choice dialog (Merge / Override / Cancel)
    // Returns a Promise that resolves to 'merge', 'override', or 'cancel'
    function showCsvImportChoiceDialog(message, duplicateNames) {
        return new Promise(resolve => {
            // Remove any existing dialog
            const existing = document.getElementById('csvImportChoiceDialog');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'csvImportChoiceDialog';
            overlay.style.cssText = `
                position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;
                display:flex;align-items:center;justify-content:center;padding:20px;
            `;

            const truncatedNames = duplicateNames.slice(0, 5).join(', ') +
                (duplicateNames.length > 5 ? ` …and ${duplicateNames.length - 5} more` : '');

            overlay.innerHTML = `
                <div style="background:#fff;border-radius:16px;padding:28px 28px 20px;max-width:440px;width:100%;
                            box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:inherit;">
                    <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">
                        <i class="fas fa-file-import" style="color:var(--primary);"></i>
                        &nbsp;CSV Import — Duplicate Voters Found
                    </div>
                    <div style="font-size:0.88rem;color:#555;margin-bottom:14px;line-height:1.6;">
                        <b style="color:#27ae60;">${duplicateNames.length > 0 ? message.split('\n')[0] : ''}</b><br>
                        <b style="color:#e67e22;">${duplicateNames.length} voter(s) already exist</b> with the same Admission Number:<br>
                        <span style="color:#888;font-size:0.84rem;">${truncatedNames}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <button id="csvChoiceMerge" style="padding:10px 16px;border-radius:10px;border:2px solid var(--primary);
                            background:#f0f4fc;color:var(--primary);font-weight:700;cursor:pointer;text-align:left;font-size:0.9rem;">
                            📋 <strong>Merge (Skip Duplicates)</strong><br>
                            <span style="font-weight:400;font-size:0.82rem;color:#555;">Add only new voters. Keep existing voter records unchanged.</span>
                        </button>
                        <button id="csvChoiceOverride" style="padding:10px 16px;border-radius:10px;border:2px solid #e67e22;
                            background:#fffbf0;color:#b7550a;font-weight:700;cursor:pointer;text-align:left;font-size:0.9rem;">
                            ⚠️ <strong>Override Duplicates</strong><br>
                            <span style="font-weight:400;font-size:0.82rem;color:#555;">Update duplicate voter records with data from the CSV file.</span>
                        </button>
                        <button id="csvChoiceCancel" style="padding:9px 16px;border-radius:10px;border:1.5px solid #dce3ec;
                            background:#f8f9fa;color:#666;font-weight:600;cursor:pointer;font-size:0.88rem;">
                            ✕ Cancel Import
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const cleanup = (result) => {
                overlay.remove();
                resolve(result);
            };

            document.getElementById('csvChoiceMerge').addEventListener('click', () => cleanup('merge'));
            document.getElementById('csvChoiceOverride').addEventListener('click', () => cleanup('override'));
            document.getElementById('csvChoiceCancel').addEventListener('click', () => cleanup('cancel'));
            // Click outside to cancel
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup('cancel'); });
        });
    }

    function getVotersCsvData() {
        if (appData.voters.length === 0) return null;
        let csv = 'voter name,admission number,class,section,roll number,houseId\n';
        for (const voter of appData.voters) {
            csv += [
                voter.name,
                voter.admissionNumber || voter.rollNumber || '',
                voter.className || '',
                voter.section || '',
                voter.rollNumber || '',
                voter.houseId || ''
            ].map(csvEscape).join(',') + '\n';
        }
        return csv;
    }

    function exportVoters() {
        const csv = getVotersCsvData();
        if (!csv) { showToast('No voters to export.', 'error'); return; }
        downloadCsv(csv, `voters_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportVotersExcel() {
        const csv = getVotersCsvData();
        if (!csv) { showToast('No voters to export.', 'error'); return; }
        generateExcelFromCsv(csv, `voters_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    async function importNominees(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) { showToast('CSV is empty or invalid.', 'error'); return; }
        let startIdx = 0;
        let headerMap = { name: 0, categoryid: 1, houseid: 2, photourl: 3, problems: 4, whyme: 5 };
        const first = lines[0].toLowerCase();
        if (first.includes('name') || first.includes('categoryid')) {
            startIdx = 1;
            const headers = parseCsvLine(lines[0]).map(normalizeHeader);
            if (!headers.includes('name') || !headers.includes('categoryid')) {
                showToast('Malformed CSV: Missing required columns "name" or "categoryId".', 'error');
                return;
            }
            headerMap = {};
            headers.forEach((h, idx) => {
                let key = h;
                if (h === 'photo' || h === 'photourl') key = 'photourl';
                headerMap[key] = idx;
            });
        }
        const rows = [];
        for (let i = startIdx; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]);
            if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) continue;
            const name = (parts[headerMap.name] || '').trim();
            const categoryId = (parts[headerMap.categoryid] || '').trim();
            const houseId = (parts[headerMap.houseid] || '').trim() || null;
            const photo = (parts[headerMap.photourl] || '').trim();
            const problems = (parts[headerMap.problems] || '').trim();
            const whyMe = (parts[headerMap.whyme] || '').trim();
            if (!name || !categoryId) {
                showToast(`Malformed CSV: Row ${i + 1} is missing required nominee name or category ID.`, 'error');
                return;
            }
            rows.push({ name, category_id: categoryId, house_id: houseId, photo, problems, whyMe });
        }

        let added = 0;
        let skipped = 0;
        for (const r of rows) {
            if (!getCategoryById(r.category_id)) {
                skipped++;
                continue;
            }
            const existingIdx = appData.nominees.findIndex(n =>
                n.name.toLowerCase() === r.name.toLowerCase() && n.categoryId === r.category_id
            );
            if (existingIdx !== -1) {
                skipped++;
            } else {
                appData.nominees.push({
                    id: generateId(),
                    name: r.name,
                    categoryId: r.category_id,
                    houseId: r.house_id || null,
                    photo: r.photo || '',
                    manifesto: { problems: r.problems || '', promises: r.problems || '', whyMe: r.whyMe || '' }
                });
                added++;
            }
        }
        saveData();
        initializeResults();
        renderAllSettings();
        showToast(`Imported ${added} new nominees (${skipped} duplicates skipped).`, 'success');
    }

    function getNomineesCsvData() {
        if (appData.nominees.length === 0) return null;
        let csv = 'name,categoryId,houseId,photoUrl,problems,whyMe\n';
        for (const n of appData.nominees) {
            const cat = getCategoryById(n.categoryId);
            const catId = cat ? cat.id : n.categoryId;
            const houseId = n.houseId || '';
            const photo = n.photo || '';
            const problems = (n.manifesto?.problems || '').replace(/,/g, ' ');
            const whyMe = (n.manifesto?.whyMe || '').replace(/,/g, ' ');
            csv += [n.name, catId, houseId, photo, problems, whyMe].map(csvEscape).join(',') + '\n';
        }
        return csv;
    }

    function exportNominees() {
        const csv = getNomineesCsvData();
        if (!csv) { showToast('No nominees to export.', 'error'); return; }
        downloadCsv(csv, `nominees_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportNomineesExcel() {
        const csv = getNomineesCsvData();
        if (!csv) { showToast('No nominees to export.', 'error'); return; }
        generateExcelFromCsv(csv, `nominees_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    async function importHouses(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) { showToast('CSV is empty or invalid.', 'error'); return; }
        let startIdx = 0;
        const first = lines[0].toLowerCase();
        if (first.includes('name') || first.includes('color')) {
            startIdx = 1;
            const headers = parseCsvLine(lines[0]);
            if (!headers.map(normalizeHeader).includes('name')) {
                showToast('Malformed CSV: Missing required column "name".', 'error');
                return;
            }
        }
        const rows = [];
        for (let i = startIdx; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]);
            if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) continue;
            const name = parts[0]?.trim();
            const rawColor = parts[1]?.trim() || 'Blue';
            if (!name) { showToast(`Malformed CSV: Row ${i + 1} is missing the name value.`, 'error'); return; }
            const colorHex = colorNameToHex(rawColor);
            if (!colorHex) { showToast(`Malformed CSV: Row ${i + 1} has an invalid color "${rawColor}".`, 'error'); return; }
            rows.push({ name, color: colorHex });
        }
        let added = 0;
        let skipped = 0;
        for (const r of rows) {
            const existingIdx = appData.houses.findIndex(h =>
                h.name.toLowerCase() === r.name.toLowerCase()
            );
            if (existingIdx !== -1) {
                skipped++;
            } else {
                appData.houses.push({
                    id: r.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36),
                    name: r.name,
                    color: r.color
                });
                added++;
            }
        }
        saveData();
        renderAllSettings();
        showToast(`Imported ${added} houses (${skipped} duplicates skipped).`, 'success');
    }

    function getHousesCsvData() {
        if (appData.houses.length === 0) return null;
        let csv = 'name,color\n';
        for (const h of appData.houses) {
            csv += `${h.name},${hexToColorName(h.color)}\n`;
        }
        return csv;
    }

    function exportHouses() {
        const csv = getHousesCsvData();
        if (!csv) { showToast('No houses to export.', 'error'); return; }
        downloadCsv(csv, `houses_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportHousesExcel() {
        const csv = getHousesCsvData();
        if (!csv) { showToast('No houses to export.', 'error'); return; }
        generateExcelFromCsv(csv, `houses_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    async function importCategories(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) { showToast('CSV is empty or invalid.', 'error'); return; }
        let startIdx = 0;
        let headerMap = { name: 0, housespecific: 1, houseid: 2 };
        const first = lines[0].toLowerCase();
        if (first.includes('name') || first.includes('housespecific') || first.includes('houseid')) {
            startIdx = 1;
            const headers = parseCsvLine(lines[0]).map(normalizeHeader);
            if (!headers.includes('name')) {
                showToast('Malformed CSV: Missing required column "name".', 'error');
                return;
            }
            headerMap = {};
            headers.forEach((h, idx) => { headerMap[h] = idx; });
        }
        const rows = [];
        for (let i = startIdx; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]);
            if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) continue;
            const name = (parts[headerMap.name] || '').trim();
            const houseSpecificStr = (parts[headerMap.housespecific] || 'false').trim().toLowerCase();
            const houseSpecific = houseSpecificStr === 'true' || houseSpecificStr === '1' || houseSpecificStr === 'yes';
            const houseId = (parts[headerMap.houseid] || '').trim() || null;
            if (!name) { showToast(`Malformed CSV: Row ${i + 1} is missing the name value.`, 'error'); return; }
            rows.push({ name, houseSpecific, houseId });
        }
        let added = 0;
        let skipped = 0;
        for (const r of rows) {
            const existingIdx = appData.categories.findIndex(c =>
                c.name.toLowerCase() === r.name.toLowerCase()
            );
            if (existingIdx !== -1) {
                skipped++;
            } else {
                appData.categories.push({
                    id: r.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36),
                    name: r.name,
                    houseSpecific: r.houseSpecific,
                    houseId: r.houseId
                });
                added++;
            }
        }
        saveData();
        initializeResults();
        renderAllSettings();
        showToast(`Imported ${added} categories (${skipped} duplicates skipped).`, 'success');
    }

    async function clearAllVoters() {
        if (!confirm('Remove all voters? This will also clear all votes.')) return;
        appData.voters = [];
        activeHomeVoterId = null;
        activeHomeHouseId = null;
        appData.settings.lastHomeHouseId = null;
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
            showToast('Voter not found. Please check your admission number.', 'error');
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

        const effectiveHouseId = getEffectiveHouseIdForVoter(voter);
        if (hasHouseSpecificCategories() && !effectiveHouseId) {
            showToast('Please select the voter house before voting.', 'error');
            return false;
        }

        // Validate that all eligible categories have a selection
        for (const cat of getEligibleCategoriesForVoter(voter)) {
            const eligibleNominees = getNomineesForCategoryAndVoter(cat, voter);
            if (eligibleNominees.length === 0) continue;
            if (!selections[cat.id]) {
                showToast(`Please select a nominee for ${cat.name}.`, 'error');
                return false;
            }
            // Check if nominee exists in that category
            const nominee = getNomineeById(selections[cat.id]);
            if (!nominee || nominee.categoryId !== cat.id || (cat.houseSpecific && nominee.houseId !== effectiveHouseId)) {
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

        voter.hasVoted = true;
        voter.skipped = false;
        voter.pinHash = pinHash;
        voter.voteEncrypted = encrypted;
        voter.voteTimestamp = voteData.timestamp;

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
        const pinHash = hashString(pin);
        if (pinHash !== voter.pinHash) {
            showToast('Incorrect PIN.', 'error');
            return null;
        }
        try {
            let voteData = null;
            if (voter.voteEncrypted) {
                if (voter.pinHash) {
                    voteData = await decryptVote(voter.voteEncrypted, pin);
                } else {
                    voteData = JSON.parse(atob(voter.voteEncrypted));
                }
            }
            return voteData;
        } catch (_) {
            return null;
        }
    }

    async function resetElection() {
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

    async function publishResults() {
        const isPublished = appData.settings.resultsPublished;
        appData.settings.resultsPublished = !isPublished;
        saveData();
        renderAll();
        showToast(isPublished ? 'Results unpublished.' : '📊 Results published!', 'gold');
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
        const voter = getActiveHomeVoter();
        if (!voter) {
            showToast('Please enter your admission number first.', 'error');
            return;
        }
        const effectiveHouseId = getEffectiveHouseIdForVoter(voter);
        if (hasHouseSpecificCategories() && !effectiveHouseId) {
            showToast('Please select the voter house first.', 'error');
            return;
        }
        // Gather selections from homepage
        const selections = {};
        let allSelected = true;
        let reviewHtml = '';
        for (const cat of getEligibleCategoriesForVoter(voter)) {
            const nominees = getNomineesForCategoryAndVoter(cat, voter);
            if (nominees.length === 0) continue;
            const radio = document.querySelector(`input[name="category_${cat.id}"]:checked`);
            const house = cat.houseSpecific ? getHouseById(effectiveHouseId) : null;
            const catName = house ? `${cat.name} - ${house.name}` : cat.name;
            if (radio) {
                const nomineeId = radio.value;
                const nominee = getNomineeById(nomineeId);
                if (nominee) {
                    selections[cat.id] = nomineeId;
                    reviewHtml += `<div><strong>${catName}:</strong> ${nominee.name}</div>`;
                }
            } else {
                allSelected = false;
                reviewHtml += `<div><strong>${catName}:</strong> <span class="text-danger">Not selected</span></div>`;
            }
        }
        if (!allSelected) {
            showToast('Please select a nominee for every category.', 'error');
            return;
        }
        // Store selections in a data attribute for the modal
        document.getElementById('voteModal').dataset.selections = JSON.stringify(selections);
        document.getElementById('voteReviewContainer').innerHTML = reviewHtml;
        document.getElementById('voterIdInput').value = voter.admissionNumber || voter.rollNumber || '';
        document.getElementById('voterIdInput').readOnly = true;
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

    async function unlockSettings(password) {
        document.getElementById('pwError').classList.add('hidden');
        try {
            const enteredHash = await sha256(password);
            const storedHash = appData.settings && appData.settings.adminPasswordHash;

            if (storedHash && enteredHash === storedHash) {
                settingsUnlocked = true;
                document.getElementById('passwordOverlay').classList.remove('active');
                document.getElementById('settingsPage').classList.add('active');
                document.getElementById('homepage').style.display = 'none';
                renderAllSettings();
                showToast('Settings unlocked.', 'success');
                return;
            }

            // No stored hash set yet — allow any password as first-time setup
            if (!storedHash) {
                // Store the hash for future checks
                appData.settings.adminPasswordHash = enteredHash;
                saveData();
                sessionStorage.setItem('adminToken', 'local_offline_token');
                settingsUnlocked = true;
                document.getElementById('passwordOverlay').classList.remove('active');
                document.getElementById('settingsPage').classList.add('active');
                document.getElementById('homepage').style.display = 'none';
                renderAllSettings();
                showToast('Settings unlocked. Password saved locally.', 'success');
                return;
            }
        } catch (_) { /* sha256 failure is extremely unlikely */ }

        // ── 3) All checks failed — wrong password ────────────────────────────
        document.getElementById('pwError').classList.remove('hidden');
        showToast('Incorrect password.', 'error');
    }

    function closeSettings() {
        settingsUnlocked = false;
        document.getElementById('settingsPage').classList.remove('active');
        document.getElementById('homepage').style.display = 'block';
        renderAll();
    }

    async function changeAdminPassword(newPass, confirmPass) {
        if (!newPass || newPass.length < 4) {
            showToast('Password must be at least 4 characters.', 'error');
            return;
        }
        if (newPass !== confirmPass) {
            showToast('Passwords do not match.', 'error');
            return;
        }
        try {
            const hashed = await sha256(newPass);
            appData.settings.adminPasswordHash = hashed;
            saveData();
            showToast('Admin password updated.', 'success');
            document.getElementById('newAdminPass').value = '';
            document.getElementById('confirmAdminPass').value = '';
        } catch (_) {
            showToast('Failed to update password.', 'error');
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  9.  RENDER ALL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function renderAll() {
        const published = appData.settings.resultsPublished;
        if (!published) {
            const publicResultsPage = document.getElementById('publicResultsPage');
            if (publicResultsPage && publicResultsPage.classList.contains('active')) {
                closePublicResults();
                return;
            }
        }
        if (document.getElementById('settingsPage').classList.contains('active')) {
            if (settingsUnlocked) {
                renderAllSettings();
            }
        } else if (document.getElementById('publicResultsPage') && document.getElementById('publicResultsPage').classList.contains('active')) {
            renderStatsView(document.getElementById('publicStatsGrid'));
            renderResultsView(document.getElementById('publicResultsContainer'), false);
            // Update header branding
            document.getElementById('schoolNameDisplay').innerHTML = `<i class="fas fa-school"></i> ${appData.schoolName || 'School'}`;
            document.getElementById('schoolSubtitleDisplay').textContent = appData.schoolSubtitle || '';
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
        renderHouseList();
        renderCategoryList();
        populateCategorySelect();
        populateHouseSelect('categoryHouseSelect');
        populateHouseSelect('nomHouseSelect');
        populateHouseSelect('voterHouseSelect', true);
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

    async function init() {
        await loadData();
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
            closePublicResults();
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);

        document.getElementById('homeVoterForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const voterId = document.getElementById('homeVoterIdInput').value.trim();
            const voter = getVoterByRoll(voterId);
            if (!voter) {
                activeHomeVoterId = null;
                showToast('Voter not found. Please check your admission number.', 'error');
                renderHomepage();
                return;
            }
            activeHomeVoterId = voter.id;
            renderHomepage();
        });

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
                showToast('Please enter your admission number.', 'error');
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
                showToast('Please enter your admission number.', 'error');
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
        document.getElementById('brandingForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('schoolNameInput').value.trim();
            const subtitle = document.getElementById('schoolSubtitleInput').value.trim();
            appData.schoolName = name || appData.schoolName;
            appData.schoolSubtitle = subtitle || appData.schoolSubtitle;
            saveData();
            renderAllSettings();
            showToast('Branding updated.', 'success');
        });

        document.getElementById('visibilityForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const showSkip = document.getElementById('showSkipCheckbox').checked;
            const showVerify = document.getElementById('showVerifyCheckbox').checked;
            appData.settings.showSkipButton = showSkip;
            appData.settings.showVerifyButton = showVerify;
            saveData();
            renderAllSettings();
            showToast('Visibility settings saved.', 'success');
        });

        // ─── Settings: Election Mode ───
        document.getElementById('settingsForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const electionMode = document.getElementById('electionMode').value;
            const isActive = document.getElementById('electionStatus').value === 'active';
            appData.settings.electionMode = electionMode;
            appData.settings.isActive = isActive;
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
        document.getElementById('categoryHouseSpecific').addEventListener('change', function() {
            const wrap = document.getElementById('categoryHouseSelectWrap');
            wrap.style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('addCategoryForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('newCategoryName').value.trim();
            const houseSpecific = document.getElementById('categoryHouseSpecific').checked;
            const houseId = houseSpecific ? document.getElementById('categoryHouseSelect').value : null;
            if (addCategory(name, houseSpecific, houseId)) {
                this.reset();
                document.getElementById('categoryHouseSelectWrap').style.display = 'none';
            }
        });

        document.getElementById('resetDefaultCategoriesBtn').addEventListener('click', resetDefaultCategories);

        // ─── Settings: Houses ───
        document.getElementById('addHouseForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('newHouseName').value.trim();
            const color = document.getElementById('newHouseColor').value;
            if (addHouse(name, color)) {
                this.reset();
            }
        });

        document.getElementById('resetDefaultHousesBtn').addEventListener('click', resetDefaultHouses);

        // ─── Settings: Houses CSV Import/Export ───
        const houseDropArea = document.getElementById('houseCsvDropArea');
        const houseFileInput = document.getElementById('houseCsvFileInput');

        houseDropArea.addEventListener('click', () => houseFileInput.click());
        houseDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            houseDropArea.style.borderColor = 'var(--primary)';
            houseDropArea.style.background = '#e8f0fe';
        });
        houseDropArea.addEventListener('dragleave', () => {
            houseDropArea.style.borderColor = '#dce3ec';
            houseDropArea.style.background = '#fafcfe';
        });
        houseDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            houseDropArea.style.borderColor = '#dce3ec';
            houseDropArea.style.background = '#fafcfe';
            if (e.dataTransfer.files.length > 0) {
                houseFileInput.files = e.dataTransfer.files;
                handleHouseCsvFile(e.dataTransfer.files[0]);
            }
        });
        houseFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleHouseCsvFile(this.files[0]);
            }
            this.value = '';
        });

        async function handleHouseCsvFile(file) {
            try {
                const text = await file.text();
                importHouses(text);
            } catch (_) {
                showToast('Failed to read file.', 'error');
            }
        }

        document.getElementById('sampleHouseCsvBtn').addEventListener('click', function() {
            const sample = `name,color
Red House,Red
Green House,Green
Yellow House,Yellow
Blue House,Blue`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_houses.csv';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('exportHousesBtn').addEventListener('click', exportHouses);
        document.getElementById('exportHousesExcelBtn').addEventListener('click', exportHousesExcel);

        // ─── Settings: Nominees ───
        document.getElementById('nomCategory').addEventListener('change', function() {
            const cat = getCategoryById(this.value);
            const wrap = document.getElementById('nomineeHouseSelectWrap');
            if (cat && cat.houseSpecific) {
                wrap.style.display = 'block';
                populateHouseSelect('nomHouseSelect');
            } else {
                wrap.style.display = 'none';
            }
        });

        document.getElementById('addNomineeForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('nomName').value.trim();
            const categoryId = document.getElementById('nomCategory').value;
            const photo = document.getElementById('nomPhoto').value.trim();
            const problems = document.getElementById('nomProblems').value.trim();
            const why = document.getElementById('nomWhy').value.trim();
            const cat = getCategoryById(categoryId);
            const houseId = (cat && cat.houseSpecific) ? document.getElementById('nomHouseSelect').value : null;
            if (!name || !categoryId) {
                showToast('Please fill in name and category.', 'error');
                return;
            }
            if (cat && cat.houseSpecific && !houseId) {
                showToast('Please select a house for this house-specific category.', 'error');
                return;
            }
            const saved = editingNomineeId ?
                updateNominee(editingNomineeId, name, categoryId, photo, problems, why, houseId) :
                addNominee(name, categoryId, photo, problems, why, houseId);
            if (saved) {
                resetNomineeForm();
                renderNomineeList();
                renderStats();
            }
        });

        document.getElementById('cancelNomineeEditBtn').addEventListener('click', resetNomineeForm);

        // ─── Settings: Voters ───
        document.getElementById('addVoterForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('voterName').value.trim();
            const admissionNumber = document.getElementById('voterAdmissionNumber').value.trim();
            const className = document.getElementById('voterClass').value.trim();
            const section = document.getElementById('voterSection').value.trim();
            const rollNumber = document.getElementById('voterRollNumber').value.trim();
            const houseId = document.getElementById('voterHouseSelect').value || null;
            if (!name || !admissionNumber) {
                showToast('Please fill in voter name and admission number.', 'error');
                return;
            }
            const saved = editingVoterId ?
                updateVoter(editingVoterId, name, admissionNumber, className, section, rollNumber, houseId) :
                addVoter(name, admissionNumber, className, section, rollNumber, houseId);
            if (saved) {
                resetVoterForm();
                renderVoterList();
                renderStats();
            }
        });

        document.getElementById('cancelVoterEditBtn').addEventListener('click', resetVoterForm);

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
            const sample = `voter name,admission number,class,section,roll number,houseId
Emma Williams,ADM1001,10,A,1,red
James Rodriguez,ADM1002,10,A,2,green
Sophia Chen,ADM1003,10,B,1,yellow
Michael Okafor,ADM1004,11,A,5,blue
Olivia Smith,ADM1005,11,B,8,red`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_voters.csv';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('exportVotersBtn').addEventListener('click', exportVoters);
        document.getElementById('exportVotersExcelBtn').addEventListener('click', exportVotersExcel);
        document.getElementById('clearVotersBtn').addEventListener('click', clearAllVoters);

        // ─── Settings: Nominees CSV Import/Export ───
        const nomineeDropArea = document.getElementById('nomineeCsvDropArea');
        const nomineeFileInput = document.getElementById('nomineeCsvFileInput');

        nomineeDropArea.addEventListener('click', () => nomineeFileInput.click());
        nomineeDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            nomineeDropArea.style.borderColor = 'var(--primary)';
            nomineeDropArea.style.background = '#e8f0fe';
        });
        nomineeDropArea.addEventListener('dragleave', () => {
            nomineeDropArea.style.borderColor = '#dce3ec';
            nomineeDropArea.style.background = '#fafcfe';
        });
        nomineeDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            nomineeDropArea.style.borderColor = '#dce3ec';
            nomineeDropArea.style.background = '#fafcfe';
            if (e.dataTransfer.files.length > 0) {
                nomineeFileInput.files = e.dataTransfer.files;
                handleNomineeCsvFile(e.dataTransfer.files[0]);
            }
        });
        nomineeFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleNomineeCsvFile(this.files[0]);
            }
            this.value = '';
        });

        async function handleNomineeCsvFile(file) {
            try {
                const text = await file.text();
                importNominees(text);
            } catch (_) {
                showToast('Failed to read file.', 'error');
            }
        }

        document.getElementById('sampleNomineeCsvBtn').addEventListener('click', function() {
            const sample = `name,categoryId,houseId,photoUrl,problems,whyMe
Alex Johnson,head_boy,,https://cdn-icons-png.magnific.com/256/1667/1667349.png,Improve school facilities,I am dedicated and experienced
Sophia Chen,head_girl,,https://voca-land.sgp1.cdn.digitaloceanspaces.com/-1/1711425182353/ddab77a07a14bee0825b053f68278797.png,Improve school facilities,I am dedicated and experienced
Emma Williams,house_captain,red,,Promote student wellness,I care about every student
Olivia Smith,house_captain,blue,,Organize better events,I have great leadership skills
James Rodriguez,deputy_head_boy,,,Organize better events,I have great leadership skills`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_nominees.csv';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('exportNomineesBtn').addEventListener('click', exportNominees);
        document.getElementById('exportNomineesExcelBtn').addEventListener('click', exportNomineesExcel);

        // ─── Public Results page navigation ───
        const publicResultsBtn = document.getElementById('publicResultsBtn');
        if (publicResultsBtn) {
            publicResultsBtn.addEventListener('click', openPublicResults);
        }
        const closePublicResultsBtn = document.getElementById('closePublicResultsBtn');
        if (closePublicResultsBtn) {
            closePublicResultsBtn.addEventListener('click', closePublicResults);
        }

        // ─── Settings: Results ───
        document.getElementById('publishResultsBtn').addEventListener('click', publishResults);
        const exportResultsCsvBtn = document.getElementById('exportResultsCsvBtn');
        if (exportResultsCsvBtn) {
            exportResultsCsvBtn.addEventListener('click', exportResultsCsv);
        }
        const exportResultsExcelBtn = document.getElementById('exportResultsExcelBtn');
        if (exportResultsExcelBtn) {
            exportResultsExcelBtn.addEventListener('click', exportResultsExcel);
        }
        document.getElementById('resetElectionBtn').addEventListener('click', resetElection);

        // ─── Settings: Categories CSV Import/Export ───
        const categoryDropArea = document.getElementById('categoryCsvDropArea');
        const categoryFileInput = document.getElementById('categoryCsvFileInput');
        if (categoryDropArea && categoryFileInput) {
            categoryDropArea.addEventListener('click', () => categoryFileInput.click());
            categoryDropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                categoryDropArea.style.borderColor = 'var(--primary)';
                categoryDropArea.style.background = '#e8f0fe';
            });
            categoryDropArea.addEventListener('dragleave', () => {
                categoryDropArea.style.borderColor = '#dce3ec';
                categoryDropArea.style.background = '#fafcfe';
            });
            categoryDropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                categoryDropArea.style.borderColor = '#dce3ec';
                categoryDropArea.style.background = '#fafcfe';
                if (e.dataTransfer.files.length > 0) {
                    categoryFileInput.files = e.dataTransfer.files;
                    handleCategoryCsvFile(e.dataTransfer.files[0]);
                }
            });
            categoryFileInput.addEventListener('change', function() {
                if (this.files.length > 0) {
                    handleCategoryCsvFile(this.files[0]);
                }
                this.value = '';
            });
        }

        async function handleCategoryCsvFile(file) {
            try {
                const text = await file.text();
                importCategories(text);
            } catch (_) {
                showToast('Failed to read file.', 'error');
            }
        }

        const sampleCategoryCsvBtn = document.getElementById('sampleCategoryCsvBtn');
        if (sampleCategoryCsvBtn) {
            sampleCategoryCsvBtn.addEventListener('click', function() {
                const sample = `name,houseSpecific,houseId\nHead Boy,false,\nHead Girl,false,\nHouse Captain,true,red\nHouse Vice Captain,true,red`;
                const blob = new Blob([sample], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'sample_categories.csv';
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        const exportCategoriesBtn = document.getElementById('exportCategoriesBtn');
        if (exportCategoriesBtn) {
            exportCategoriesBtn.addEventListener('click', exportCategories);
        }
        const exportCategoriesExcelBtn = document.getElementById('exportCategoriesExcelBtn');
        if (exportCategoriesExcelBtn) {
            exportCategoriesExcelBtn.addEventListener('click', exportCategoriesExcel);
        }

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

        document.getElementById('clearAllDataBtn').addEventListener('click', async function() {
            if (!confirm('⚠️ Delete ALL election data? This cannot be undone!')) return;
            localStorage.removeItem(STORAGE_KEY);
            await loadData();
            initializeResults();
            renderAll();
            showToast('All data cleared.', 'info');
        });

        // ─── Settings: Import All Data (JSON) ───
        let _pendingImportJson = null; // stores parsed JSON while modal is open

        document.getElementById('importDataBtn').addEventListener('click', function() {
            _pendingImportJson = null;
            document.getElementById('jsonImportFileInput').value = '';
            document.getElementById('jsonImportFileInput').click();
        });

        document.getElementById('jsonImportFileInput').addEventListener('change', async function() {
            if (!this.files || this.files.length === 0) return;
            const file = this.files[0];
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                // Basic schema check
                if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure.');
                _pendingImportJson = parsed;
                openJsonMergeModal();
            } catch (e) {
                showToast('Invalid JSON file: ' + e.message, 'error');
            }
            this.value = '';
        });

        function openJsonMergeModal() {
            const modal = document.getElementById('jsonMergeModal');
            document.getElementById('jsonMergeOptions').classList.remove('hidden');
            document.getElementById('jsonMergeSummary').classList.add('hidden');
            document.getElementById('jsonMergeSummary').innerHTML = '';
            document.getElementById('jsonMergeError').classList.add('hidden');
            document.getElementById('jsonMergeError').textContent = '';
            document.getElementById('jsonMergeActions').innerHTML = `
                <button type="button" class="btn btn-primary" id="jsonMergeConfirmBtn"><i class="fas fa-check"></i> Proceed</button>
                <button type="button" class="btn btn-outline" id="jsonMergeCancelBtn">Cancel</button>
            `;
            // Show/hide voter conflict dropdown based on mode
            const conflictWrap = document.getElementById('voterConflictWrap');
            document.querySelectorAll('input[name="importMode"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    conflictWrap.style.display = this.value === 'append' ? '' : 'none';
                });
            });
            // Set initial visibility
            const selected = document.querySelector('input[name="importMode"]:checked');
            conflictWrap.style.display = (selected && selected.value === 'append') ? '' : 'none';

            document.getElementById('jsonMergeConfirmBtn').addEventListener('click', executeJsonImport);
            document.getElementById('jsonMergeCancelBtn').addEventListener('click', closeJsonMergeModal);

            modal.classList.remove('hidden');
        }

        function closeJsonMergeModal() {
            document.getElementById('jsonMergeModal').classList.add('hidden');
            _pendingImportJson = null;
        }

        // ─── Core offline merge engine (no backend, no JWT) ───
        async function executeJsonImport() {
            if (!_pendingImportJson) { closeJsonMergeModal(); return; }
            const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'append';
            const voterConflict = document.getElementById('voterConflictMode').value || 'skip';

            if (mode === 'replace') {
                if (!confirm('⚠️ Override mode will PERMANENTLY REPLACE all current election data (voters, votes, nominees, results) with the imported file.\n\nThis cannot be undone. Continue?')) return;
            }

            const confirmBtn = document.getElementById('jsonMergeConfirmBtn');
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';
            document.getElementById('jsonMergeError').classList.add('hidden');

            try {
                const imported = _pendingImportJson;

                // Counters for summary
                const s = {
                    houses_added: 0, houses_skipped: 0,
                    categories_added: 0, categories_skipped: 0,
                    nominees_added: 0, nominees_skipped: 0,
                    voters_added: 0, voters_skipped: 0, voters_overwritten: 0,
                    votes_added: 0
                };

                // Helper: find existing voter by admissionNumber ONLY (rollNumbers are not unique across classes)
                function findDuplicateVoter(v) {
                    if (v.admissionNumber && v.admissionNumber.trim()) {
                        return appData.voters.find(e =>
                            e.admissionNumber && e.admissionNumber.trim() === v.admissionNumber.trim()
                        ) || null;
                    }
                    return null;
                }

                if (mode === 'replace') {
                    // ── Override: completely replace appData with imported file ──
                    // Preserve the local admin password hash so the user is not locked out
                    const currentAdminHash = appData.settings && appData.settings.adminPasswordHash;
                    appData = {
                        schoolName:     imported.schoolName     || appData.schoolName,
                        schoolSubtitle: imported.schoolSubtitle || appData.schoolSubtitle,
                        houses:         Array.isArray(imported.houses)     ? [...imported.houses]     : [],
                        categories:     Array.isArray(imported.categories) ? [...imported.categories] : [],
                        nominees:       Array.isArray(imported.nominees)   ? [...imported.nominees]   : [],
                        voters:         Array.isArray(imported.voters)     ? [...imported.voters]     : [],
                        settings:       imported.settings ? { ...imported.settings } : appData.settings,
                        results:        imported.results  ? { ...imported.results  } : {}
                    };
                    // Always restore the local admin password hash
                    if (currentAdminHash) {
                        appData.settings.adminPasswordHash = currentAdminHash;
                    }
                    s.houses_added      = appData.houses.length;
                    s.categories_added  = appData.categories.length;
                    s.nominees_added    = appData.nominees.length;
                    s.voters_added      = appData.voters.length;
                    for (const catId in appData.results)
                        for (const nomId in appData.results[catId])
                            s.votes_added += (appData.results[catId][nomId] || 0);

                } else {
                    // ── Append: smart offline merge ──

                    // 1. Houses — deduplicate by id then by name (case-insensitive)
                    for (const h of (imported.houses || [])) {
                        const dupById   = appData.houses.find(e => e.id === h.id);
                        const dupByName = appData.houses.find(e =>
                            e.name.trim().toLowerCase() === (h.name || '').trim().toLowerCase()
                        );
                        if (!dupById && !dupByName) {
                            appData.houses.push({ ...h });
                            s.houses_added++;
                        } else {
                            s.houses_skipped++;
                        }
                    }

                    // 2. Categories — deduplicate by id then by name
                    for (const c of (imported.categories || [])) {
                        const dupById   = appData.categories.find(e => e.id === c.id);
                        const dupByName = appData.categories.find(e =>
                            e.name.trim().toLowerCase() === (c.name || '').trim().toLowerCase()
                        );
                        if (!dupById && !dupByName) {
                            appData.categories.push({ ...c });
                            s.categories_added++;
                        } else {
                            s.categories_skipped++;
                        }
                    }

                    // 3. Nominees — deduplicate by id
                    for (const n of (imported.nominees || [])) {
                        if (!appData.nominees.find(e => e.id === n.id)) {
                            appData.nominees.push({ ...n });
                            s.nominees_added++;
                        } else {
                            s.nominees_skipped++;
                        }
                    }

                    // 4. Voters — deduplicate by rollNumber (primary key), then admissionNumber
                    for (const v of (imported.voters || [])) {
                        // Apply template ID auto-correction
                        const rStr = (v.rollNumber || '').trim();
                        const cStr = (v.className || '').trim();
                        const sStr = (v.section || '').trim();
                        const adm = (v.admissionNumber || '').trim();
                        if (adm.toLowerCase() === '1' + cStr.toLowerCase() + sStr.toLowerCase() && rStr && rStr !== '1') {
                            v.admissionNumber = rStr + cStr + sStr;
                        }

                        const existing = findDuplicateVoter(v);
                        if (existing) {
                            if (voterConflict === 'overwrite') {
                                const idx = appData.voters.indexOf(existing);
                                appData.voters[idx] = { ...v };
                                s.voters_overwritten++;
                            } else {
                                s.voters_skipped++;
                            }
                        } else {
                            appData.voters.push({ ...v });
                            s.voters_added++;
                        }
                    }

                    // 5. Results — add vote counts (merge, not replace)
                    if (imported.results && typeof imported.results === 'object') {
                        if (!appData.results) appData.results = {};
                        for (const catId in imported.results) {
                            if (!appData.results[catId]) appData.results[catId] = {};
                            for (const nomId in imported.results[catId]) {
                                const incoming = Number(imported.results[catId][nomId]) || 0;
                                appData.results[catId][nomId] = (appData.results[catId][nomId] || 0) + incoming;
                                s.votes_added += incoming;
                            }
                        }
                    }
                }

                // ── Persist to localStorage & recalculate everything ──
                saveData();          // write merged appData to localStorage
                initializeResults(); // ensure all categories have result entries

                // Compute final stats for summary
                const finalVoters    = appData.voters.length;
                const finalVoted     = appData.voters.filter(v => v.hasVoted && !v.skipped).length;
                const finalSkipped   = appData.voters.filter(v => v.skipped).length;
                const finalPending   = finalVoters - finalVoted - finalSkipped;
                const totalMergedVotes = (() => {
                    let t = 0;
                    for (const cId in appData.results)
                        for (const nId in appData.results[cId])
                            t += (appData.results[cId][nId] || 0);
                    return t;
                })();
                const modeLabel = mode === 'replace' ? '⚠️ Override (Replace)' : '📋 Append (Merge)';

                // ── Build detailed summary ──
                const summaryEl = document.getElementById('jsonMergeSummary');
                summaryEl.innerHTML = `
                    <div style="margin-bottom:8px;">
                        <strong>✅ Import complete</strong>
                        &nbsp;<span style="background:#e8f0fe;color:var(--primary);padding:2px 10px;border-radius:12px;font-size:0.82rem;font-weight:600;">${modeLabel}</span>
                    </div>
                    <table style="width:100%;border-collapse:collapse;font-size:0.86rem;">
                        <tr style="border-bottom:1px solid #e0e7ef;">
                            <td style="padding:4px 0;color:#555;">🏠 Houses</td>
                            <td style="padding:4px 8px;text-align:right;"><b style="color:#27ae60;">${s.houses_added} added</b></td>
                            <td style="padding:4px 0;text-align:right;color:#999;">${s.houses_skipped} skipped</td>
                        </tr>
                        <tr style="border-bottom:1px solid #e0e7ef;">
                            <td style="padding:4px 0;color:#555;">🏷️ Categories</td>
                            <td style="padding:4px 8px;text-align:right;"><b style="color:#27ae60;">${s.categories_added} added</b></td>
                            <td style="padding:4px 0;text-align:right;color:#999;">${s.categories_skipped} skipped</td>
                        </tr>
                        <tr style="border-bottom:1px solid #e0e7ef;">
                            <td style="padding:4px 0;color:#555;">👤 Nominees</td>
                            <td style="padding:4px 8px;text-align:right;"><b style="color:#27ae60;">${s.nominees_added} added</b></td>
                            <td style="padding:4px 0;text-align:right;color:#999;">${s.nominees_skipped} skipped</td>
                        </tr>
                        <tr style="border-bottom:1px solid #e0e7ef;">
                            <td style="padding:4px 0;color:#555;">🧑‍🎓 Voters</td>
                            <td style="padding:4px 8px;text-align:right;">
                                <b style="color:#27ae60;">${s.voters_added} added</b>${s.voters_overwritten > 0 ? `, <b style="color:#e67e22;">${s.voters_overwritten} overwritten</b>` : ''}
                            </td>
                            <td style="padding:4px 0;text-align:right;color:#999;">${s.voters_skipped} skipped</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 0;color:#555;">🗳️ Votes merged</td>
                            <td style="padding:4px 8px;text-align:right;" colspan="2"><b style="color:var(--primary);">${s.votes_added}</b></td>
                        </tr>
                    </table>
                    <div style="margin-top:12px;padding-top:8px;border-top:1px solid #dce3ec;line-height:1.9;">
                        <b>Final Election State:</b><br>
                        👥 Total Voters: <b>${finalVoters}</b> &nbsp;·&nbsp;
                        ✅ Voted: <b>${finalVoted}</b> &nbsp;·&nbsp;
                        ⏩ Skipped: <b>${finalSkipped}</b> &nbsp;·&nbsp;
                        🕐 Pending: <b>${finalPending}</b><br>
                        📊 Total vote count (all categories): <b>${totalMergedVotes}</b>
                    </div>
                `;
                summaryEl.classList.remove('hidden');
                document.getElementById('jsonMergeOptions').classList.add('hidden');
                document.getElementById('jsonMergeActions').innerHTML = `
                    <button type="button" class="btn btn-primary" id="jsonMergeDoneBtn"><i class="fas fa-check"></i> Done</button>
                `;
                document.getElementById('jsonMergeDoneBtn').addEventListener('click', () => {
                    closeJsonMergeModal();
                    renderAll();              // recalculates stats, results, winners, rankings, vote %
                    updateButtonVisibility();
                });

                showToast(`Import complete! ${s.voters_added} voters, ${s.votes_added} votes merged.`, 'success');

            } catch (err) {
                const errEl = document.getElementById('jsonMergeError');
                errEl.textContent = 'Import error: ' + err.message;
                errEl.classList.remove('hidden');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Proceed';
                showToast('Import failed: ' + err.message, 'error');
            }
        }

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

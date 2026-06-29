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

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // Ensure houses exist
                if (!parsed.houses || parsed.houses.length === 0) {
                    parsed.houses = getDefaultHouses();
                }
                // Ensure categories exist
                if (!parsed.categories || parsed.categories.length === 0) {
                    parsed.categories = getDefaultCategories();
                }
                // Ensure categories have houseSpecific and houseId fields
                for (const cat of parsed.categories) {
                    if (cat.houseSpecific === undefined) cat.houseSpecific = false;
                    if (cat.houseId === undefined) cat.houseId = null;
                }
                // Ensure settings fields
                if (!parsed.settings) parsed.settings = {};
                if (!parsed.settings.electionMode) parsed.settings.electionMode = 'optional_pin';
                if (parsed.settings.isActive === undefined) parsed.settings.isActive = true;
                if (parsed.settings.resultsPublished === undefined) parsed.settings.resultsPublished = false;
                if (parsed.settings.showSkipButton === undefined) parsed.settings.showSkipButton = true;
                if (parsed.settings.showVerifyButton === undefined) parsed.settings.showVerifyButton = true;
                if (parsed.settings.lastHomeHouseId === undefined) parsed.settings.lastHomeHouseId = null;
                if (!parsed.settings.adminPasswordHash) {
                    parsed.settings.adminPasswordHash = hashString('admin123');
                }
                // Ensure school name/subtitle
                if (!parsed.schoolName) parsed.schoolName = 'Springfield High';
                if (!parsed.schoolSubtitle) parsed.schoolSubtitle = 'Student Council Election 2026';
                // Ensure voters have houseId
                if (parsed.voters) {
                    for (const v of parsed.voters) {
                        if (v.houseId === undefined) v.houseId = null;
                        if (v.admissionNumber === undefined) v.admissionNumber = v.rollNumber || '';
                        if (v.className === undefined) v.className = v.class || '';
                        if (v.section === undefined) v.section = '';
                        if (v.rollNumber === undefined) v.rollNumber = v.admissionNumber || '';
                    }
                }
                // Ensure nominees have houseId
                if (parsed.nominees) {
                    for (const n of parsed.nominees) {
                        if (n.houseId === undefined) n.houseId = null;
                    }
                }
                appData = parsed;
                activeHomeHouseId = appData.settings.lastHomeHouseId || null;
                return;
            }
        } catch (_) { /* ignore */ }
        appData = getDefaultData();
        appData.settings.adminPasswordHash = hashString('admin123');
        appData.settings.lastHomeHouseId = null;
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
    function addHouse(name, color) {
        if (!name.trim()) return false;
        const id = name.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
        if (appData.houses.some(h => h.name.toLowerCase() === name.trim().toLowerCase())) {
            showToast('House already exists.', 'error');
            return false;
        }
        appData.houses.push({ id, name: name.trim(), color: color || '#3498db' });
        saveData();
        renderAllSettings();
        showToast(`House "${name.trim()}" added.`, 'success');
        return true;
    }

    function removeHouse(id) {
        // Check if any voters are assigned to this house
        const votersInHouse = appData.voters.filter(v => v.houseId === id);
        if (votersInHouse.length > 0) {
            showToast(`Cannot remove house with ${votersInHouse.length} voters assigned. Reassign voters first.`, 'error');
            return false;
        }
        // Check if any nominees are assigned to this house
        const nomineesInHouse = appData.nominees.filter(n => n.houseId === id);
        if (nomineesInHouse.length > 0) {
            showToast(`Cannot remove house with ${nomineesInHouse.length} nominees assigned. Reassign nominees first.`, 'error');
            return false;
        }
        // Check if any categories are house-specific for this house
        const categoriesForHouse = appData.categories.filter(c => c.houseSpecific && c.houseId === id);
        if (categoriesForHouse.length > 0) {
            showToast(`Cannot remove house with ${categoriesForHouse.length} house-specific categories. Remove categories first.`, 'error');
            return false;
        }
        appData.houses = appData.houses.filter(h => h.id !== id);
        saveData();
        renderAllSettings();
        showToast('House removed.', 'info');
        return true;
    }

    function resetDefaultHouses() {
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
            const groups = cat.houseSpecific ?
                appData.houses.map(house => ({
                    title: `${cat.name} - ${house.name}`,
                    nominees: getNomineesByCategoryAndHouse(cat.id, house.id)
                })) :
                [{ title: cat.name, nominees: getNomineesByCategory(cat.id) }];
            const catResults = appData.results[cat.id] || {};
            for (const group of groups) {
                html += `<h5 style="margin-top:16px;color:var(--primary);">${group.title}</h5>`;
                if (group.nominees.length === 0) {
                    html += '<div class="text-muted text-small">No nominees.</div>';
                    continue;
                }
                const maxVotes = Math.max(1, ...group.nominees.map(n => catResults[n.id] || 0));
                for (const n of group.nominees) {
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

    function addCategory(name, houseSpecific = false, houseId = null) {
        if (!name.trim()) return false;
        const id = name.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
        if (appData.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
            showToast('Category already exists.', 'error');
            return false;
        }
        appData.categories.push({ id, name: name.trim(), houseSpecific, houseId });
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

    function addNominee(name, categoryId, photo, problems, whyMe, houseId = null) {
        if (!name || !categoryId) return false;
        if (appData.nominees.some(n => n.name.toLowerCase() === name.toLowerCase() && n.categoryId === categoryId)) {
            showToast('A nominee with this name already exists in this category.', 'error');
            return false;
        }
        const nominee = {
            id: generateId(),
            name: name.trim(),
            categoryId: categoryId,
            houseId: houseId,
            photo: photo || '',
            manifesto: {
                problems: problems || '',
                promises: problems || '',
                whyMe: whyMe || ''
            }
        };
        appData.nominees.push(nominee);
        // Initialize results for this nominee (just in case)
        for (const catId in appData.results) {
            if (appData.results[catId][nominee.id] === undefined) {
                appData.results[catId][nominee.id] = 0;
            }
        }
        saveData();
        renderAllSettings();
        showToast(`Added ${name} to ${getCategoryById(categoryId)?.name || ''}`, 'success');
        return true;
    }

    function updateNominee(id, name, categoryId, photo, problems, whyMe, houseId = null) {
        const nominee = getNomineeById(id);
        if (!nominee || !name || !categoryId) return false;
        if (appData.nominees.some(n => n.id !== id && n.name.toLowerCase() === name.toLowerCase() && n.categoryId === categoryId)) {
            showToast('A nominee with this name already exists in this category.', 'error');
            return false;
        }
        const previousCategoryId = nominee.categoryId;
        nominee.name = name.trim();
        nominee.categoryId = categoryId;
        nominee.houseId = houseId;
        nominee.photo = photo || '';
        nominee.manifesto = {
            problems: problems || '',
            promises: problems || '',
            whyMe: whyMe || ''
        };
        if (!appData.results[categoryId]) {
            appData.results[categoryId] = {};
        }
        if (previousCategoryId !== categoryId) {
            const previousVotes = appData.results[previousCategoryId]?.[id] || 0;
            if (appData.results[previousCategoryId]) {
                delete appData.results[previousCategoryId][id];
            }
            appData.results[categoryId][id] = (appData.results[categoryId][id] || 0) + previousVotes;
        } else if (appData.results[categoryId][id] === undefined) {
            appData.results[categoryId][id] = 0;
        }
        saveData();
        renderAllSettings();
        showToast(`Updated ${nominee.name}`, 'success');
        return true;
    }

    function removeNominee(id) {
        const nominee = getNomineeById(id);
        if (!nominee) return;
        if (editingNomineeId === id) {
            resetNomineeForm();
        }
        appData.nominees = appData.nominees.filter(n => n.id !== id);
        // Remove from results
        for (const catId in appData.results) {
            delete appData.results[catId][id];
        }
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

    function buildVoterRecord(name, admissionNumber, className, section, rollNumber, houseId) {
        return {
            id: generateId(),
            name: name.trim(),
            admissionNumber: admissionNumber.trim(),
            rollNumber: (rollNumber || '').trim(),
            className: (className || '').trim(),
            section: (section || '').trim(),
            houseId: houseId || null,
            hasVoted: false,
            skipped: false,
            pinHash: null,
            voteEncrypted: null,
            voteTimestamp: null
        };
    }

    function addVoter(name, admissionNumber, className, section, rollNumber, houseId = null) {
        if (!name || !admissionNumber) return false;
        if (appData.voters.some(v => (v.admissionNumber || '').toLowerCase() === admissionNumber.toLowerCase())) {
            showToast('A voter with this admission number already exists.', 'error');
            return false;
        }
        if (houseId && !getHouseById(houseId)) {
            showToast('Selected house was not found.', 'error');
            return false;
        }
        appData.voters.push(buildVoterRecord(name, admissionNumber, className, section, rollNumber, houseId));
        saveData();
        renderAllSettings();
        showToast(`Added voter ${name.trim()}.`, 'success');
        return true;
    }

    function updateVoter(id, name, admissionNumber, className, section, rollNumber, houseId = null) {
        const voter = getVoterById(id);
        if (!voter || !name || !admissionNumber) return false;
        if (appData.voters.some(v => v.id !== id && (v.admissionNumber || '').toLowerCase() === admissionNumber.toLowerCase())) {
            showToast('A voter with this admission number already exists.', 'error');
            return false;
        }
        if (houseId && !getHouseById(houseId)) {
            showToast('Selected house was not found.', 'error');
            return false;
        }
        voter.name = name.trim();
        voter.admissionNumber = admissionNumber.trim();
        voter.className = (className || '').trim();
        voter.section = (section || '').trim();
        voter.rollNumber = (rollNumber || '').trim();
        voter.houseId = houseId || null;
        saveData();
        renderAllSettings();
        showToast(`Updated voter ${voter.name}.`, 'success');
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

    function importVoters(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            showToast('CSV is empty.', 'error');
            return;
        }
        let added = 0,
            skipped = 0;
        let startIdx = 0;
        let headerMap = null;
        const first = parseCsvLine(lines[0]).map(normalizeHeader);
        if (first.some(h => ['votername', 'admissionnumber', 'admissionno', 'voterid', 'rollnumber', 'name'].includes(h))) {
            startIdx = 1;
            headerMap = {};
            first.forEach((header, idx) => {
                headerMap[header] = idx;
            });
        }
        for (let i = startIdx; i < lines.length; i++) {
            const parts = parseCsvLine(lines[i]);
            if (parts.length < 2) continue;
            let name = '';
            let admissionNumber = '';
            let className = '';
            let section = '';
            let rollNumber = '';
            let houseId = '';

            if (headerMap) {
                name = parts[headerMap.votername ?? headerMap.name] || '';
                admissionNumber = parts[headerMap.admissionnumber ?? headerMap.admissionno ?? headerMap.voterid] || '';
                className = parts[headerMap.class] || '';
                section = parts[headerMap.section] || '';
                rollNumber = parts[headerMap.rollnumber ?? headerMap.rollno ?? headerMap.roll] || '';
                houseId = parts[headerMap.houseid] || '';
                if (!admissionNumber) admissionNumber = rollNumber;
            } else if (parts.length >= 6) {
                [name, admissionNumber, className, section, rollNumber, houseId] = parts;
            } else {
                rollNumber = parts[0] || '';
                admissionNumber = rollNumber;
                name = parts.slice(1).join(',').trim();
            }

            if (!name || !admissionNumber) continue;
            if (appData.voters.some(v => (v.admissionNumber || '').toLowerCase() === admissionNumber.toLowerCase())) {
                skipped++;
                continue;
            }
            // Validate houseId if provided
            if (houseId && !getHouseById(houseId)) {
                showToast(`House "${houseId}" not found for voter ${admissionNumber}. Skipping.`, 'error');
                skipped++;
                continue;
            }
            appData.voters.push(buildVoterRecord(name, admissionNumber, className, section, rollNumber, houseId));
            added++;
        }
        saveData();
        renderAllSettings();
        showToast(`Imported ${added} voters (${skipped} duplicates skipped).`, 'success');
    }

    function exportVoters() {
        if (appData.voters.length === 0) {
            showToast('No voters to export.', 'error');
            return;
        }
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
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voters_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Voters exported.', 'success');
    }

    function importNominees(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            showToast('CSV is empty.', 'error');
            return;
        }
        let added = 0,
            skipped = 0;
        let startIdx = 0;
        const first = lines[0].toLowerCase();
        if (first.includes('name') && first.includes('category')) {
            startIdx = 1;
        }
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim());
            if (parts.length < 2) continue;
            const name = parts[0];
            const categoryId = parts[1];
            const houseId = parts[2] || null;
            const photo = parts[3] || '';
            const problems = parts[4] || '';
            const whyMe = parts[5] || '';
            
            if (!name || !categoryId) continue;
            
            // Check if category exists
            const category = getCategoryById(categoryId);
            if (!category) {
                showToast(`Category "${categoryId}" not found. Skipping "${name}".`, 'error');
                skipped++;
                continue;
            }
            
            // Validate houseId if provided
            if (houseId && !getHouseById(houseId)) {
                showToast(`House "${houseId}" not found for nominee "${name}". Skipping.`, 'error');
                skipped++;
                continue;
            }
            
            // Check for duplicate
            if (appData.nominees.some(n => n.name.toLowerCase() === name.toLowerCase() && n.categoryId === categoryId)) {
                skipped++;
                continue;
            }
            
            appData.nominees.push({
                id: generateId(),
                name: name,
                categoryId: categoryId,
                houseId: houseId,
                photo: photo,
                manifesto: {
                    problems: problems,
                    promises: problems,
                    whyMe: whyMe
                }
            });
            // Initialize results for this nominee
            if (!appData.results[categoryId]) {
                appData.results[categoryId] = {};
            }
            appData.results[categoryId][appData.nominees[appData.nominees.length - 1].id] = 0;
            added++;
        }
        saveData();
        renderAllSettings();
        showToast(`Imported ${added} nominees (${skipped} duplicates skipped).`, 'success');
    }

    function exportNominees() {
        if (appData.nominees.length === 0) {
            showToast('No nominees to export.', 'error');
            return;
        }
        let csv = 'name,categoryId,houseId,photoUrl,problems,whyMe\n';
        for (const n of appData.nominees) {
            const cat = getCategoryById(n.categoryId);
            const catId = cat ? cat.id : n.categoryId;
            const houseId = n.houseId || '';
            const photo = n.photo || '';
            const problems = (n.manifesto?.problems || '').replace(/,/g, ' ');
            const whyMe = (n.manifesto?.whyMe || '').replace(/,/g, ' ');
            csv += `${n.name},${catId},${houseId},${photo},${problems},${whyMe}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nominees_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Nominees exported.', 'success');
    }

    function importHouses(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            showToast('CSV is empty.', 'error');
            return;
        }
        let added = 0,
            skipped = 0;
        let startIdx = 0;
        const first = lines[0].toLowerCase();
        if (first.includes('name') && first.includes('color')) {
            startIdx = 1;
        }
        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim());
            if (parts.length < 1) continue;
            const name = parts[0];
            const color = parts[1] || '#3498db';
            
            if (!name) continue;
            
            // Check for duplicate
            if (appData.houses.some(h => h.name.toLowerCase() === name.toLowerCase())) {
                skipped++;
                continue;
            }
            
            const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
            appData.houses.push({ id, name: name, color: color });
            added++;
        }
        saveData();
        renderAllSettings();
        showToast(`Imported ${added} houses (${skipped} duplicates skipped).`, 'success');
    }

    function exportHouses() {
        if (appData.houses.length === 0) {
            showToast('No houses to export.', 'error');
            return;
        }
        let csv = 'name,color\n';
        for (const h of appData.houses) {
            csv += `${h.name},${h.color}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `houses_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Houses exported.', 'success');
    }

    function clearAllVoters() {
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
Red House,#e74c3c
Green House,#27ae60
Yellow House,#f39c12
Blue House,#3498db`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_houses.csv';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('exportHousesBtn').addEventListener('click', exportHouses);

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

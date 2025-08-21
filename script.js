// The definitive, correct script.js file for Hbuk

import { apiRequest, getToken, clearToken } from './api-utils.js';
import { showNotification } from './ui-notify.js';

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('editor');
    const commitButton = document.getElementById('commitBtn');
    const historyContainer = document.getElementById('entries');
    const autoReceiptsChk = document.getElementById('autoReceiptsChk');
    const localDraftKey = 'hbuk_local_draft';
    
    // Auto-receipts toggle (default OFF - no surprise downloads)
    const KEY = 'hbuk:autoReceipts';
    autoReceiptsChk.checked = JSON.parse(localStorage.getItem(KEY) ?? 'false');
    autoReceiptsChk.addEventListener('change', () => localStorage.setItem(KEY, JSON.stringify(autoReceiptsChk.checked)));
    
    // Focus mode toggle with escape mechanisms
    const focusToggle = document.getElementById('focusToggle');
    const floatingCommit = document.getElementById('floatingCommit');
    const floatingCommitBtn = document.getElementById('floatingCommitBtn');
    const FOCUS_KEY = 'hbuk:focus';
    
    function setFocus(on) {
        document.body.classList.toggle('focus', !!on);
        localStorage.setItem(FOCUS_KEY, on ? '1' : '0');
        const isFocus = document.body.classList.contains('focus');
        floatingCommit.style.display = isFocus ? 'block' : 'none';
        focusToggle.textContent = isFocus ? 'Show' : 'Focus';
        focusToggle.title = isFocus ? 'Show interface (F)' : 'Focus mode (F)';
    }
    
    function initFocus() {
        // Restore from localStorage
        if (localStorage.getItem(FOCUS_KEY) === '1') setFocus(true);
        
        // Escape key exits focus
        window.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape') setFocus(false); 
        });
        
        // Top hover reveal zone
        const reveal = document.createElement('div');
        reveal.id = 'focus-reveal';
        reveal.addEventListener('mouseenter', () => setFocus(false));
        document.body.appendChild(reveal);
        
        // URL override: ?focus=off
        const params = new URLSearchParams(location.search);
        if (params.get('focus') === 'off') setFocus(false);
    }
    
    focusToggle?.addEventListener('click', () => {
        setFocus(!document.body.classList.contains('focus'));
    });
    
    // Initialize focus mode
    initFocus();
    
    // Keyboard shortcuts: F for focus mode, Cmd/Ctrl+Enter to commit
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            const activeBtn = document.body.classList.contains('focus') ? floatingCommitBtn : commitButton;
            activeBtn?.click();
        }
        if (e.key.toLowerCase() === 'f' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
            focusToggle?.click();
        }
    });
    
    // Wire up floating commit button
    if (floatingCommitBtn) {
        floatingCommitBtn.onclick = () => commitButton?.click();
    }
    
    // Focus editor
    editor?.focus();
    
    // Global entries array to store all entries
    let entries = [];

    // --- JWT EXPIRY CHECKING ---
    function computeDigestLocal({ userId, content, createdAt, location }) {
        const payload = JSON.stringify({
            userId: String(userId),
            content,
            createdAt: new Date(createdAt).toISOString(),
            location: location || null
        });
        // Browser SHA-256 (SubtleCrypto)
        const enc = new TextEncoder().encode(payload);
        return crypto.subtle.digest('SHA-256', enc).then(buf =>
            [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('')
        );
    }

    function isExpired(jwt) {
        try {
            const [, payload] = jwt.split('.');
            const { exp } = JSON.parse(atob(payload));
            return !exp || (Date.now() / 1000) >= exp;
        } catch { 
            return true; 
        }
    }

    // --- CORE FUNCTIONS ---

    function renderEntries(entries) {
        historyContainer.innerHTML = '';
        for (const entry of entries) {
            const entryDiv = document.createElement('div');
            
            // Check if this entry has a tombstone
            const hasTombstone = entries.some(t => t.type === 'tombstone' && t.originalId === entry._id);
            
            if (entry.type === 'tombstone' || hasTombstone) {
                // Render deleted entry
                entryDiv.className = 'entry deleted';
                entryDiv.innerHTML = '<em>Deleted — tombstone present</em>';
                historyContainer.appendChild(entryDiv);
                continue;
            }
            
            entryDiv.className = 'entry';
            // Add data attributes for copy functionality
            const entryId = entry._id || entry.id;
            entryDiv.setAttribute('data-entry-id', entryId);
            
            const textP = document.createElement('div');
            textP.className = 'content';
            textP.innerHTML = marked.parse(entry.content || entry.text || '');
            
            const metaP = document.createElement('div');
            metaP.className = 'badge';
            const date = new Date(entry.createdAt || entry.timestamp);
            const locationString = formatLocation(entry);
            metaP.textContent = `Committed on ${date.toLocaleString()} from ${locationString}`;
            
            // Add digest display with copy and verify actions
            if (entry.digest) {
                const short = entry.digest.slice(0, 10);
                // Helper: normalize entry ID (handle both _id and id)
                const eid = (entry && (entry._id || entry.id)) || null;
                const verifyUrl = eid ? `verify.html#id=${encodeURIComponent(eid)}&digest=${encodeURIComponent(entry.digest)}` : '#';
                
                const badgeDiv = document.createElement('div');
                badgeDiv.className = 'badge entry-meta';
                badgeDiv.innerHTML = `
                    <span class="digest-chip" data-digest="${entry.digest}" title="Click to copy full digest">digest: ${short}…</span>
                    <button class="copy btn secondary" title="Copy this entry">Copy</button>
                    <a class="btn secondary" href="${verifyUrl}" target="_blank" title="Open a public page to check this digest matches the text" ${!eid ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>Verify</a>
                `;
                
                entryDiv.appendChild(badgeDiv);
            }
            
            entryDiv.appendChild(textP);
            entryDiv.appendChild(metaP);
            historyContainer.appendChild(entryDiv);
            
            // Bind entry card for copy functionality
            __bindEntryCard(entryDiv, entry);
        }
        
        // Copy buttons are now handled by event delegation in the copy UX section
    }

    async function fetchAndRenderEntries() {
        try {
            const data = await apiRequest('/api/entries');
            if (data && Array.isArray(data.entries)) {
                entries = data.entries;
                // Build global map for copy functionality
                window.ENTRIES_BY_ID = {};
                entries.forEach(entry => {
                    const id = entry._id || entry.id;
                    if (id) window.ENTRIES_BY_ID[id] = entry;
                });
                renderEntries(entries);
            } else {
                entries = [];
                window.ENTRIES_BY_ID = {};
                renderEntries([]);
            }
        } catch (error) {
            console.error('Could not fetch entries:', error);
            showNotification('Failed to load entries: ' + error.message, 'error');
            entries = [];
            window.ENTRIES_BY_ID = {};
            renderEntries([]);
        }
    }

    // --- NEW: A dedicated, promise-based function to get location ---
    function getCurrentLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ latitude: 'not supported', longitude: 'not supported' });
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                () => {
                    resolve({ latitude: 'unavailable', longitude: 'unavailable' });
                }
            );
        });
    }

    // --- LOCATION FORMATTING HELPER ---
    function formatLocation(entry) {
        if (entry?.locationName) return entry.locationName;
        if (typeof entry?.latitude === 'number' && typeof entry?.longitude === 'number') {
            return `(${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)})`;
        }
        return 'Location not available';
    }

    // --- DOWNLOAD RECEIPT FUNCTION ---
    function downloadReceipt(entry) {
        const receipt = {
            id: entry.id,
            createdAt: entry.createdAt,
            digest: entry.digest,
            signature: entry.signature,
            sigAlg: entry.sigAlg,
            sigKid: entry.sigKid,
        };
        const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hbuk-receipt-${entry.id}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // --- REFACTORED: The main entry creation logic ---
    async function createEntry(entryData) {
        try {
            // Send the new entry to the backend to be saved
            const savedEntry = await apiRequest('/api/commit', {
                method: 'POST',
                body: JSON.stringify(entryData)
            });

            if (savedEntry) {
                console.log('Backend response:', savedEntry);

                // Show the commit receipt with digest
                showNotification(`Committed ✓ Digest: ${savedEntry.digest.slice(0,10)}…`, 'success');

                // Download receipt only if auto-receipts is enabled
                const autoReceiptsOn = localStorage.getItem('hbuk:autoReceipts') === '1';
                if (autoReceiptsOn) {
                    downloadReceipt(savedEntry);
                }

                // Add the new entry to our local list using SERVER RESPONSE (not optimistic data)
                const newEntry = {
                    _id: savedEntry._id || savedEntry.id,  // Use server _id
                    id: savedEntry._id || savedEntry.id,   // Keep both for compatibility
                    content: savedEntry.content,           // Use server content
                    createdAt: savedEntry.createdAt,       // Use server timestamp
                    digest: savedEntry.digest,             // Use server digest
                    signature: savedEntry.signature,       // Use server signature
                    // ✅ Use server location data - this is the key fix
                    ...(savedEntry.latitude && {
                        latitude: savedEntry.latitude,
                        longitude: savedEntry.longitude,
                        locationName: savedEntry.locationName
                    })
                };
                entries.unshift(newEntry); // Add to beginning since we sort by createdAt desc

                // Re-render the history with the updated list
                renderEntries(entries);

                // Clear the editor and the local draft
                localStorage.removeItem(localDraftKey);
                editor.value = '';
            }
        } catch (error) {
            console.error('Error sending entry to backend:', error);
            // The apiRequest function will handle showing the notification
        }
    }

    // --- EVENT LISTENERS ---

    // Auto-save local draft and update word count
    const wordCount = document.getElementById('wordCount');
    editor.addEventListener('input', () => {
        localStorage.setItem(localDraftKey, editor.value);
        
        // Update word count
        if (wordCount) {
            const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
            wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        }
    });



    // --- REFACTORED: The commit button listener ---
    commitButton.addEventListener('click', async () => {
        const token = localStorage.getItem('hbuk_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        const text = editor.value.trim();
        if (text === '') return;

        // Disable button and show loading state
        const originalText = commitButton.textContent;
        commitButton.disabled = true;
        commitButton.textContent = 'Committing...';

        try {
            // --- THIS IS THE CRITICAL FIX ---
            // 1. Get location FIRST and wait for it.
            const location = await getCurrentLocation();
            // 2. Get timestamp.
            const timestamp = new Date().toISOString();
            // 3. Get location name.
            let locationName = "Unknown Location";
            if (location.latitude !== 'unavailable' && location.latitude !== 'not supported') {
                try {
                    const geoResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${location.latitude}&longitude=${location.longitude}&localityLanguage=en`);
                    const data = await geoResponse.json();
                    const place = data.locality || data.city;
                    locationName = `${place}, ${data.principalSubdivision}, ${data.countryName}`;
                } catch (error) {
                    console.error("Reverse geocoding failed:", error);
                    locationName = "Location lookup failed";
                }
            } else {
                locationName = "Location not available";
            }

            // 4. Build the data package with only the fields we want to store.
            const newEntry = {
                content: text,
                // Only include location data if it's available and valid
                ...(location.latitude !== 'unavailable' && location.latitude !== 'not supported' && {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    locationName
                })
            };

            // 5. NOW send the complete package to the createEntry function.
            await createEntry(newEntry);
        } catch (error) {
            console.error('Error during commit:', error);
            showNotification('Failed to commit entry. Please try again.', 'error');
        } finally {
            // Re-enable button and restore original text
            commitButton.disabled = false;
            commitButton.textContent = originalText;
        }
    });

    // --- EXPORT FUNCTIONALITY ---
    async function exportAllEntries() {
        try {
            const response = await fetch(`${API_BASE}/api/export`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'hbuk-export.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            
            showNotification('Export downloaded successfully!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Export failed: ' + error.message, 'error');
        }
    }

    // Wire up export button in header
    const exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) {
        exportAllBtn.onclick = exportAllEntries;
    }

    // --- AUTHENTICATION UI MANAGEMENT ---
    function updateAuthUI() {
        const token = localStorage.getItem('hbuk_token');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (token) {
            // User is logged in
            if (logoutBtn) {
                logoutBtn.textContent = 'Logout';
                logoutBtn.onclick = (e) => {
                    e.preventDefault();
                    localStorage.removeItem('hbuk_token');
                    showNotification('Logged out successfully.', 'success');
                    window.location.reload();
                };
            }
        } else {
            // User is not logged in
            if (logoutBtn) {
                logoutBtn.textContent = 'Login';
                logoutBtn.onclick = () => {
                    window.location.href = 'login.html';
                };
            }
        }
    }

    // --- INITIAL PAGE LOAD LOGIC ---
    function initialize() {
        const token = getToken();
        if (!token || isExpired(token)) {
            clearToken();
            showNotification('Please log in to continue.', 'error');
            window.location.href = 'login.html';
            return;
        }
        
        updateAuthUI();
        fetchAndRenderEntries();
        
        const localDraft = localStorage.getItem(localDraftKey);
        if (localDraft) {
            editor.value = localDraft;
        }
        
        // Initialize word count
        if (wordCount) {
            const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
            wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        }
        
        editor.focus();
    }

    initialize();
});

// ---------- Focus mode ----------
(function setupFocus() {
  const FOCUS_KEY = 'hbuk:focus';

  function setFocus(on) {
    document.body.classList.toggle('focus', !!on);
    localStorage.setItem(FOCUS_KEY, on ? '1' : '0');
  }

  // restore saved state
  if (localStorage.getItem(FOCUS_KEY) === '1') setFocus(true);

  // wire the header toggle (button text usually "Focus"/"Show")
  const focusBtn = document.querySelector('.appbar [data-focus-toggle]') ||
                   document.querySelector('.appbar button:has(>span:contains("Focus"))') ||
                   document.querySelector('.appbar button'); // fallback
  focusBtn && focusBtn.addEventListener('click', () => {
    setFocus(!document.body.classList.contains('focus'));
  });

  // Esc exits focus
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFocus(false);
  });

  // Hover strip exits focus
  const reveal = document.createElement('div');
  reveal.id = 'focus-reveal';
  reveal.title = 'Exit focus';
  reveal.addEventListener('mouseenter', () => setFocus(false));
  document.body.appendChild(reveal);

  // Bottom commit mirrors the main commit button
  const dockBtn = document.getElementById('commit-dock-button');
  dockBtn && dockBtn.addEventListener('click', () => {
    (document.querySelector('button.commit') ||
     document.querySelector('button[type="submit"]'))?.click();
  });
})();

// ---------- Copy UX (digest chip + full entry) ----------
window.ENTRIES_BY_ID = window.ENTRIES_BY_ID || Object.create(null);

// Call this inside your renderEntries loop after you create each card element
function __bindEntryCard(cardEl, entryDoc) {
  const id = entryDoc._id || entryDoc.id;
  if (!id) return;
  window.ENTRIES_BY_ID[id] = entryDoc;
  cardEl.dataset.entryId = id;
  // store full digest on the chip
  const chip = cardEl.querySelector('[data-digest]');
  if (chip) chip.dataset.digest = entryDoc.digest || '';
}

// Delegate clicks for digest chip + copy button
document.addEventListener('click', async (e) => {
  // digest chip
  const chip = e.target.closest('[data-digest]');
  if (chip) {
    const dig = chip.dataset.digest || chip.textContent.trim();
    if (dig) {
      await navigator.clipboard.writeText(dig);
      (window.notify || window.alert)('Digest copied');
    }
    return;
  }

  // full entry copy (button with class .copy or data-action attr)
  const copyBtn = e.target.closest('button.copy,[data-action="copy-entry"]');
  if (copyBtn) {
    const card = copyBtn.closest('[data-entry-id]');
    const id = card && card.dataset.entryId;
    const doc = id && window.ENTRIES_BY_ID[id];
    if (!doc) {
      (window.notify || window.alert)('Could not find entry to copy');
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    (window.notify || window.alert)('Entry copied');
  }
});
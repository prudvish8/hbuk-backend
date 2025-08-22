// The definitive, correct script.js file for Hbuk

import { apiRequest, getToken, clearToken } from './api-utils.js';
import { showNotification } from './ui-notify.js';

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('editor');
    const commitButton = document.getElementById('commitBtn');
    const historyContainer = document.getElementById('entries');
    const autoReceiptsChk = document.getElementById('autoReceiptsChk');
    const wordCount = document.getElementById('wordCount');
    const localDraftKey = 'hbuk_local_draft';
    
    function updateWordCount() {
        if (!wordCount) return;
        const text = editor?.value?.trim() ?? '';
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    }
    
    // Auto-receipts toggle (default OFF - no surprise downloads)
    const KEY = 'hbuk:autoReceipts';
    autoReceiptsChk.checked = JSON.parse(localStorage.getItem(KEY) ?? 'false');
    autoReceiptsChk.addEventListener('change', () => localStorage.setItem(KEY, JSON.stringify(autoReceiptsChk.checked)));
    
    // helper: green pill under editor for ~2s
    function showCommitNotice(digest) {
        const el = document.getElementById('commitNotice');
        if (!el) return;
        el.textContent = `Committed ✓ Digest: ${String(digest).slice(0, 10)}…`;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => {
            el.classList.remove('show');
            el.textContent = '';
        }, 2000);
    }

    // Focus mode toggle with escape mechanisms
    const focusToggle = document.getElementById('focusToggle');
    const FOCUS_KEY = 'hbuk:focus';
    
    function setFocus(on) {
        document.body.classList.toggle('focus', !!on);
        localStorage.setItem(FOCUS_KEY, on ? '1' : '0');

        const isFocus = document.body.classList.contains('focus');
        if (focusToggle) {
            focusToggle.textContent = isFocus ? 'Show' : 'Focus';
            focusToggle.title       = isFocus ? 'Show interface (F)' : 'Focus mode (F)';
        }

        // NEW: hard toggle the dock (wins against any CSS race)
        const dock = document.getElementById('floatingCommit');
        if (dock) {
            dock.style.setProperty('display', isFocus ? 'flex' : 'none', 'important');
            void dock.offsetHeight;  // reflow to apply
        }
    }
    
    function initFocus() {
        // Restore from localStorage
        if (localStorage.getItem(FOCUS_KEY) === '1') setFocus(true);
        
        // Escape key exits focus
        window.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape') setFocus(false); 
        });
        
            // Top hover reveal zone (already in HTML)
    const reveal = document.getElementById('focus-reveal');
    reveal?.addEventListener('mouseenter', () => setFocus(false));
    
    // focus escape strip (once)
    (() => {
        const reveal = document.getElementById('focus-reveal');
        if (reveal) reveal.addEventListener('mouseenter', () => {
            document.body.classList.remove('focus');
            localStorage.setItem('hbuk:focus', '0');
        });
    })();
        
        // URL override: ?focus=off
        const params = new URLSearchParams(location.search);
        if (params.get('focus') === 'off') setFocus(false);
    }
    
    focusToggle?.addEventListener('click', () => {
        setFocus(!document.body.classList.contains('focus'));
    });
    
    // Initialize focus mode
    initFocus();
    
    // Wire export buttons
    wireExports();
    
    // Cmd/Ctrl + Enter commits (uses the single commit button)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            commitButton?.click();
        }
        if (e.key.toLowerCase() === 'f' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName || '')) {
            focusToggle?.click();
        }
    });
    
    // Focus editor
    editor?.focus();
    

    
    // Global entries array to store all entries
    let entries = [];

    // ––––– Location helpers (pretty name + flag + friendly fallback) –––––
    const FALLBACK_PLACE = 'somewhere in the universe ✨';
    
    function cleanCountryName(name = '') {
        // strip trailing " (the)" etc.
        return name.replace(/\s*\((the|of the)\)\s*$/i, '');
    }
    
    function codeToFlag(code) {
        // ISO alpha-2 to emoji flag
        if (!code || code.length !== 2) return '';
        const base = 0x1F1E6; // 'A'
        return String.fromCodePoint(
            base + (code.toUpperCase().charCodeAt(0) - 65),
            base + (code.toUpperCase().charCodeAt(1) - 65)
        );
    }
    
    function prettyPlace(geo) {
        // Accepts BigDataCloud reverse-geocode or our stored shape
        // Expected fields: locality/city, principalSubdivision, countryName, countryCode, locationName
        if (geo?.locationName) return geo.locationName; // already pretty
        const city =
            geo.locality || geo.city || geo.localityInfo?.administrative?.[0]?.name || '';
        const region = geo.principalSubdivision || geo.region || '';
        const country = cleanCountryName(geo.countryName || geo.country || '');
        const flag = codeToFlag(geo.countryCode || geo.countryCodeAlpha2 || '');
        const parts = [city, region, country].filter(Boolean);
        if (!parts.length) return FALLBACK_PLACE;
        return `${parts.join(', ')} ${flag}`.trim();
    }
    
    function toastOk(msg, ms = 1800) {
        const n = document.getElementById('commitNotice');
        if (!n) return;
        n.textContent = msg;
        n.classList.add('show', 'success');
        setTimeout(() => n.classList.remove('show', 'success'), ms);
    }

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
            const locationString = prettyPlace(entry);
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
                    <button class="digest-chip" data-digest="${entry.digest}" title="Click to copy full digest">digest: ${short}…</button>
                    <button class="copy-entry btn secondary" title="Copy this entry">Copy</button>
                    <a class="btn secondary" href="${verifyUrl}" target="_blank" title="Open a public page to check this digest matches the text" ${!eid ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>Verify</a>
                `;
                
                entryDiv.appendChild(badgeDiv);
            }
            
            entryDiv.appendChild(textP);
            entryDiv.appendChild(metaP);
            historyContainer.appendChild(entryDiv);
            
            // Remember entry for copy functionality
            rememberEntry(entry);
        }
        
        // Copy buttons are now handled by event delegation in the copy UX section
    }

    async function fetchAndRenderEntries() {
        try {
            const data = await apiRequest('/api/entries');
            if (data && Array.isArray(data.entries)) {
                entries = data.entries;
                // Build global map for copy functionality
                window.ENTRIES_BY_ID.clear();
                entries.forEach(entry => {
                    rememberEntry(entry);
                });
                renderEntries(entries);
            } else {
                entries = [];
                window.ENTRIES_BY_ID.clear();
                renderEntries([]);
            }
        } catch (error) {
            console.error('Could not fetch entries:', error);
            showNotification('Failed to load entries: ' + error.message, 'error');
            entries = [];
            window.ENTRIES_BY_ID.clear();
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

    // (formatLocation removed; replaced by prettyLocationStamp above)

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
                showCommitNotice(savedEntry.digest);  // ⬅ green pill under editor

                // Download receipt only if auto-receipts is enabled
                const autoReceiptsOn = JSON.parse(localStorage.getItem('hbuk:autoReceipts') ?? 'false');
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
                updateWordCount();          // ← ensures it shows "0 words"
            }
        } catch (error) {
            console.error('Error sending entry to backend:', error);
            // The apiRequest function will handle showing the notification
        }
    }

    // --- EVENT LISTENERS ---

    // Auto-save local draft and update word count
    editor.addEventListener('input', () => {
        localStorage.setItem(localDraftKey, editor.value);
        updateWordCount();
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
            // 3. Get location name (pretty + flag, or friendly fallback)
            let locationName = FALLBACK_PLACE;
            if (location.latitude !== 'unavailable' && location.latitude !== 'not supported') {
                try {
                    const resp = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${location.latitude}&longitude=${location.longitude}&localityLanguage=en`
                    );
                    const data = await resp.json();
                    // prettify + flag
                    locationName = prettyPlace(data);
                } catch (e) {
                    console.warn('Reverse geocoding failed:', e);
                    locationName = FALLBACK_PLACE;
                }
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

    // -------- Export buttons --------
    async function fetchAllEntries() {
        const token = localStorage.getItem('hbuk_token');
        const res = await fetch(`${window.API_BASE || ''}/api/entries`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return Array.isArray(data) ? data : (data.entries || []);
    }

    async function onExportJSON() {
        const entries = await fetchAllEntries();
        const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `hbuk-entries-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toastOk('Exported JSON ✓');
    }

    async function onExportPDF() {
        const entries = await fetchAllEntries();
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) { alert('PDF library failed to load'); return; }
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const margin = 48, width = 595 - margin * 2;
        let y = margin;
        doc.setFont('Helvetica', 'bold'); doc.setFontSize(16);
        doc.text('hbuk — journal export', margin, y); y += 20;
        doc.setFont('Helvetica', 'normal'); doc.setFontSize(10);
        doc.text(new Date().toString(), margin, y); y += 22;

        entries.forEach((e, idx) => {
            const when = new Date(e.createdAt || e.created_at || e.timestamp || Date.now());
            const meta = `#${idx + 1} • ${when.toLocaleString()} • ${e.locationName || FALLBACK_PLACE}`;
            const body = (e.content || '').replace(/\r\n/g, '\n');
            const metaLines = doc.splitTextToSize(meta, width);
            const bodyLines = doc.splitTextToSize(body, width);
            // page break if needed
            const blockHeight = (metaLines.length + bodyLines.length) * 14 + 18;
            if (y + blockHeight > 842 - margin) { doc.addPage(); y = margin; }
            doc.setFont('Helvetica', 'bold');  doc.setFontSize(11);
            doc.text(metaLines, margin, y); y += metaLines.length * 14 + 6;
            doc.setFont('Helvetica', 'normal'); doc.setFontSize(12);
            doc.text(bodyLines, margin, y); y += bodyLines.length * 14 + 12;
        });
        doc.save(`hbuk-entries-${new Date().toISOString().slice(0,10)}.pdf`);
        toastOk('Exported PDF ✓');
    }

    function wireExports() {
        const btnJson = document.getElementById('exportJsonBtn');
        const btnPdf  = document.getElementById('exportPdfBtn');
        btnJson?.addEventListener('click', onExportJSON);
        btnPdf?.addEventListener('click', onExportPDF);
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
        updateWordCount();
        
        editor.focus();
    }

    initialize();
});



// ---------- Copy UX (digest chip + full entry) ----------
// Keep a map of entries you fetched/created
window.ENTRIES_BY_ID = window.ENTRIES_BY_ID || new Map();

function rememberEntry(e) {
  const id = e?.id || e?._id;
  if (id) window.ENTRIES_BY_ID.set(id, e);
}

// Single event-delegated handler (works for all entries)
document.addEventListener('click', async (ev) => {
  // Copy full digest when clicking the chip
  const chip = ev.target.closest('.digest-chip');
  if (chip) {
    try {
      await navigator.clipboard.writeText(chip.dataset.digest);
      showNotification('Digest copied ✓', 'success', 2000); // green patch, 2s
    } catch (e) {
      console.warn('Copy digest failed', e);
      showNotification('Could not copy digest', 'error', 2000);
    }
    return;
  }

  // Copy full entry JSON when clicking "Copy"
  const copyBtn = ev.target.closest('.copy-entry');
  if (copyBtn) {
    const host = copyBtn.closest('[data-entry-id]');
    const id = host?.dataset.entryId;
    const obj = window.ENTRIES_BY_ID?.get(id);
    if (!obj) {
      showNotification('Could not find entry data', 'error', 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      showNotification('Entry JSON copied ✓', 'success', 2000); // green patch, 2s
    } catch (e) {
      console.warn('Copy entry failed', e);
      showNotification('Could not copy entry', 'error', 2000);
    }
    return;
  }
});
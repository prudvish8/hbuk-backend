// The definitive, final, and correct script.js for Hbuk

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
    
    // --- REFACTORED & SIMPLIFIED FOCUS LOGIC ---
    const focusToggle = document.getElementById('focusToggle');
    const FOCUS_KEY = 'hbuk:focus';

    function setFocus(on) {
        document.body.classList.toggle('focus', on);
        localStorage.setItem(FOCUS_KEY, on ? '1' : '0');
        if (focusToggle) {
            focusToggle.textContent = on ? 'Show UI' : 'Focus';
            focusToggle.title = on ? 'Show full interface (F)' : 'Enter focus mode (F)';
        }
    }

    // This is the only event listener we need for the toggle button
    focusToggle?.addEventListener('click', () => {
        setFocus(!document.body.classList.contains('focus'));
    });

    function initializeFocus() {
        if (localStorage.getItem(FOCUS_KEY) === '1') {
            setFocus(true);
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setFocus(false);
        });
        const reveal = document.getElementById('focus-reveal');
        reveal?.addEventListener('mouseenter', () => setFocus(false));
        const params = new URLSearchParams(location.search);
        if (params.get('focus') === 'off') setFocus(false);
    }

    // --- REFACTORED & INTELLIGENT KEYBOARD SHORTCUTS ---
    document.addEventListener('keydown', (e) => {
        // Commit Shortcut
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault(); // Prevent new line in textarea
            const isFocus = document.body.classList.contains('focus');
            // Find the correct, VISIBLE commit button and click it
            const activeBtn = isFocus 
                ? document.getElementById('commit-dock-button') 
                : document.getElementById('commitBtn');
            activeBtn?.click();
        }
        // Focus Toggle Shortcut
        if (e.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            focusToggle?.click();
        }
    });

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
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    console.warn('Location error:', error);
                    resolve({ latitude: 'error', longitude: 'error' });
                },
                { timeout: 10000, enableHighAccuracy: false }
            );
        });
    }

    // --- ENTRY CREATION ---
    async function createEntry() {
        const content = editor.value.trim();
        if (!content) {
            showNotification('Please enter some content to commit.', 'error');
            return;
        }

        const originalText = commitButton.textContent;
        commitButton.disabled = true;
        commitButton.textContent = 'Committing...';

        try {
            // Get location if available
            const location = await getCurrentLocation();
            const payload = {
                content,
                ...(location.latitude !== 'not supported' && location.latitude !== 'error' && {
                    latitude: location.latitude,
                    longitude: location.longitude
                })
            };

            const savedEntry = await apiRequest('/api/commit', {
                method: 'POST',
                body: payload
            });

            if (savedEntry && savedEntry._id) {
                // Clear editor and save to localStorage
                editor.value = '';
                localStorage.removeItem(localDraftKey);
                
                // Add to entries array and re-render
                entries.unshift(savedEntry);
                renderEntries(entries);
                
                // Remember entry for copy functionality
                rememberEntry(savedEntry);
                
                showNotification('Entry committed successfully!', 'success');
                
                // Auto-download receipt if enabled
                if (autoReceiptsChk.checked && savedEntry.digest) {
                    downloadReceipt(savedEntry);
                }
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Commit error:', error);
            showNotification('Failed to commit entry: ' + error.message, 'error');
        } finally {
            // Re-enable button and restore original text
            commitButton.disabled = false;
            commitButton.textContent = originalText;
        }
    }

    // --- EXPORT FUNCTIONALITY ---
    async function exportAllEntries() {
        try {
            const response = await fetch(`${window.API_BASE || ''}/api/export`, {
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
        const wordCount = document.getElementById('wordCount');
        if (wordCount) {
            const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
            wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        }
        
        editor.focus();
        
        // Initialize focus mode
        initializeFocus();
    }

    initialize();
});

// --- Copy UX (digest chip + full entry) ---
// Keep a map of entries you fetched/created
window.ENTRIES_BY_ID = window.ENTRIES_BY_ID || new Map();

function rememberEntry(e) {
  const id = e?.id || e?._id;
  if (id) window.ENTRIES_BY_ID.set(id, e);
}

// Single event-delegated handler (works for all entries)
document.addEventListener('click', async (ev) => {
  const chip = ev.target.closest('.digest-chip');
  if (chip) {
    try {
      await navigator.clipboard.writeText(chip.dataset.digest);
      showNotification('Digest copied ✓', 'success');  // your existing toast helper
    } catch {
      showNotification('Could not copy digest', 'error');
    }
    return;
  }

  const copyBtn = ev.target.closest('.copy-entry');
  if (copyBtn) {
    const host = copyBtn.closest('[data-entry-id]');
    const id = host?.dataset.entryId;
    const obj = window.ENTRIES_BY_ID?.get(id);
    if (!obj) { showNotification('Could not find entry data', 'error'); return; }
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      showNotification('Entry JSON copied ✓', 'success');
    } catch {
      showNotification('Could not copy entry', 'error');
    }
    return;
  }
});

// Helper function for location formatting
function formatLocation(entry) {
    if (entry?.locationName) return entry.locationName;
    if (typeof entry?.latitude === 'number' && typeof entry?.longitude === 'number') {
        return `(${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)})`;
    }
    return 'Location not available';
}

// Helper function for downloading receipts
function downloadReceipt(entry) {
    const receipt = {
        id: entry._id || entry.id,
        content: entry.content,
        digest: entry.digest,
        signature: entry.signature,
        createdAt: entry.createdAt,
        location: entry.latitude ? {
            latitude: entry.latitude,
            longitude: entry.longitude,
            locationName: entry.locationName
        } : null
    };
    
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hbuk-receipt-${entry.digest.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
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
    autoReceiptsChk.checked = localStorage.getItem(KEY) === '1';
    autoReceiptsChk.addEventListener('change', () => localStorage.setItem(KEY, autoReceiptsChk.checked ? '1' : '0'));
    
    // Focus editor and support Cmd/Ctrl+Enter to commit
    editor?.focus();
    editor?.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commitButton?.click();
    });
    
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
            
            const textP = document.createElement('div');
            textP.className = 'content';
            textP.innerHTML = marked.parse(entry.content || entry.text || '');
            
            const metaP = document.createElement('div');
            metaP.className = 'badge';
            const date = new Date(entry.createdAt || entry.timestamp);
            const locationString = entry.locationName || 'Location not available';
            metaP.textContent = `Committed on ${date.toLocaleString()} from ${locationString}`;
            
            // Add digest display with copy and verify actions
            if (entry.digest) {
                const short = entry.digest.slice(0, 12);
                const verifyUrl = `verify.html#id=${encodeURIComponent(entry._id)}&digest=${encodeURIComponent(entry.digest)}`;
                
                const badgeDiv = document.createElement('div');
                badgeDiv.className = 'badge';
                badgeDiv.innerHTML = `
                    digest: <code class="dgst">${short}…</code>
                    <button class="btn secondary" data-copy>Copy</button>
                    <a class="btn secondary" href="${verifyUrl}" target="_blank">Verify</a>
                `;
                
                entryDiv.appendChild(badgeDiv);
            }
            
            entryDiv.appendChild(textP);
            entryDiv.appendChild(metaP);
            historyContainer.appendChild(entryDiv);
        }
        
        // Wire up copy buttons after rendering
        document.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const digestElement = btn.parentElement.querySelector('.dgst');
                const d = digestElement?.textContent?.replace('…', '') || '';
                try { 
                    await navigator.clipboard.writeText(d); 
                    showNotification('Digest copied', 'success');
                } catch { 
                    showNotification('Copy failed', 'error'); 
                }
            });
        });
    }

    async function fetchAndRenderEntries() {
        try {
            const data = await apiRequest('/api/entries');
            if (data && Array.isArray(data.entries)) {
                entries = data.entries;
                renderEntries(entries);
            } else {
                entries = [];
                renderEntries([]);
            }
        } catch (error) {
            console.error('Could not fetch entries:', error);
            showNotification('Failed to load entries: ' + error.message, 'error');
            entries = [];
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
                showNotification(`Saved. Digest: ${savedEntry.digest.slice(0,12)}…`, 'success');

                // Download receipt only if auto-receipts is enabled
                const autoReceiptsOn = localStorage.getItem('hbuk:autoReceipts') === '1';
                if (autoReceiptsOn) {
                    downloadReceipt(savedEntry);
                }

                // Add the new entry to our local list
                const newEntry = {
                    content: entryData.content,
                    createdAt: savedEntry.createdAt,
                    digest: savedEntry.digest,
                    signature: savedEntry.signature,
                    // Include location data if it exists
                    ...(entryData.latitude && {
                        latitude: entryData.latitude,
                        longitude: entryData.longitude,
                        locationName: entryData.locationName
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

    // Auto-save local draft
    editor.addEventListener('input', () => {
        localStorage.setItem(localDraftKey, editor.value);
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
        const logoutLink = document.getElementById('logoutLink');
        
        if (token) {
            // User is logged in
            if (logoutLink) {
                logoutLink.textContent = 'Logout';
                logoutLink.href = '#';
                logoutLink.onclick = (e) => {
                    e.preventDefault();
                    localStorage.removeItem('hbuk_token');
                    showNotification('Logged out successfully.', 'success');
                    window.location.reload();
                };
            }
        } else {
            // User is not logged in
            if (logoutLink) {
                logoutLink.textContent = 'Login';
                logoutLink.href = 'login.html';
                logoutLink.onclick = null;
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
        editor.focus();
    }

    initialize();
});
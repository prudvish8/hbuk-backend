// The definitive, correct script.js file for Hbuk

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('editor');
    const commitButton = document.getElementById('commit-button');
    const historyContainer = document.getElementById('history-container');
    const localDraftKey = 'hbuk_local_draft';

    // --- CORE FUNCTIONS ---

    function renderEntries(entries) {
        historyContainer.innerHTML = '';
        for (const entry of entries.slice().reverse()) {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'entry';
            const textP = document.createElement('p');
            textP.className = 'entry-text';
            textP.textContent = entry.text;
            const metaP = document.createElement('p');
            metaP.className = 'entry-meta';
            const date = new Date(entry.timestamp);
            const locationString = entry.locationName || 'Location not available';
            metaP.textContent = `Committed on ${date.toLocaleString()} from ${locationString}`;
            entryDiv.appendChild(textP);
            entryDiv.appendChild(metaP);
            historyContainer.appendChild(entryDiv);
        }
    }

    async function fetchAndRenderEntries() {
        try {
            const entries = await apiRequest('/api/entries');
            if (entries) {
                renderEntries(entries);
            }
        } catch (error) {
            console.error('Could not fetch entries:', error);
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

    // --- REFACTORED: The main entry creation logic ---
    async function createEntry(entryData) {
        try {
            const result = await apiRequest('/api/commit', 'POST', entryData);
            if (result) {
                console.log('Backend response:', result);
                localStorage.removeItem(localDraftKey);
                editor.value = '';
                fetchAndRenderEntries();
            }
        } catch (error) {
            console.error('Error sending entry to backend:', error);
            alert('Could not save entry. Please check if the backend is running.');
        }
    }

    // --- EVENT LISTENERS ---

    // Auto-save local draft
    editor.addEventListener('input', () => {
        localStorage.setItem(localDraftKey, editor.value);
    });

    // Keyboard shortcut: Cmd+Enter or Ctrl+Enter to commit
    editor.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            commitButton.click();
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

        // 4. Build the COMPLETE data package.
        const newEntry = {
            text,
            timestamp,
            location,
            locationName,
        };

        // 5. NOW send the complete package to the createEntry function.
        await createEntry(newEntry);
    });

    // --- AUTHENTICATION UI MANAGEMENT ---
    function updateAuthUI() {
        const token = localStorage.getItem('hbuk_token');
        const loginLink = document.querySelector('.login-link');
        
        if (token) {
            // User is logged in
            if (loginLink) {
                loginLink.textContent = 'Logout';
                loginLink.href = '#';
                loginLink.onclick = (e) => {
                    e.preventDefault();
                    localStorage.removeItem('hbuk_token');
                    alert('Logged out successfully.');
                    window.location.reload();
                };
            }
        } else {
            // User is not logged in
            if (loginLink) {
                loginLink.textContent = 'Login';
                loginLink.href = 'login.html';
                loginLink.onclick = null;
            }
        }
    }

    // --- INITIAL PAGE LOAD LOGIC ---
    function initialize() {
        updateAuthUI();
        const token = localStorage.getItem('hbuk_token');
        if (token) {
            fetchAndRenderEntries();
        }
        const localDraft = localStorage.getItem(localDraftKey);
        if (localDraft) {
            editor.value = localDraft;
        }
        editor.focus();
    }

    initialize();
});
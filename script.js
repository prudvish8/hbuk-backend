// The definitive, correct script.js file for Hbuk

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('editor');
    const commitButton = document.getElementById('commit-button');
    const historyContainer = document.getElementById('history-container');
    const localDraftKey = 'hbuk_local_draft';
    
    // Global entries array to store all entries
    let entries = [];

    // --- CORE FUNCTIONS ---

    function renderEntries(entries) {
        historyContainer.innerHTML = '';
        for (const entry of entries.slice().reverse()) {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'entry';
            const textP = document.createElement('p');
            textP.className = 'entry-text';
            textP.innerHTML = marked.parse(entry.text);
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
            entries = await apiRequest('/api/entries');
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
            // Send the new entry to the backend to be saved
            const savedEntry = await apiRequest('/api/commit', {
                method: 'POST',
                body: JSON.stringify(entryData)
            });

            if (savedEntry) {
                console.log('Backend response:', savedEntry);

                // --- THIS IS THE CRITICAL FIX ---
                // Instead of re-fetching the whole list, we will manually
                // add the newly saved entry to our existing local list.

                // 1. Get the current list of entries from the page's memory
                // (We need to define 'entries' at the top level of our script)
                entries.push(savedEntry.entry);

                // 2. Re-render the history with the updated list
                renderEntries(entries);

                // 3. Clear the editor and the local draft
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

            // 4. Build the COMPLETE data package.
            const newEntry = {
                text,
                timestamp,
                location,
                locationName,
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
                    showNotification('Logged out successfully.', 'success');
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
// Shared API utility functions for Hbuk application

// The definitive, environment-aware API configuration
let baseURL;

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
    // We are in a local development environment
    baseURL = 'http://localhost:3000';
    console.log('Running in development mode. API endpoint: ' + baseURL);
} else {
    // We are in the live production environment
    baseURL = 'https://hbuk-backend-hvow.onrender.com';
    console.log('Running in production mode. API endpoint: ' + baseURL);
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('hbuk_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(baseURL + endpoint, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
        });

        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const data = await response.json();
                if (data && data.message) {
                    errorMsg = data.message; // Use the specific message from the backend
                }
            } catch (e) {
                // Ignore JSON parsing errors if the response body is not JSON
            }
            throw new Error(errorMsg);
        }

        return response.json();

    } catch (error) {
        console.error('API request failed:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            // Token is invalid or expired - logout immediately
            localStorage.removeItem('hbuk_token');
            showNotification('Session expired. Please log in again.', 'error');
            window.location.href = 'login.html';
            return null;
        }
        throw error; // Re-throw the error to be caught by the calling function
    }
}

// Notification system function
function showNotification(message, type = 'info') {
    const notificationBar = document.getElementById('notification-bar');
    if (!notificationBar) return;
    
    // Clear any existing classes and content
    notificationBar.className = '';
    notificationBar.textContent = '';
    
    // Set the message and type
    notificationBar.textContent = message;
    notificationBar.classList.add(type);
    
    // Show the notification
    notificationBar.classList.add('show');
    
    // Hide after 4 seconds
    setTimeout(() => {
        notificationBar.classList.add('fade-out');
        setTimeout(() => {
            notificationBar.classList.remove('show', 'fade-out', type);
        }, 500);
    }, 4000);
} 
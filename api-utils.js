// Shared API utility functions for Hbuk application

// Smart API request wrapper with authentication handling
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        // Get token from localStorage
        const token = localStorage.getItem('hbuk_token');
        
        // Prepare request headers
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add Authorization header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Prepare request options
        const options = {
            method: method,
            headers: headers
        };
        
        // Add body if provided
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        // Make the fetch request
        const response = await fetch(`https://hbuk-backend-hvow.onrender.com${endpoint}`, options);
        
        // Check for authentication errors
        if (response.status === 401 || response.status === 403) {
            // Token is invalid or expired - logout immediately
            localStorage.removeItem('hbuk_token');
            showNotification('Session expired. Please log in again.', 'error');
            window.location.href = 'login.html';
            return null;
        }
        
        // Check for other errors
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Return JSON data for successful responses
        return await response.json();
        
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
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
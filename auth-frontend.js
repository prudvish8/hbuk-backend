// Hbuk Authentication Script
// Handles registration and login forms

document.addEventListener('DOMContentLoaded', () => {
    // Registration Form Handler
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Get the submit button and disable it
            const submitButton = registerForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Loading...';
            
            try {
                const data = await apiRequest('/api/register', 'POST', { email, password });
                
                if (data) {
                    showNotification('Registration successful! Please log in.', 'success');
                    window.location.href = 'login.html';
                }
            } catch (error) {
                console.error('Registration error:', error);
                showNotification('Registration failed. Please check your connection and try again.', 'error');
            } finally {
                // Re-enable the button and restore original text
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }
    
    // Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Get the submit button and disable it
            const submitButton = loginForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Loading...';
            
            try {
                const data = await apiRequest('/api/login', 'POST', { email, password });
                
                if (data && data.token) {
                    // Save the JWT token to localStorage
                    localStorage.setItem('hbuk_token', data.token);
                    showNotification('Login successful! Welcome to Hbuk.', 'success');
                    window.location.href = 'index.html';
                }
            } catch (error) {
                console.error('Login error:', error);
                showNotification('Login failed. Please check your connection and try again.', 'error');
            } finally {
                // Re-enable the button and restore original text
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }
}); 
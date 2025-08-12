// Hbuk Authentication Script
// Handles registration and login forms

document.addEventListener('DOMContentLoaded', () => {
    // Registration Form Handler
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Loading...';

            const email = e.target.email.value;
            const password = e.target.password.value;

            try {
                await apiRequest('/api/register', {
                    method: 'POST',
                    body: JSON.stringify({ email, password }),
                });
                showNotification('Registration successful! Please log in.', 'success');
                setTimeout(() => window.location.href = 'login.html', 2000);
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                button.disabled = false;
                button.textContent = 'Register';
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
                // Display the specific error message from the server
                const errorMessage = error.message || 'Login failed. Please check your connection and try again.';
                showNotification(errorMessage, 'error');
            } finally {
                // Re-enable the button and restore original text
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }
}); 
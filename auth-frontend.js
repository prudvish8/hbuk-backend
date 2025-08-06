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
            
            try {
                const data = await apiRequest('/api/register', 'POST', { email, password });
                
                if (data) {
                    alert('Registration successful! Please log in.');
                    window.location.href = 'login.html';
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('Registration failed. Please check your connection and try again.');
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
            
            try {
                const data = await apiRequest('/api/login', 'POST', { email, password });
                
                if (data && data.token) {
                    // Save the JWT token to localStorage
                    localStorage.setItem('hbuk_token', data.token);
                    alert('Login successful! Welcome to Hbuk.');
                    window.location.href = 'index.html';
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed. Please check your connection and try again.');
            }
        });
    }
}); 
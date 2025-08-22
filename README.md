# hbuk.xyz

A personal journaling application with location awareness and focus mode.

## Features

- 📝 Simple text journaling
- 📍 Location-aware entries
- 🎯 Focus mode for distraction-free writing
- 📊 Export to JSON and PDF
- 🔐 Secure authentication

## Development

```bash
# Install dependencies
npm ci

# Start development server
npm run dev

# Run tests
npm test

# Run UI tests with browser
npm run test:ui

# Run smoke tests only
npm run test:smoke

# Serve static files for testing
npm run serve
```

## Testing

The application includes comprehensive testing:

- **Unit tests**: Core functionality validation
- **E2E tests**: Playwright-based user journey testing
- **Smoke tests**: Critical UI element verification
- **Location tests**: Geolocation and formatting validation

## Pre-Merge Checklist (UI Safety)

**🚨 CRITICAL: Prevent "Static Page" Issues**

Before merging any PR, ensure these checks pass:

- [ ] Page loads with **Commit ↵** button visible
- [ ] Typing in editor updates word count
- [ ] Focus toggles on/off (Esc exits)
- [ ] `index.html` includes:
  - [ ] **HBUK COMMIT ROW** block with `#commitBtn`
  - [ ] **HBUK APP SCRIPTS** module tags for `api-utils.js` and `script.js`
- [ ] CI "UI Smoke Tests" ✅
- [ ] Local smoke test passes: `npm run test:smoke`

## Deployment

- **Frontend**: Netlify (automatic from main branch)
- **Backend**: Render (automatic from main branch)
- **Database**: MongoDB Atlas

## Contributing

1. Create a feature branch
2. Make your changes
3. **Run smoke tests**: `npm run test:smoke`
4. Ensure CI passes
5. Create PR to main
6. **Verify pre-merge checklist** ✅
7. Merge with confidence

## Architecture

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Testing**: Playwright for E2E, Jest for unit tests
- **CI/CD**: GitHub Actions with automated testing

# PR Success Checklist

Use this checklist for every PR to ensure quality and prevent regressions.

## 🚨 Pre-Merge Requirements

### ✅ CI Checks
- [ ] **ui-smoke** (GitHub Actions) ✅ - All smoke tests pass
- [ ] **required-files** ✅ - Import sanity check passes  
- [ ] **smoke** ✅ - Backend smoke test passes
- [ ] All other CI workflows green

### ✅ Deploy Preview Verification
- [ ] **Deploy Preview loads** - Netlify preview builds successfully
- [ ] **Commit button visible & works** - Button appears and is clickable
- [ ] **Word count increments & resets on commit** - Live text counting
- [ ] **Focus mode toggles; Esc exits** - Clean focus/unfocus behavior
- [ ] **Export buttons functional** - JSON and PDF export work
- [ ] **No console errors** - Check browser DevTools

### ✅ Code Structure Verification
- [ ] **Guard comments still present** in `index.html`:
  - `<!-- HBUK CRITICAL: Commit row with button - DO NOT REMOVE -->`
  - `<!-- HBUK CRITICAL: Module scripts - DO NOT REMOVE -->`
- [ ] **Critical elements exist** in HTML:
  - `id="editor"`, `id="commitBtn"`, `id="wordCount"`, `id="entries"`
  - `src="api-utils.js"`, `src="script.js"`
- [ ] **Title shows "hbuk journal"** - Correct page title

### ✅ Local Testing
- [ ] **Local smoke test passes**: `npm run test:smoke`
- [ ] **Interactive tests pass**: `npm run test:interactive` 
- [ ] **Full test suite**: `npm run test:all`

## 🔧 Quick Test Commands

```bash
# Run all smoke tests
npm run test:all

# Run only structure verification
npm run test:smoke

# Run only interactive functionality  
npm run test:interactive

# Start dev server for manual testing
npm run serve
```

## 🚀 Merge Process

1. **All CI checks green** ✅
2. **Deploy Preview verified** ✅
3. **Local tests pass** ✅
4. **Code review approved** ✅
5. **Squash & merge** ✅

## 🆘 If Tests Fail

### Static Page Issue (Missing Elements)
- Check `index.html` for missing commit row or script tags
- Verify protective comments are present
- Re-run conflict resolution following guard comments

### Functional Issue (JavaScript Broken)
- Check browser console for errors
- Verify module scripts are loading
- Test focus mode and word count manually

### CI Issue (Workflow Failure)
- Check GitHub Actions logs
- Verify all required files present
- Re-run failed workflows if transient

## 📋 Success Criteria

✅ **Structure**: Critical HTML elements present  
✅ **Function**: Interactive features working  
✅ **Quality**: No console errors or broken behavior  
✅ **CI**: All automated checks passing  
✅ **Preview**: Deploy preview loads and works correctly  

**Remember**: It's better to catch issues in PR review than after merge to main!

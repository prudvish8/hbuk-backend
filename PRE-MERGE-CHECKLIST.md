# Pre-Merge Checklist for hbuk.xyz

## 🚨 CRITICAL: Prevent "Static Page" Issues

This checklist prevents the exact issue we just experienced where HTML looks fine but JavaScript is dead.

## ✅ Before Any Merge - Run These Checks

### 1. Smoke Test Must Pass
```bash
npm test
```
**Required**: All Playwright tests pass, especially the smoke test that verifies:
- `#commitBtn` exists and is visible
- `#editor` updates `#wordCount` 
- Focus mode toggle works
- No console errors

### 2. Critical DOM Elements Must Exist
Verify these elements are present in `index.html`:
- ✅ `<button id="commitBtn" class="commit">Commit ↵</button>`
- ✅ `<textarea id="editor" placeholder="Begin...">`
- ✅ `<div id="wordCount">0 words</div>`
- ✅ `<section id="entries"></section>`
- ✅ `<button id="focusToggle">Focus</button>`

### 3. Module Scripts Must Be Loaded
**CRITICAL**: These script tags must be present at the end of `<body>`:
```html
<!-- HBUK CRITICAL: Module scripts - DO NOT REMOVE -->
<script>window.API_BASE='https://hbuk-backend-hvow.onrender.com';</script>
<script type="module" src="api-utils.js"></script>
<script type="module" src="script.js"></script>
```

### 4. Netlify Preview Must Be Green
- ✅ Deploy Preview builds successfully
- ✅ No build errors
- ✅ Page loads without console errors
- ✅ Commit button is clickable
- ✅ Focus mode works

## 🔍 Conflict Resolution Rules

When resolving merge conflicts in `index.html`:

### NEVER Remove:
- The commit row (`<div class="commitRow">`)
- Module script tags
- Critical element IDs

### ALWAYS Verify After Resolution:
- Run `npm test` locally
- Check that `#commitBtn` exists
- Ensure both module scripts are present

### Use "Ours" vs "Theirs" Carefully:
- If conflict touches `<head>` or commit row → **verify critical elements still exist**
- If conflict touches scripts → **ensure both module scripts remain**

## 🚀 Merge Process

1. **Run smoke test**: `npm test` ✅
2. **Verify critical elements** in `index.html` ✅  
3. **Check Netlify preview** is green ✅
4. **Resolve any conflicts** following rules above ✅
5. **Re-run smoke test** after conflict resolution ✅
6. **Squash & merge** ✅

## 🆘 If Something Breaks

**Immediate action**: Revert the merge and restore from the last known good state.

**Investigation**:
1. Check if critical elements were removed
2. Verify module scripts are present
3. Run smoke test to confirm functionality
4. Fix the issue before re-merging

---

**Remember**: A page that "looks fine" but has no JavaScript is worse than a page that fails to build. Always verify interactivity before merging!

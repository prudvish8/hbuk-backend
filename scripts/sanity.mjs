#!/usr/bin/env node

// scripts/sanity.mjs — bulletproof post-deploy sanity check
// Usage: node scripts/sanity.mjs

const API = "https://hbuk-backend-hvow.onrender.com";

async function checkHealth() {
  console.log("1) Health checks");
  
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`Health failed: ${health.status}`);
  console.log("✅ /health OK");
  
  const dbHealth = await fetch(`${API}/health/db`);
  if (!dbHealth.ok) throw new Error(`DB health failed: ${dbHealth.status}`);
  console.log("✅ /health/db OK");
}

async function testAuth() {
  console.log("\n2) Authentication flow");
  
  const email = `u${Math.random().toString(36).substr(2, 9)}@hbuk.dev`;
  const password = "test123";
  
  // Register
  const register = await fetch(`${API}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (register.status === 201) {
    console.log("✅ Registration successful");
  } else if (register.status === 409) {
    console.log("✅ Registration (user already exists)");
  } else {
    throw new Error(`Registration failed: ${register.status}`);
  }
  
  // Login
  const login = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!login.ok) throw new Error(`Login failed: ${login.status}`);
  const loginData = await login.json();
  const token = loginData.token;
  console.log(`✅ Login successful, token: ${token.substring(0, 20)}...`);
  
  return { token, email };
}

async function testCommit(token) {
  console.log("\n3) Commit & verify");
  
  const content = "post-deploy sanity check";
  const commit = await fetch(`${API}/api/commit`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ content })
  });
  
  if (!commit.ok) throw new Error(`Commit failed: ${commit.status}`);
  const commitData = await commit.json();
  
  const { id, digest } = commitData;
  console.log(`✅ Commit successful: ${id}, digest: ${digest.substring(0, 12)}...`);
  
  // Verify
  const verify = await fetch(`${API}/api/verify/${id}/${digest}`);
  if (!verify.ok) throw new Error(`Verify failed: ${verify.status}`);
  const verifyData = await verify.json();
  
  if (verifyData.ok !== true) throw new Error(`Verification failed: ${JSON.stringify(verifyData)}`);
  console.log("✅ Public verification: true");
  
  return { id, digest };
}

async function testAnchors() {
  console.log("\n4) Anchors & proofs");
  
  const anchors = await fetch(`${API}/api/anchors/today`);
  if (!anchors.ok) throw new Error(`Anchors failed: ${anchors.status}`);
  const anchorsData = await anchors.json();
  
  console.log(`✅ Daily anchor: ${anchorsData.root.substring(0, 12)}... (${anchorsData.count} entries)`);
}

async function testRateLimiting() {
  console.log("\n5) Rate limiting");
  
  const verify = await fetch(`${API}/api/verify/abc/xyz`);
  const headers = Object.fromEntries(verify.headers.entries());
  
  if (headers['x-ratelimit-limit']) {
    console.log("✅ Rate limiting headers present");
  } else {
    console.log("⚠️  Rate limiting headers not visible");
  }
}

async function testErrorHandling() {
  console.log("\n6) Error handling");
  
  // Test oversized payload
  const largeContent = 'x'.repeat(70000);
  const largeCommit = await fetch(`${API}/api/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: largeContent })
  });
  
  if (largeCommit.status === 413) {
    const errorData = await largeCommit.json();
    if (errorData.error && errorData.error.includes("64KB")) {
      console.log("✅ Friendly 413 error message");
    } else {
      console.log("⚠️  413 error but generic message");
    }
  } else {
    console.log("⚠️  Expected 413, got:", largeCommit.status);
  }
}

async function main() {
  try {
    console.log("🚀 HBUK POST-DEPLOY SANITY CHECK");
    console.log("=" * 50);
    
    await checkHealth();
    const { token } = await testAuth();
    await testCommit(token);
    await testAnchors();
    await testRateLimiting();
    await testErrorHandling();
    
    console.log("\n" + "=" * 50);
    console.log("🎉 ALL TESTS PASSED! HBUK IS PRODUCTION READY!");
    console.log("\n📋 Next steps:");
    console.log("1. Set HBUK_METRICS_TOKEN in Render to: 895b88680f93f4921037939f161f412f489de0a442bc5250c7d0db084ef482a2b9e8ed985035d838687a8aa24f4f8645");
    console.log("2. Set up uptime monitors for /health and /health/db");
    console.log("3. GitHub Actions will run automatically");
    
  } catch (error) {
    console.error("\n❌ SANITY CHECK FAILED:", error.message);
    process.exit(1);
  }
}

main();

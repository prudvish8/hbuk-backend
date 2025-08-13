#!/usr/bin/env node

// scripts/test-metrics.mjs — test metrics endpoint access
// Usage: node scripts/test-metrics.mjs
// Fixed NaN output issue - now uses proper string repetition

const API = "https://hbuk-backend-hvow.onrender.com";

async function testMetricsAccess() {
  console.log("🔍 Testing Metrics Endpoint Access");
  console.log("=".repeat(50));
  
  // Test 1: Unauthorized access (should be 403)
  console.log("1. Testing unauthorized access...");
  try {
    const unauth = await fetch(`${API}/metrics`);
    if (unauth.status === 403) {
      console.log("✅ Unauthorized access properly blocked (403)");
    } else {
      console.log(`⚠️  Expected 403, got ${unauth.status}`);
    }
  } catch (e) {
    console.log("✅ Unauthorized access blocked");
  }
  
  // Test 2: Check if token is provided via environment
  const token = process.env.HBUK_METRICS_TOKEN;
  if (!token) {
    console.log("\n2. Testing with token...");
    console.log("❌ HBUK_METRICS_TOKEN not set in environment");
    console.log("\n📋 To test with token:");
    console.log("1. Set your token: export HBUK_METRICS_TOKEN='your-token-here'");
    console.log("2. Run: node scripts/test-metrics.mjs");
    console.log("\nOr test manually:");
    console.log(`curl -H "X-Metrics-Token: YOUR_TOKEN" "${API}/metrics"`);
    return;
  }
  
  console.log("\n2. Testing with token...");
  console.log(`Token: ${token.substring(0, 20)}...`);
  
  // Test 3: Header-based authentication
  console.log("\n3. Testing header-based authentication...");
  try {
    const headerAuth = await fetch(`${API}/metrics`, {
      headers: { 'X-Metrics-Token': token }
    });
    if (headerAuth.ok) {
      const data = await headerAuth.text();
      console.log("✅ Header auth successful (200)");
      console.log("📊 Metrics data preview:");
      console.log(data.split('\n').slice(0, 5).join('\n'));
    } else {
      console.log(`❌ Header auth failed: ${headerAuth.status}`);
    }
  } catch (e) {
    console.log("❌ Header auth error:", e.message);
  }
  
  // Test 4: Query-based authentication
  console.log("\n4. Testing query-based authentication...");
  try {
    const queryAuth = await fetch(`${API}/metrics?token=${token}`);
    if (queryAuth.ok) {
      const data = await queryAuth.text();
      console.log("✅ Query auth successful (200)");
      console.log("📊 Metrics data preview:");
      console.log(data.split('\n').slice(0, 5).join('\n'));
    } else {
      console.log(`❌ Query auth failed: ${queryAuth.status}`);
    }
  } catch (e) {
    console.log("❌ Query auth error:", e.message);
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("📋 Next steps:");
  console.log("1. If both auth methods work, your token is correct");
  console.log("2. Set the same token in GitHub repository secrets");
  console.log("3. Re-run the GitHub Actions workflow");
}

testMetricsAccess().catch(console.error);

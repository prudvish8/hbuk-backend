#!/usr/bin/env node

// scripts/verify-metrics.mjs — verify metrics endpoint with new token
// Usage: node scripts/verify-metrics.mjs

const API = "https://hbuk-backend-hvow.onrender.com";

async function testMetrics() {
  console.log("🔍 Testing Metrics Endpoint Access");
  console.log("=" * 50);
  
  // Test unauthorized access (should be 403)
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
  
  // Test with header token
  console.log("\n2. Testing header-based authentication...");
  const headerToken = process.env.HBUK_METRICS_TOKEN;
  if (headerToken) {
    try {
      const headerAuth = await fetch(`${API}/metrics`, {
        headers: { 'X-Metrics-Token': headerToken }
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
  } else {
    console.log("⚠️  HBUK_METRICS_TOKEN not set in environment");
  }
  
  // Test with query token
  console.log("\n3. Testing query-based authentication...");
  if (headerToken) {
    try {
      const queryAuth = await fetch(`${API}/metrics?token=${headerToken}`);
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
  }
  
  console.log("\n" + "=" * 50);
  console.log("📋 Next steps:");
  console.log("1. Set HBUK_METRICS_TOKEN in Render environment");
  console.log("2. Set HBUK_METRICS_TOKEN in GitHub repository secrets");
  console.log("3. Run: npm run sanity");
}

testMetrics().catch(console.error);

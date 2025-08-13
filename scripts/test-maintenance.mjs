#!/usr/bin/env node

// scripts/test-maintenance.mjs — test maintenance switch functionality
// Usage: node scripts/test-maintenance.mjs

const API = "https://hbuk-backend-hvow.onrender.com";

async function testMaintenanceSwitch() {
  console.log("🔧 Testing Maintenance Switch Functionality");
  console.log("=" * 50);
  
  // Test current status (should be normal operation)
  console.log("1. Testing current production status...");
  try {
    const health = await fetch(`${API}/health`);
    if (health.ok) {
      console.log("✅ Normal operation: /health returns 200");
    } else {
      console.log(`⚠️  Unexpected status: ${health.status}`);
    }
  } catch (e) {
    console.log("❌ Health check failed:", e.message);
  }
  
  // Test API endpoint (should work normally)
  console.log("\n2. Testing API endpoint access...");
  try {
    const anchors = await fetch(`${API}/api/anchors/today`);
    if (anchors.ok) {
      console.log("✅ API access normal: /api/anchors/today returns 200");
    } else if (anchors.status === 503) {
      console.log("⚠️  API in maintenance mode (503)");
    } else {
      console.log(`⚠️  Unexpected API status: ${anchors.status}`);
    }
  } catch (e) {
    console.log("❌ API test failed:", e.message);
  }
  
  console.log("\n" + "=" * 50);
  console.log("📋 Maintenance Switch Instructions:");
  console.log("");
  console.log("🔴 To ENABLE maintenance mode:");
  console.log("1. Go to Render → Environment");
  console.log("2. Set HBUK_MAINTENANCE=1");
  console.log("3. Click 'Save, rebuild, and deploy'");
  console.log("4. Most API routes will return 503");
  console.log("");
  console.log("🟢 To DISABLE maintenance mode:");
  console.log("1. Go to Render → Environment");
  console.log("2. Set HBUK_MAINTENANCE=0 (or remove the variable)");
  console.log("3. Click 'Save, rebuild, and deploy'");
  console.log("4. API returns to normal operation");
  console.log("");
  console.log("🧪 Test maintenance mode:");
  console.log("curl -i https://hbuk-backend-hvow.onrender.com/api/anchors/today");
  console.log("Expected: 503 when enabled, 200 when disabled");
}

testMaintenanceSwitch().catch(console.error);

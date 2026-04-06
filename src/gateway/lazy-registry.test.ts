// Simple smoke test for the lazy registry
import { lazyRegistry } from "./lazy-registry.js";

async function test() {
  console.log("=== Lazy Registry Smoke Test ===");

  // Test 1: Register and get a module
  lazyRegistry.reset();
  lazyRegistry.register("test", async () => {
    await new Promise(r => setTimeout(r, 100));
    return { value: 42 };
  });

  const result = await lazyRegistry.get<{ value: number }>("test");
  console.log("Test 1 - Register & Get:", result.value === 42 ? "PASS" : "FAIL");

  // Test 2: Concurrent get
  lazyRegistry.reset();
  let initCount = 0;
  lazyRegistry.register("concurrent", async () => {
    initCount++;
    await new Promise(r => setTimeout(r, 200));
    return { count: initCount };
  });

  const [r1, r2, r3] = await Promise.all([
    lazyRegistry.get("concurrent"),
    lazyRegistry.get("concurrent"),
    lazyRegistry.get("concurrent"),
  ]);
  console.log("Test 2 - Concurrent (init once):", initCount === 1 ? "PASS" : "FAIL");
  console.log("Test 2 - All get same result:", r1 === r2 && r2 === r3 ? "PASS" : "FAIL");

  // Test 3: isReady
  console.log("Test 3 - isReady:", lazyRegistry.isReady("concurrent") ? "PASS" : "FAIL");

  // Test 4: listModules
  console.log("Test 4 - listModules:", lazyRegistry.listModules().length >= 1 ? "PASS" : "FAIL");

  // Test 5: getStatus
  const status = lazyRegistry.getStatus();
  console.log("Test 5 - getStatus:", status.length >= 1 ? "PASS" : "FAIL");

  // Test 6: Retry on failed module
  lazyRegistry.reset();
  let failAttempts = 0;
  lazyRegistry.register("flaky", async () => {
    failAttempts++;
    if (failAttempts === 1) throw new Error("first fail");
    return { ok: true };
  });

  try {
    await lazyRegistry.get("flaky");
    console.log("Test 6 - Expected error:", "FAIL (should have thrown)");
  } catch {
    console.log("Test 6 - First attempt failed as expected:", "PASS");
  }

  const recovered = await lazyRegistry.get("flaky");
  console.log("Test 6 - Retry succeeded:", recovered.ok === true ? "PASS" : "FAIL");

  // Test 7: Unknown module
  try {
    await lazyRegistry.get("nonexistent");
    console.log("Test 7 - Unknown module error:", "FAIL");
  } catch {
    console.log("Test 7 - Unknown module throws:", "PASS");
  }

  // Test 8: prefetch
  lazyRegistry.reset();
  let prefetchCalled = false;
  lazyRegistry.register("prefetch-test", async () => {
    prefetchCalled = true;
    await new Promise(r => setTimeout(r, 50));
    return { preloaded: true };
  });

  lazyRegistry.prefetch("prefetch-test");
  // Give it a moment to start
  await new Promise(r => setTimeout(r, 100));
  const prefetched = await lazyRegistry.get("prefetch-test");
  console.log("Test 8 - Prefetch loaded:", prefetched.preloaded === true ? "PASS" : "FAIL");

  console.log("=== All Tests Complete ===");
  lazyRegistry.reset();
}

test().catch(console.error);

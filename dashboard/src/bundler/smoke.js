/**
 * Smoke test: build a widget for a sample client config and verify the output.
 * Run: node dashboard/src/bundler/smoke.js
 */
const fs = require("fs");
const path = require("path");
const { buildWidget } = require("./index");

async function main() {
  const clientConfig = {
    id: "client-x",
    name: "Client X Presale",
    chainId: "11155111",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    process: [
      {
        moduleId: "permit2",
        config: {
          permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
          token: "0x7a1E4d7b8a3c9F2e1D6A5b4C3f2E1d0a9B8c7D6e",
          spender: "0x1234...presaleContract",
          amount: "1000000000000000000"
        }
      },
      {
        moduleId: "sessionKey",
        config: {
          delegateAddress: "0xSessionDelegate...",
          sessionKey: "0xSessionEOA...",
          token: "0x0000000000000000000000000000000000000000",
          target: "0x0000000000000000000000000000000000000000",
          selector: "0x00000000",
          maxSpend: "0",
          expirySeconds: "3600"
        }
      },
      {
        moduleId: "multicall",
        config: {
          multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11"
        }
      }
    ]
  };

  const result = await buildWidget(clientConfig);
  console.log("✓ Built widget");
  console.log("  path:", result.outPath);
  console.log("  size:", (result.size / 1024).toFixed(1), "KB");
  console.log("  modules:", result.modules.join(", "));

  const content = fs.readFileSync(result.outPath, "utf8");
  const checks = [
    ["contains client id", content.includes("Client X Presale")],
    ["contains sessionKey runtime", content.includes("grantSession") || content.includes("SessionGrant")],
    ["contains permit2 runtime", content.includes("Permit2")],
    ["contains multicall runtime", content.includes("aggregate3")],
    ["is ESM bundle", content.includes("ComposerWidget")],
    ["externalizes ethers+reown", content.includes("from\"ethers\"") || content.includes("from \"ethers\"")]
  ];

  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "✓" : "✗"} ${label}`);
    if (!pass) ok = false;
  }
  if (!ok) {
    console.error("Smoke checks failed");
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

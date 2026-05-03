/**
 * Mock Attester Service — POST /attest
 *
 * Encrypts compliance attributes for (registry, user), computes the handle
 * digest, signs an EIP-712 Attestation, and returns everything the client
 * needs to call AttestRailRegistry.submitProfile.
 *
 * Usage:
 *   ATTESTER_PRIVATE_KEY=0x... REGISTRY_ADDRESS=0x... CHAIN_ID=31337 \
 *   RPC_URL=http://localhost:8545 npx ts-node attester/service.ts
 */

import http from "node:http";
import crypto from "node:crypto";
import { ethers } from "ethers";

// ── Config ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3001", 10);
const ATTESTER_PRIVATE_KEY = process.env.ATTESTER_PRIVATE_KEY;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "31337", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

if (!ATTESTER_PRIVATE_KEY) throw new Error("ATTESTER_PRIVATE_KEY is required");
if (!REGISTRY_ADDRESS) throw new Error("REGISTRY_ADDRESS is required");

const attesterWallet = new ethers.Wallet(ATTESTER_PRIVATE_KEY);

// ── EIP-712 ─────────────────────────────────────────────────────────────
const EIP712_DOMAIN = {
  name: "AttestRail",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: REGISTRY_ADDRESS,
};

const ATTESTATION_TYPES = {
  Attestation: [
    { name: "user", type: "address" },
    { name: "handlesDigest", type: "bytes32" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
};

// ── Request / Response types ────────────────────────────────────────────
interface AttestRequest {
  user: string;
  attributes: {
    kycVerified: boolean;
    jurisdictionAllowed: boolean;
    sanctionsFlag: boolean;
    riskTier: number;
    currentExposure: number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────
function generateNonce(): bigint {
  return BigInt("0x" + crypto.randomBytes(32).toString("hex"));
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ── Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/attest") {
    try {
      const body = JSON.parse(await readBody(req)) as AttestRequest;

      if (!body.user || !ethers.isAddress(body.user)) {
        jsonResponse(res, 400, { error: "Invalid or missing user address" });
        return;
      }
      const a = body.attributes;
      if (
        a === undefined ||
        typeof a.kycVerified !== "boolean" ||
        typeof a.jurisdictionAllowed !== "boolean" ||
        typeof a.sanctionsFlag !== "boolean" ||
        typeof a.riskTier !== "number" ||
        a.riskTier < 0 ||
        a.riskTier > 255 ||
        typeof a.currentExposure !== "number" ||
        a.currentExposure < 0
      ) {
        jsonResponse(res, 400, { error: "Invalid or missing attributes" });
        return;
      }

      const nonce = generateNonce();
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      // In the demo flow the frontend sends pre-computed handles + digest.
      // If handles are provided, sign them directly.
      const reqBody = body as AttestRequest & { handlesDigest?: string };
      let handlesDigest: string;

      if (reqBody.handlesDigest && typeof reqBody.handlesDigest === "string") {
        handlesDigest = reqBody.handlesDigest;
      } else {
        // No handles provided — return attributes + nonce + expiry so the
        // frontend can encrypt, compute digest, and call /sign separately.
        jsonResponse(res, 200, {
          mode: "encrypt-first",
          message: "Encrypt attributes client-side, then POST to /sign with handlesDigest",
          attributes: a,
          nonce: nonce.toString(),
          expiry,
          attester: attesterWallet.address,
        });
        return;
      }

      const attestation = {
        user: body.user,
        handlesDigest,
        expiry,
        nonce,
      };

      const signature = await attesterWallet.signTypedData(EIP712_DOMAIN, ATTESTATION_TYPES, attestation);

      console.log(`[attest] user=${body.user} nonce=${nonce}`);

      jsonResponse(res, 200, {
        attestation: {
          user: attestation.user,
          handlesDigest: attestation.handlesDigest,
          expiry: attestation.expiry,
          nonce: attestation.nonce.toString(),
        },
        signature,
        attester: attesterWallet.address,
      });
    } catch (err) {
      console.error("[attest] error:", (err as Error).message);
      jsonResponse(res, 500, { error: "Internal server error" });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/sign") {
    try {
      const body = JSON.parse(await readBody(req));

      if (!body.user || !ethers.isAddress(body.user)) {
        jsonResponse(res, 400, { error: "Invalid or missing user address" });
        return;
      }
      if (!body.handlesDigest || typeof body.handlesDigest !== "string") {
        jsonResponse(res, 400, { error: "Missing handlesDigest" });
        return;
      }

      const nonce = body.nonce ? BigInt(body.nonce) : generateNonce();
      const expiry = body.expiry || Math.floor(Date.now() / 1000) + 3600;

      const attestation = {
        user: body.user,
        handlesDigest: body.handlesDigest,
        expiry,
        nonce,
      };

      const signature = await attesterWallet.signTypedData(EIP712_DOMAIN, ATTESTATION_TYPES, attestation);

      console.log(`[sign] user=${body.user} nonce=${nonce}`);

      jsonResponse(res, 200, {
        attestation: {
          user: attestation.user,
          handlesDigest: attestation.handlesDigest,
          expiry: attestation.expiry,
          nonce: attestation.nonce.toString(),
        },
        signature,
        attester: attesterWallet.address,
      });
    } catch (err) {
      console.error("[sign] error:", (err as Error).message);
      jsonResponse(res, 500, { error: "Internal server error" });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    jsonResponse(res, 200, { status: "ok", attester: attesterWallet.address });
    return;
  }

  jsonResponse(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Mock attester listening on :${PORT}`);
  console.log(`  attester address: ${attesterWallet.address}`);
  console.log(`  registry:         ${REGISTRY_ADDRESS}`);
  console.log(`  chainId:          ${CHAIN_ID}`);
});

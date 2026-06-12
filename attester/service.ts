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
const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const GATE_ADDRESS = process.env.GATE_ADDRESS || "0x803Fc2767028b2fA9B117BE802F1333818D9929d";

// Comma-separated allowlist. The Access-Control-Allow-Origin header takes a
// single value, so we reflect the request Origin against this list.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!ATTESTER_PRIVATE_KEY) throw new Error("ATTESTER_PRIVATE_KEY is required");
if (!REGISTRY_ADDRESS) throw new Error("REGISTRY_ADDRESS is required");

const attesterWallet = new ethers.Wallet(ATTESTER_PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider(RPC_URL);

const GATE_ABI = [
  "function getCheck(bytes32) view returns (address user, uint256 policyId, address to, uint64 amount, bytes32 encryptedEligible, uint8 status, bool consumed, bool exists)",
];

// Relayer SDK is loaded lazily: it fetches KMS keys on init, and the signing
// endpoints must keep working even if the relayer is unreachable.
type RelayerInstance = {
  publicDecrypt: (handles: string[]) => Promise<{ clearValues: Record<string, unknown> }>;
};
let relayerPromise: Promise<RelayerInstance> | null = null;
function getRelayer(): Promise<RelayerInstance> {
  if (!relayerPromise) {
    relayerPromise = (async () => {
      const { createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/node");
      return (await createInstance({ ...SepoliaConfig, network: RPC_URL })) as unknown as RelayerInstance;
    })();
    relayerPromise.catch(() => {
      relayerPromise = null;
    });
  }
  return relayerPromise;
}

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

function corsOrigin(req: http.IncomingMessage): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || "*";
}

function corsHeaders(req: http.IncomingMessage): Record<string, string> {
  const origin = corsOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin !== "*") headers["Vary"] = "Origin";
  return headers;
}

function jsonResponse(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(req) });
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
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/attest") {
    try {
      const body = JSON.parse(await readBody(req)) as AttestRequest;

      if (!body.user || !ethers.isAddress(body.user)) {
        jsonResponse(req, res, 400, { error: "Invalid or missing user address" });
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
        jsonResponse(req, res, 400, { error: "Invalid or missing attributes" });
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
        jsonResponse(req, res, 200, {
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

      jsonResponse(req, res, 200, {
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
      jsonResponse(req, res, 500, { error: "Internal server error" });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/sign") {
    try {
      const body = JSON.parse(await readBody(req));

      if (!body.user || !ethers.isAddress(body.user)) {
        jsonResponse(req, res, 400, { error: "Invalid or missing user address" });
        return;
      }
      if (!body.handlesDigest || typeof body.handlesDigest !== "string") {
        jsonResponse(req, res, 400, { error: "Missing handlesDigest" });
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

      jsonResponse(req, res, 200, {
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
      jsonResponse(req, res, 500, { error: "Internal server error" });
    }
    return;
  }

  // Publicly decrypts a check's eligible bit. Only works after
  // requestPublicDecryption has been called for that check on-chain;
  // before that, responds gracefully with status "pending".
  if (req.method === "GET" && req.url?.startsWith("/eligible/")) {
    try {
      const checkId = req.url.slice("/eligible/".length).split("?")[0];
      if (!/^0x[0-9a-fA-F]{64}$/.test(checkId)) {
        jsonResponse(req, res, 400, { error: "Invalid checkId — expected 0x-prefixed 32-byte hex" });
        return;
      }

      const gate = new ethers.Contract(GATE_ADDRESS, GATE_ABI, provider);
      const c = await gate.getCheck(checkId);
      const exists: boolean = c[7];
      if (!exists) {
        jsonResponse(req, res, 404, { error: "Check not found" });
        return;
      }

      const status = Number(c[5]); // 0 = PendingDecryption, 1 = Decryptable
      const base = {
        checkId,
        amount: c[3].toString(),
        consumed: c[6] as boolean,
      };

      if (status !== 1) {
        jsonResponse(req, res, 200, {
          ...base,
          status: "pending",
          eligible: null,
          note: "Public decryption has not been requested for this check yet",
        });
        return;
      }

      const handle: string = c[4];
      const relayer = await getRelayer();
      const { clearValues } = await relayer.publicDecrypt([handle]);
      const raw = clearValues[handle] ?? clearValues[handle.toLowerCase()] ?? Object.values(clearValues)[0];
      const eligible = raw === true || raw === 1n || raw === "true" || raw === "1" || raw === 1;

      console.log(`[eligible] checkId=${checkId.slice(0, 10)}... eligible=${eligible}`);
      jsonResponse(req, res, 200, { ...base, status: "decryptable", eligible });
    } catch (err) {
      console.error("[eligible] error:", (err as Error).message);
      jsonResponse(req, res, 500, { error: "Decryption failed — relayer or RPC unreachable" });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    jsonResponse(req, res, 200, { status: "ok", attester: attesterWallet.address });
    return;
  }

  jsonResponse(req, res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Mock attester listening on :${PORT}`);
  console.log(`  attester address: ${attesterWallet.address}`);
  console.log(`  registry:         ${REGISTRY_ADDRESS}`);
  console.log(`  chainId:          ${CHAIN_ID}`);
});

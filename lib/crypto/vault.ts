import {
  envelopeSchema,
  packetSchema,
  KDF_ITERATIONS,
  type KeyEnvelope,
  type Packet,
} from "./schema";
const utf8 = new TextEncoder();
function encode(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decode(value: string) {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function context(owner: string, vaultId: string, purpose: string) {
  return utf8.encode(
    JSON.stringify(["resume-tracker", 1, owner, vaultId, purpose]),
  );
}
function random(size: number) {
  return crypto.getRandomValues(new Uint8Array(size));
}
async function importKey(bytes: Uint8Array) {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
function validatePassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error("解鎖密碼請使用 12 至 256 個字元");
}
async function passwordKey(password: string, salt: Uint8Array) {
  validatePassword(password);
  const source = await crypto.subtle.importKey(
    "raw",
    utf8.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations: KDF_ITERATIONS,
    },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(
  key: CryptoKey,
  plain: Uint8Array,
  aad: Uint8Array,
): Promise<Packet> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new Uint8Array(aad),
      tagLength: 128,
    },
    key,
    new Uint8Array(plain),
  );
  return { v: 1, iv: encode(iv), ct: encode(new Uint8Array(ct)) };
}
async function open(key: CryptoKey, packet: Packet, aad: Uint8Array) {
  const p = packetSchema.parse(packet);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(p.iv),
        additionalData: new Uint8Array(aad),
        tagLength: 128,
      },
      key,
      decode(p.ct),
    ),
  );
}
function formatRecovery(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .match(/.{8}/g)!
    .join("-");
}
function recoveryBytes(code: string) {
  const raw = code.replace(/[\s-]/g, "");
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) throw new Error("復原碼格式不正確");
  return Uint8Array.from(raw.match(/../g)!, (hex) => parseInt(hex, 16));
}
async function wrap(
  owner: string,
  password: string,
  vaultId: string,
  master: Uint8Array,
) {
  const salt = random(16),
    recovery = random(32);
  try {
    const pw = await passwordKey(password, salt),
      rk = await importKey(recovery);
    const envelope: KeyEnvelope = {
      v: 1,
      vaultId,
      salt: encode(salt),
      iterations: KDF_ITERATIONS,
      passwordKey: await seal(
        pw,
        master,
        context(owner, vaultId, "password-wrap"),
      ),
      recoveryKey: await seal(
        rk,
        master,
        context(owner, vaultId, "recovery-wrap"),
      ),
    };
    return {
      envelope,
      key: await importKey(master),
      recoveryCode: formatRecovery(recovery),
    };
  } finally {
    recovery.fill(0);
  }
}
export async function createVault(owner: string, password: string) {
  validatePassword(password);
  const master = random(32);
  try {
    return await wrap(owner, password, crypto.randomUUID(), master);
  } finally {
    master.fill(0);
  }
}
export async function unlockVault(
  owner: string,
  password: string,
  value: unknown,
) {
  const e = envelopeSchema.parse(value);
  const key = await passwordKey(password, decode(e.salt));
  const master = await open(
    key,
    e.passwordKey,
    context(owner, e.vaultId, "password-wrap"),
  );
  try {
    if (master.length !== 32) throw new Error("Invalid key");
    return await importKey(master);
  } finally {
    master.fill(0);
  }
}
export async function recoverVault(
  owner: string,
  code: string,
  password: string,
  value: unknown,
) {
  validatePassword(password);
  const e = envelopeSchema.parse(value);
  const recovery = recoveryBytes(code);
  try {
    const master = await open(
      await importKey(recovery),
      e.recoveryKey,
      context(owner, e.vaultId, "recovery-wrap"),
    );
    try {
      if (master.length !== 32) throw new Error("Invalid key");
      return await wrap(owner, password, e.vaultId, master);
    } finally {
      master.fill(0);
    }
  } finally {
    recovery.fill(0);
  }
}
export async function encryptJson(
  key: CryptoKey,
  owner: string,
  vaultId: string,
  value: unknown,
) {
  return seal(
    key,
    utf8.encode(JSON.stringify(value)),
    context(owner, vaultId, "snapshot"),
  );
}
export async function decryptJson(
  key: CryptoKey,
  owner: string,
  vaultId: string,
  packet: Packet,
) {
  const plain = await open(key, packet, context(owner, vaultId, "snapshot"));
  try {
    return JSON.parse(new TextDecoder().decode(plain));
  } finally {
    plain.fill(0);
  }
}
export async function encryptFile(
  key: CryptoKey,
  owner: string,
  vaultId: string,
  fileId: string,
  bytes: Uint8Array,
) {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: context(owner, vaultId, "file:" + fileId),
      tagLength: 128,
    },
    key,
    new Uint8Array(bytes),
  );
  const output = new Uint8Array(13 + ct.byteLength);
  output[0] = 1;
  output.set(iv, 1);
  output.set(new Uint8Array(ct), 13);
  return output;
}
export async function decryptFile(
  key: CryptoKey,
  owner: string,
  vaultId: string,
  fileId: string,
  bytes: Uint8Array,
) {
  if (bytes.length < 30 || bytes[0] !== 1 || bytes.length > 20_000_029)
    throw new Error("密文檔案格式不正確");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(bytes.slice(1, 13)),
        additionalData: context(owner, vaultId, "file:" + fileId),
        tagLength: 128,
      },
      key,
      new Uint8Array(bytes.slice(13)),
    ),
  );
}

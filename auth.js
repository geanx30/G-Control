const crypto = require("crypto");

const iterations = 120000;
const keyLength = 64;
const digest = "sha512";
const encryptedPrefix = "enc:v1:";

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, keyLength, digest).toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [storedIterations, salt, originalHash] = String(storedHash || "").split(":");
  if (!storedIterations || !salt || !originalHash) return false;
  const hash = crypto
    .pbkdf2Sync(String(password), salt, Number(storedIterations), keyLength, digest)
    .toString("hex");
  const original = Buffer.from(originalHash, "hex");
  const current = Buffer.from(hash, "hex");
  return original.length === current.length && crypto.timingSafeEqual(original, current);
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function encryptSecret(value) {
  const secret = String(value ?? "");
  if (!secret) return "";
  const key = encryptionKey();
  if (!key) return secret;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${encryptedPrefix}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value) {
  const secret = String(value ?? "");
  if (!isEncryptedSecret(secret)) return secret;

  const key = encryptionKey();
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY ausente no .env. Informe a chave para ler senhas criptografadas.");
  }

  const [ivText, tagText, encryptedText] = secret.slice(encryptedPrefix.length).split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Senha criptografada invalida.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function isEncryptedSecret(value) {
  return String(value || "").startsWith(encryptedPrefix);
}

function hasEncryptionKey() {
  return Boolean(encryptionKey());
}

function encryptionKey() {
  const raw = String(process.env.APP_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;

  const base64Key = Buffer.from(raw, "base64");
  if (base64Key.length === 32) return base64Key;

  const hexKey = Buffer.from(raw, "hex");
  if (hexKey.length === 32) return hexKey;

  return crypto.createHash("sha256").update(raw).digest();
}

module.exports = {
  createToken,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hasEncryptionKey,
  isEncryptedSecret,
  verifyPassword
};

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export interface EncryptedSecret {
  readonly authTag: string;
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly keyVersion: string;
  readonly maskedHint: string;
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(
    masterKey: string,
    private readonly keyVersion = "local-v1",
  ) {
    if (masterKey.length < 32)
      throw new Error(
        "MODEL_CREDENTIAL_MASTER_KEY must be at least 32 characters.",
      );
    this.key = createHash("sha256").update(masterKey).digest();
  }

  encrypt(secret: string): EncryptedSecret {
    if (secret.trim().length < 8) throw new Error("Credential is too short.");
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.key,
      initializationVector,
    );
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    return {
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      initializationVector: initializationVector.toString("base64url"),
      keyVersion: this.keyVersion,
      maskedHint: this.mask(secret),
    };
  }

  decrypt(secret: Omit<EncryptedSecret, "maskedHint">): string {
    if (secret.keyVersion !== this.keyVersion)
      throw new Error("Credential key version is unavailable.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(secret.initializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  private mask(secret: string): string {
    return secret.length <= 8
      ? "********"
      : `${secret.slice(0, 3)}***${secret.slice(-4)}`;
  }
}

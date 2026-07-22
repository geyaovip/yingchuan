import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "UnsafeUrlError";
  }
}

export function normalizePublicUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("URL_INVALID");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new UnsafeUrlError("URL_SCHEME_UNSUPPORTED");
  }
  if (url.username || url.password)
    throw new UnsafeUrlError("URL_CREDENTIALS_FORBIDDEN");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  )
    url.port = "";
  if (isForbiddenHostname(url.hostname))
    throw new UnsafeUrlError("URL_HOST_FORBIDDEN");
  if (url.pathname !== "/")
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function isForbiddenHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal"
  )
    return true;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);
  return false;
}

export function isPrivateIp(address: string): boolean {
  const normalized = address.split("%")[0] ?? address;
  return isIP(normalized) === 4
    ? isPrivateIpv4(normalized)
    : isIP(normalized) === 6
      ? isPrivateIpv6(normalized)
      : true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

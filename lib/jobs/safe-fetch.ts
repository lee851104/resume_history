import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
export function isPublicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateTarget(value: string) {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw new Error("不支援的網址");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!host.includes(".") && !host.includes(":"))
  )
    throw new Error("非公開網址");
  if (ipaddr.isValid(host) && !isPublicAddress(host))
    throw new Error("非公開位址");
  return u;
}
async function oneRequest(
  url: URL,
  signal: AbortSignal,
): Promise<{ status: number; location?: string; html: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === "ipv6" ? 6 : 4 }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("非公開位址");
  signal.throwIfAborted();
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(
      url,
      {
        signal,
        headers: {
          "User-Agent": "ResumeTracker/1.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: ((
          _hostname: unknown,
          _options: unknown,
          callback: Function,
        ) => {
          callback(null, [selected]);
        }) as never,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.resume();
          resolve({
            status: response.statusCode,
            location: response.headers.location,
            html: "",
          });
          return;
        }
        if (
          response.statusCode !== 200 ||
          !String(response.headers["content-type"]).includes("html") ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          response.resume();
          reject(new Error("無法讀取頁面"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) {
            response.destroy(new Error("頁面過大"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: 200,
            html: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}
export async function safeFetchHtml(value: string): Promise<string> {
  const signal = AbortSignal.timeout(4000);
  const work = async () => {
    let url = validateTarget(value);
    for (let i = 0; i <= 3; i++) {
      const result = await oneRequest(url, signal);
      if (result.status === 200) return result.html;
      if (!result.location) throw new Error("無法讀取");
      url = validateTarget(new URL(result.location, url).href);
    }
    throw new Error("重新導向過多");
  };
  return Promise.race([
    work(),
    new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("讀取逾時")), {
        once: true,
      }),
    ),
  ]);
}

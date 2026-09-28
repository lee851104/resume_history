import { HttpError } from "@/lib/security";
// Bind each request to the account that encrypted it, even if cookies change mid-flight.
export function assertVaultOwner(request: Request, owner: string) {
  if (request.headers.get("X-Vault-Owner") !== owner)
    throw new HttpError(401, "登入帳號已切換，請重新登入並解鎖");
}

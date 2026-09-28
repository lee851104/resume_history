export const AUTH_INVALID_EVENT = "vault-auth-invalid";
export const SESSION_CHANNEL = "resume-tracker-session";
export function notifySignOut() {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage("signed-out");
    channel.close();
  }
}

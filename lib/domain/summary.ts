import { Application, ApplicationStatus, statuses } from "./types";
export function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function isDue(
  item: Pick<Application, "status" | "followUpOn">,
  today: string,
) {
  return (
    !!item.followUpOn &&
    item.followUpOn <= today &&
    ["applied", "interviewing"].includes(item.status)
  );
}
export function summarize(items: Application[], today: string) {
  const byStatus = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
  items.forEach((item) => {
    byStatus[item.status]++;
  });
  return {
    total: items.length,
    interviewing: byStatus.interviewing,
    due: items.filter((i) => isDue(i, today)).length,
    byStatus,
  };
}

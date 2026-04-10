export const buildVersion = __BUILD_VERSION__;
export const buildCommit = __BUILD_COMMIT__;
export const buildTime = __BUILD_TIME__;

export function getBuildString(): string {
  if (buildVersion === "dev") return "dev";
  const shortCommit = buildCommit.length > 7 ? buildCommit.slice(0, 7) : buildCommit;
  const date = buildTime.slice(0, 10);
  return `v${buildVersion} (${shortCommit}) · ${date}`;
}

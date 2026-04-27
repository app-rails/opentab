import { Card, CardContent, CardHeader, CardTitle } from "@opentab/ui/components/card";
import { useTranslation } from "react-i18next";
import type { SyncSettings } from "@/lib/sync-settings";

interface ServerInfoCardProps {
  savedConfig: SyncSettings["savedConfig"];
  auth: SyncSettings["auth"];
  /** ms epoch of last successful sync; null = never synced. */
  lastSyncAt: number | null;
}

/**
 * Sync server panel — connected state info card.
 *
 * Pure presentation: renders endpoint / device name / device id / last sync
 * in a label-value grid. No fetch, no mutation. Caller (T24 ServerConnected)
 * owns the data and only renders this when both savedConfig and auth exist;
 * the early-return below is defensive only.
 */
export function ServerInfoCard({ savedConfig, auth, lastSyncAt }: ServerInfoCardProps) {
  const { t } = useTranslation();

  if (savedConfig === null || auth === null) return null;

  const deviceName = auth.deviceName ?? t("settings.server.info_device_name_fallback", "未命名");
  const deviceIdShort = truncateDeviceId(auth.deviceId);
  const lastSyncLabel =
    lastSyncAt === null
      ? t("settings.server.info_last_sync_never", "从未同步")
      : formatTimestamp(lastSyncAt);

  return (
    <Card data-testid="server-info-card">
      <CardHeader>
        <CardTitle>{t("settings.server.info_section_title", "服务器信息")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
        <InfoLabel>{t("settings.server.info_endpoint", "Endpoint")}</InfoLabel>
        <span className="break-all font-mono text-sm">{savedConfig.host}</span>

        <InfoLabel>{t("settings.server.info_device_name", "设备名")}</InfoLabel>
        <span className="text-sm">{deviceName}</span>

        <InfoLabel>{t("settings.server.info_device_id", "设备 ID")}</InfoLabel>
        <span className="font-mono text-muted-foreground text-sm" title={auth.deviceId}>
          {deviceIdShort}
        </span>

        <InfoLabel>{t("settings.server.info_last_sync", "最后同步")}</InfoLabel>
        <span className="text-muted-foreground text-sm">{lastSyncLabel}</span>
      </CardContent>
    </Card>
  );
}

function InfoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </span>
  );
}

// 12 chars + ellipsis keeps device IDs readable while signalling truncation.
// Full id stays available via the title attribute for power-users hovering.
function truncateDeviceId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 12)}…`;
}

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

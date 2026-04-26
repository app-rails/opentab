import { SettingsLayout } from "~/components/settings/settings-layout";
import { ThemeRadioGroup } from "~/components/theme";
import type { BreadcrumbHandle } from "~/lib/breadcrumbs";
import { getPageTitle } from "~/lib/utils";

export const handle: BreadcrumbHandle = {
  breadcrumb: () => ({ label: "Appearance" }),
};

export function meta() {
  return [{ title: getPageTitle("Appearance") }];
}

export default function AppearanceRoute() {
  return (
    <SettingsLayout
      title="Appearance"
      description="Customize the appearance of the app. Automatically switch between day and night themes."
    >
      <ThemeRadioGroup />
    </SettingsLayout>
  );
}

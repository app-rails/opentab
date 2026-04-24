import { parseSubmission, report } from "@conform-to/react/future";
import { DeleteAccount, SignOut } from "~/components/settings/account-action";
import { SettingRow } from "~/components/settings/setting-row";
import { SettingsLayout } from "~/components/settings/settings-layout";
import { UserAvatar } from "~/components/user/user-avatar";
import { useAuthUser } from "~/hooks/use-auth-user";
import { getPageTitle } from "~/lib/utils";
import { accountSchema } from "~/lib/validations/settings";
import { requiredAuthContext } from "~/middlewares/auth";
import { auth } from "~/services/auth/auth.server";
import { dataWithToast } from "~/services/toast.server";
import type { Route } from "./+types/account";

export function meta() {
  return [{ title: getPageTitle("Account") }];
}

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const formData = await request.clone().formData();
    const submission = parseSubmission(formData);
    const payload = accountSchema.safeParse(submission.payload);

    if (!payload.success) {
      return dataWithToast(
        report(submission, {
          error: {
            issues: payload.error.issues.map((issue) => ({
              path: issue.path.map(String),
              message: issue.message,
            })),
          },
        }),
        {
          title: "Invalid form data.",
          type: "error",
        },
      );
    }

    const headers = request.headers;
    const { user } = context.get(requiredAuthContext);
    const { intent } = payload.data;
    let message = "";

    switch (intent) {
      case "delete-account":
        if (user.role === "admin") {
          return dataWithToast(null, {
            title: "Admin account cannot be deleted.",
            type: "error",
          });
        }

        await Promise.all([
          auth.api.revokeSessions({ headers }),
          auth.api.deleteUser({ body: {}, asResponse: false, headers }),
        ]);
        message = "Account deleted.";
        break;

      default:
        return dataWithToast(null, {
          title: "Invalid intent.",
          type: "error",
        });
    }

    return dataWithToast(null, {
      title: message,
      type: "success",
    });
  } catch (error) {
    console.error("Account action error:", error);
    return dataWithToast(null, {
      title: "An unexpected error occurred. Please try again later.",
      type: "error",
    });
  }
}

export default function AccountRoute() {
  const user = useAuthUser();

  return (
    <SettingsLayout title={`👋 Hello, ${user.name}!`}>
      <SettingRow
        title="Avatar"
        description="Your avatar is generated from your name."
        action={<UserAvatar name={user.name} size={40} />}
      />
      <SettingRow
        title="Current sign in"
        description={`You are signed in as ${user.email}`}
        action={<SignOut />}
      />
      <SettingRow
        title="Delete account"
        description="Permanently delete your account."
        action={<DeleteAccount email={user.email} />}
      />
    </SettingsLayout>
  );
}

import * as vscode from "vscode";
import { t, type Locale } from "../util/i18n";

export const MILESTONES = [
  { threshold: 0.01, key: "milestone.firstCent" },
  { threshold: 1.00, key: "milestone.firstDollar" },
  { threshold: 5.00, key: "milestone.fiveDollars" },
  { threshold: 10.00, key: "milestone.tenDollars" },
  { threshold: 25.00, key: "milestone.twentyFive" },
  { threshold: 50.00, key: "milestone.fifty" },
  { threshold: 100.00, key: "milestone.hundred" },
] as const;

const GLOBAL_STATE_PREFIX = "gptw.milestone.";

export function checkMilestones(
  lifetimeUsd: number,
  ctx: vscode.ExtensionContext,
  locale?: Locale,
): void {
  const loc = locale ?? "en";
  for (const m of MILESTONES) {
    if (lifetimeUsd >= m.threshold) {
      const hitKey = GLOBAL_STATE_PREFIX + m.key + ".hit";
      const alreadyHit = ctx.globalState.get<boolean>(hitKey, false);
      if (!alreadyHit) {
        void ctx.globalState.update(hitKey, true);
        void showMilestoneNotification(m.key, m.threshold, loc);
      }
    }
  }
}

async function showMilestoneNotification(
  milestoneKey: string,
  amount: number,
  locale: Locale,
): Promise<void> {
  const msgKey = `gptw.${milestoneKey}`;
  const body = t(msgKey, { amount: formatUsd(amount) }, locale);
  const title = t("gptw.milestone.title", {}, locale);
  const action = t("gptw.milestone.action", {}, locale);

  const choice = await vscode.window.showInformationMessage(
    `${title} ${body}`,
    action,
  );
  if (choice === action) {
    void vscode.env.openExternal(
      vscode.Uri.parse(
        "https://get-paid-to-wait-m44znelko-mayurs-projects-4c08c14e.vercel.app/"));
  }
}

export function resetMilestones(ctx: vscode.ExtensionContext): void {
  for (const m of MILESTONES) {
    const hitKey = GLOBAL_STATE_PREFIX + m.key + ".hit";
    void ctx.globalState.update(hitKey, undefined);
  }
}

function formatUsd(amount: number): string {
  return "$" + amount.toFixed(2);
}

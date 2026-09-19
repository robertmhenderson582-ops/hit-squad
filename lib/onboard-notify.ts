import { NOVUS_INVITE_FROM } from "./invite-policy.ts";
import {
  TEKSOLV_LOCATION,
  TEKSOLV_NAME,
  displayOnboardName,
  nextOnboardStage,
  onboardStage,
  onboardStageOwner,
  onboardStepNumber,
  type OnboardPerson,
  type OnboardSettings,
  type OnboardStageId,
  type OnboardViewer,
} from "./onboard-pipeline.ts";

export type StepCompleteMail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

export type StepCompleteNotifyResult = {
  queued: boolean;
  sent: boolean;
  recipients: number;
  skipped?: string;
  error?: string;
  mail?: StepCompleteMail;
};

function smtpTarget() {
  if (process.env.TICKET_SMTP_URL) return process.env.TICKET_SMTP_URL;
  if (process.env.SMTP_URL) return process.env.SMTP_URL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return null;
  const user = encodeURIComponent(process.env.GMAIL_USER || NOVUS_INVITE_FROM);
  return `smtps://${user}:${encodeURIComponent(pass)}@smtp.gmail.com:465`;
}

export function stepCompleteRecipients(settings: OnboardSettings): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [...settings.corporateEmails, ...settings.pmEmails]) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function stepCompleteMail(
  person: OnboardPerson,
  completedStage: OnboardStageId,
  actor?: OnboardViewer | null,
  at = new Date().toISOString(),
): Omit<StepCompleteMail, "to" | "from"> {
  const stage = onboardStage(completedStage);
  const next = nextOnboardStage(completedStage);
  const display = displayOnboardName(person);
  const lines = [
    `Hit Squad Control Center — Step ${stage.step || "—"} complete`,
    "",
    `Employee: ${display}`,
    `Craft: ${person.craft}${person.classification ? ` · ${person.classification}` : ""}`,
    `Local: ${person.localId}`,
    `Phone: ${person.phone || "—"}`,
    `Step: ${stage.step} · ${stage.label}`,
    `Status: complete`,
    `Owner: ${onboardStageOwner(completedStage) || "—"}`,
    `Timestamp: ${at}`,
    `Recorded by: ${(actor?.name || "").trim() || "Desk"}`,
  ];
  if (next) {
    lines.push(`Next step: ${onboardStage(next).label}`);
    lines.push(`Next owner: ${onboardStageOwner(next) || "—"}`);
  } else if (completedStage === "step-5") {
    lines.push(`Onboarding pipeline complete at ${TEKSOLV_NAME}, ${TEKSOLV_LOCATION}.`);
  }
  if (person.requestId) lines.push(`Manpower request: ${person.requestId}`);
  lines.push("");
  lines.push("Legal name / DOB / SSN are not included in this mail.");
  lines.push("Hit Squad Control Center verification copy. Not Inbox.");
  return {
    subject: `Onboard Step ${stage.step || onboardStepNumber(completedStage)} complete · ${display}`,
    text: lines.join("\n"),
  };
}

export function buildStepCompleteMail(
  person: OnboardPerson,
  completedStage: OnboardStageId,
  settings: OnboardSettings,
  actor?: OnboardViewer | null,
  at?: string,
): StepCompleteMail | { skipped: string } {
  const to = stepCompleteRecipients(settings);
  if (!to.length) {
    return { skipped: "Owner has not configured corporate / PM recipients." };
  }
  if (completedStage === "blocked") {
    return { skipped: "Blocked / failed does not send a step-complete email." };
  }
  const body = stepCompleteMail(person, completedStage, actor, at);
  return {
    from: (process.env.GMAIL_USER || NOVUS_INVITE_FROM).trim().toLowerCase() || NOVUS_INVITE_FROM,
    to,
    ...body,
  };
}

export async function notifyStepComplete(input: {
  person: OnboardPerson;
  completedStage: OnboardStageId;
  settings: OnboardSettings;
  actor?: OnboardViewer | null;
  at?: string;
}): Promise<StepCompleteNotifyResult> {
  const built = buildStepCompleteMail(input.person, input.completedStage, input.settings, input.actor, input.at);
  if ("skipped" in built) {
    return { queued: false, sent: false, recipients: 0, skipped: built.skipped };
  }
  const url = smtpTarget();
  if (!url) {
    return {
      queued: false,
      sent: false,
      recipients: built.to.length,
      mail: built,
      skipped: "Step-complete mail is not configured on this desk.",
    };
  }
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport(url);
    await transporter.sendMail({
      to: built.to.join(", "),
      from: built.from,
      subject: built.subject,
      text: built.text,
    });
    return { queued: true, sent: true, recipients: built.to.length, mail: built };
  } catch {
    return {
      queued: true,
      sent: false,
      recipients: built.to.length,
      mail: built,
      error: "Could not send the step-complete verification email.",
    };
  }
}

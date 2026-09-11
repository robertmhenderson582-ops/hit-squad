import { NOVUS_HELP_EMAIL, NOVUS_HELP_LABEL, NOVUS_HELP_MAILTO } from "@/lib/desk-help";

export function DeskHelpBar() {
  return (
    <div className="desk-help-bar" role="note">
      <span className="desk-help-label">{NOVUS_HELP_LABEL}</span>
      <a className="desk-help-mail" href={NOVUS_HELP_MAILTO} title={`${NOVUS_HELP_LABEL} · ${NOVUS_HELP_EMAIL}`}>
        {NOVUS_HELP_EMAIL}
      </a>
    </div>
  );
}

/** Process-local ownership; descendants inherit the original owner, reload keeps it. */
export const OWNER_PID_ENV = "PI_JEV_TODO_AUDIT_OWNER_PID";

export function claimAuditProcess(): boolean {
	const pid = String(process.pid), owner = process.env[OWNER_PID_ENV];
	if (owner) return owner === pid;
	process.env[OWNER_PID_ENV] = pid;
	return true;
}

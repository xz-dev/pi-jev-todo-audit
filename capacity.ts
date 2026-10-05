/** Load-compatible legacy configuration shape only. No audit-owned capacity engine. */
export interface ContextLimits {
	request?: number;
	stateAndLongestQuestion?: number;
}

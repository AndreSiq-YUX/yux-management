type Previous = { status: string; evidenceHash?: string; evidenceVersion?: { hashVersion?: number }; previous?: unknown; [key: string]: unknown };
/** Free receipt recovery happens before this policy. This authorizes only a
 * different, proven v2 evidence input, not a retry of the previous purchase. */
export function planRadarPresenceRefresh(input: { enabled: boolean; previous?: Previous; evidenceHash: string; maximum: number }) {
    const prior = input.previous;
    const old = Array.isArray(prior?.previous) ? prior.previous : prior?.previous && typeof prior.previous === 'object' ? [prior.previous] : [];
    const history = prior ? [...old, Object.fromEntries(Object.entries(prior).filter(([key]) => key !== 'previous'))] : [];
    const count = history.filter(value => value && typeof value === 'object' && (value as Previous).status === 'completed').length;
    const changed = prior?.status === 'completed' && prior.evidenceVersion?.hashVersion === 2 && !!prior.evidenceHash && prior.evidenceHash !== input.evidenceHash;
    return { allowed: input.enabled && changed && count < input.maximum,
        reason: count >= input.maximum ? 'radar_presence_resolution_limit_reached' : 'radar_presence_refresh_authorization_required', history, count };
}

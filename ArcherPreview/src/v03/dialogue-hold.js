// Minimum time a dialogue line stays up (2026-11-28, user: "even when mashed, a line
// stays at least this long; 0.6 s feels right"). Applies to NPC talk, the choices and the
// prologue captions. A press inside the hold may still complete a typing line; it never
// moves on to the next one. Automatic timing (the dream's own caption holds) is unchanged.
export const DIALOGUE_MIN_HOLD=.6;
// Only a person's input is held back: synthetic events (scripts, tests) are not.
export const trustedInput=event=>event?.isTrusted===true;
// True while a line shown at shownAt (ms) must not be left yet.
export const holding=(shownAt,at)=>at-shownAt<DIALOGUE_MIN_HOLD*1000;

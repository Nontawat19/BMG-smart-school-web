// Single source of truth for the currently-effective Privacy Policy / Terms of Use
// version numbers. ConsentGate.tsx compares a user's saved consent record against
// these — bump either value whenever the corresponding legal page's substance changes,
// and every user (regardless of role) will be re-prompted to accept the new version.
export const PRIVACY_POLICY_VERSION = "1.0";
export const TERMS_OF_USE_VERSION = "1.0";

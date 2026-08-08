// The referral cookie's name and lifetime, in a module both the route
// that SETS it and the handlers that READ it can import.
//
// Two copies of a cookie name is a bug that presents as "the affiliate
// programme silently credits nobody", which is the hardest kind to notice:
// everything works, nobody is paid.

export const REFERRAL_COOKIE = "ionexa_ref";

/**
 * 90 days.
 *
 * Long enough that someone who reads a review, thinks about it for a
 * month and then signs up still credits the person who told them. Short
 * enough that a cookie set two years ago on a shared machine is not still
 * quietly assigning strangers to an affiliate.
 */
export const REFERRAL_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

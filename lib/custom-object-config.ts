// Plain (non-"use server") constants for the custom-object list.

// How big an object gets before its list switches from "load everything" to
// server-side pagination + sort + filter. Tunable.
export const CO_SERVER_THRESHOLD = 2000
export const CO_PAGE_SIZE = 50

export const DISCORD_STUDY_ROOM_URL = "https://discord.gg/7nMeSdpwPg";

/** The free demo, served on its own subdomain. */
export const FREE_DEMO_URL = "https://demo.nanosyllabus.com";

/** Where "Book a call" goes: the Calendly page, unless NEXT_PUBLIC_BOOK_CALL_URL names another. */
export const BOOK_CALL_URL =
  process.env.NEXT_PUBLIC_BOOK_CALL_URL || "https://calendly.com/surfwithprashant/30min";

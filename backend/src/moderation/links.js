// No links in what players write for others to see (names), so nobody can send people to another page.
// A link is an address with its scheme ("https://…", "ftp://…"), one starting with "www.", or a name followed by a
// known ending ("algo.com", "bit.ly/x", "discord.gg/abc"), also written with spaces or brackets around the dot
// ("algo . com", "algo[.]com") or the dot in words ("algo punto com"). Only the endings in TLDS count, so "Sr.Pérez" or
// "1.5" aren't links.

const TLDS = [
  "com", "net", "org", "io", "gg", "ly", "me", "co", "tv", "xyz", "app", "dev", "info", "biz", "es", "mx", "ar", "cl",
  "pe", "uy", "ve", "ec", "bo", "py", "us", "uk", "de", "fr", "it", "ru", "cn", "br", "link", "site", "online", "club",
  "live", "store", "shop", "top", "to", "be", "cc", "ai", "tk", "ml", "ga", "cf", "gq", "li", "sh", "fm", "am", "pw",
  "ws", "lol", "gl", "page", "onion", "edu", "gov", "xxx", "porn", "sex", "click", "fun", "website", "space", "tech",
  "pro", "vip", "win", "bet", "casino", "today", "news", "blog",
];
// Endings that are only links (never a word), so they count even with spaces around the dot or the dot in words.
const STRONG = ["com", "net", "org", "io", "gg", "ly", "xyz", "onion"];

const SCHEME = /\b[a-z][a-z0-9+.-]*:\/\/\S/i;
const WWW = /\bwww\s*(?:\.|\[\s*\.\s*\]|\(\s*\.\s*\))\s*[a-z0-9-]/i;
const DOMAIN = new RegExp(`[a-z0-9-]\\.(?:${TLDS.join("|")})(?![a-z0-9-])`, "i");
const SPACED = new RegExp(
  `[a-z0-9-]\\s*(?:\\s\\.\\s*|\\.\\s+|\\[\\s*\\.\\s*\\]|\\(\\s*\\.\\s*\\)|\\s+(?:punto|dot)\\s+)\\s*(?:${STRONG.join("|")})(?![a-z0-9-])`,
  "i"
);

/** Whether this text has a link in it. */
export function hasLink(text) {
  const s = String(text ?? "").normalize("NFKC");
  return SCHEME.test(s) || WWW.test(s) || DOMAIN.test(s) || SPACED.test(s);
}

export const NAME_LINK_ERROR = "El nombre no puede llevar enlaces";

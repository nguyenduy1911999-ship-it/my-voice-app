export function clearLegacySessionCookie() {
  return (req, res, next) => next();
}
// Best-effort "Browser on OS" string for security emails (forgot-password,
// password-reset receipt). Deliberately does not attempt IP geolocation —
// that was already evaluated and declined elsewhere in this codebase (see
// PublicService's scan recording) as a third-party dependency not worth
// adding for a "nice to have" field; the same call applies here.
export function describeUserAgent(userAgent?: string): string {
  if (!userAgent) {
    return 'an unknown device';
  }

  let browser = 'a browser';

  if (/edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/chrome/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/safari/i.test(userAgent)) {
    browser = 'Safari';
  }

  let os = 'an unknown OS';

  if (/android/i.test(userAgent)) {
    os = 'Android';
  } else if (/iphone|ipad|ios/i.test(userAgent)) {
    os = 'iOS';
  } else if (/windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/mac os/i.test(userAgent)) {
    os = 'macOS';
  } else if (/linux/i.test(userAgent)) {
    os = 'Linux';
  }

  return `${browser} on ${os}`;
}

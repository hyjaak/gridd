/** Shared HTML fragments for GRIDD transactional email (Resend). */

export const GRIDD_FROM_VERIFY = "GRIDD <noreply@gridd.click>";
export const GRIDD_FROM_DRIVERS = "GRIDD <drivers@gridd.click>";

export function griddEmailShell(inner: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#060606;font-family:system-ui,-apple-system,sans-serif;color:#eee;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:16px;padding:28px;">
    <div style="font-size:24px;font-weight:900;color:#00FF88;letter-spacing:-0.5px;">GRIDD</div>
    ${inner}
    <p style="margin-top:24px;font-size:11px;color:#555;">© GRIDD Technologies, LLC · Atlanta, GA · gridd.click</p>
  </div>
</body></html>`;
}

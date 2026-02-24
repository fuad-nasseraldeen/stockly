function getTurnstileSecret(): string | null {
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  return secret || null;
}

export async function verifyTurnstileToken(token: string, remoteIp?: string | null): Promise<boolean> {
  const secret = getTurnstileSecret();
  if (!secret) {
    return false;
  }

  const formData = new URLSearchParams();
  formData.set('secret', secret);
  formData.set('response', token);
  if (remoteIp) {
    formData.set('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    return false;
  }

  const json = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return json?.success === true;
}

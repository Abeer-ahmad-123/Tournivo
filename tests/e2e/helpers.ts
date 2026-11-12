import type { APIResponse } from "@playwright/test";

export async function signUpRespectingRateLimit(signUp: () => Promise<APIResponse>) {
  let response = await signUp();
  // Browser scenarios share one local IP; the real auth limit is three sign-ups per ten seconds.
  for (let attempt = 0; response.status() === 429 && attempt < 2; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 11000));
    response = await signUp();
  }
  return response;
}

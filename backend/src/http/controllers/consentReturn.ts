/**
 * Where to send the browser after a wallet's consent callback: the page the record asked for, or
 * the sandbox's fallback when it cannot be read.
 */
export async function returnPath(
  read: () => Promise<string | undefined>,
  fallback: string,
): Promise<string> {
  try {
    return (await read()) ?? fallback;
  } catch {
    return fallback;
  }
}

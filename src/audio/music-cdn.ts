import config from './music-cdn.json';

export const MUSIC_SIGNER = config.signer;

export function usesRemoteMusic() {
  if (typeof location === 'undefined') return false;
  const host = location.hostname;
  // `.local` covers whatever this machine calls itself on the wifi, so a phone
  // reaching the dev server gets the song without the machine's name shipping.
  if (host.endsWith('.local')) return true;
  return config.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Studio and GitHub Pages both ask the signer for a short-lived CloudFront URL. */
export async function resolveMusicUrl(path: string) {
  if (!path || !usesRemoteMusic()) return path;
  const response = await fetch(config.signer, {headers: {accept: 'application/json'}});
  if (!response.ok) throw new Error(`music signer ${response.status}`);
  const payload = (await response.json()) as {url?: string};
  if (!payload.url) throw new Error('music signer: no url');
  return payload.url;
}

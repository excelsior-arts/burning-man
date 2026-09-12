// The inline HTML shell paints before this entry or any stylesheet is downloaded.
// Install layout before the renderer measures its canvas, then reveal only a rendered scene.
const retry = document.querySelector<HTMLButtonElement>('#loading-retry')!;
retry.onclick = () => window.location.reload();
try {
  await import('./style.css');
  await import('./main');
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  document.querySelector<HTMLElement>('#loading-screen')!.hidden = true;
  document.documentElement.classList.remove('loading');
  document.body.removeAttribute('aria-busy');
} catch (error) {
  console.error('The experience could not load.', error);
  const status = document.querySelector<HTMLElement>('#loading-status')!;
  status.textContent = 'The desert could not load.';
  status.classList.remove('visually-hidden');
  document.querySelector<HTMLElement>('#loading-spinner')!.hidden = true;
  retry.hidden = false;
  document.body.removeAttribute('aria-busy');
}

export {};

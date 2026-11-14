// Bloc « Laisser un mot » d'une démo : les trois derniers messages qui en parlent (SPEC §B8).
// L'API n'est appelée que lorsque le bloc approche de l'écran : une démo se joue sans réveiller le serveur.
import type { MessageList } from '../../../../api/src/contract';
import { api, SLOW_AFTER_MS } from '../api/client';
import { messageCard, statusWriter } from './render';

const SHOWN = 3;
const TEXT = {
  loading: 'Chargement des messages…',
  waking: "Réveil du serveur… cela peut prendre jusqu'à une minute.",
  empty: 'Pas encore de mot sur cette démo. Le premier est pour vous.',
  unreachable: "Le livre d'or ne répond pas. Le reste du site fonctionne.",
} as const;

function setup(block: HTMLElement): void {
  const page = block.dataset.page;
  const list = block.querySelector<HTMLOListElement>('[data-guestbook-list]');
  const status = block.querySelector<HTMLElement>('[data-guestbook-status]');
  const live = block.querySelector<HTMLElement>('[data-guestbook-live]');
  const more = block.querySelector<HTMLElement>('[data-guestbook-more]');
  const retry = block.querySelector<HTMLButtonElement>('[data-guestbook-retry]');
  if (!page || !list || !status || !live || !more || !retry) return;
  const setStatus = statusWriter(status, live);

  async function load(): Promise<void> {
    retry!.hidden = true;
    setStatus(TEXT.loading, 'waiting');
    const slow = window.setTimeout(() => setStatus(TEXT.waking, 'waiting'), SLOW_AFTER_MS);
    try {
      const result = await api.get<MessageList>(`/api/messages?page=${encodeURIComponent(page!)}`);
      window.clearTimeout(slow);
      // Tous ces messages parlent de cette démo : inutile de le redire sur chacun.
      list!.replaceChildren(...result.messages.slice(0, SHOWN).map((message) => messageCard(message, new Map(), false)));
      more!.hidden = result.messages.length <= SHOWN;
      block.dataset.state = result.messages.length === 0 ? 'empty' : 'ready';
      setStatus(result.messages.length === 0 ? TEXT.empty : '');
    } catch {
      window.clearTimeout(slow);
      block.dataset.state = 'error';
      setStatus(TEXT.unreachable, 'problem');
      retry!.hidden = false;
    }
  }

  retry.addEventListener('click', () => void load());

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    },
    // Un peu avant l'écran : la réponse est souvent là quand le visiteur arrive.
    { rootMargin: '300px 0px' },
  );
  observer.observe(block);
}

for (const block of document.querySelectorAll<HTMLElement>('[data-guestbook-block]')) setup(block);

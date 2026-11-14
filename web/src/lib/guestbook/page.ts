// Page du livre d'or : les messages publiés, leur suite, et le formulaire (SPEC §B8).
import type { MessageList } from '../../../../api/src/contract';
import { api, asApiError, SLOW_AFTER_MS } from '../api/client';
import { byId } from '../ui/dom';
import { BODY_MAX, countCharacters, fieldMessages, missingFields, subjectFromSearch } from './format';
import { messageCard, statusWriter, type StatusWriter, type Subject } from './render';

const TEXT = {
  loading: 'Chargement des messages…',
  waking: "Réveil du serveur… cela peut prendre jusqu'à une minute.",
  empty: "Personne n'a encore écrit. Le premier mot est pour vous.",
  unreachable: "Le livre d'or ne répond pas. Le reste du site fonctionne.",
  sending: 'Envoi…',
  sent: "Merci. Votre message attend d'être relu avant d'apparaître.",
  invalid: "Le message n'est pas parti : corrigez ce qui est signalé.",
  notSent: "Le livre d'or ne répond pas : votre message n'est pas parti. Il est resté dans le formulaire.",
} as const;

const root = byId('guestbook', HTMLElement);
const list = byId('guestbook-list', HTMLOListElement);
const setListStatus = statusWriter(byId('guestbook-status', HTMLElement), byId('guestbook-live', HTMLElement));
const more = byId('guestbook-more', HTMLButtonElement);
const retry = byId('guestbook-retry', HTMLButtonElement);

const form = byId('ecrire', HTMLFormElement);
const author = byId('gb-author', HTMLInputElement);
const subject = byId('gb-page', HTMLSelectElement);
const body = byId('gb-body', HTMLTextAreaElement);
const website = byId('gb-website', HTMLInputElement);
const counter = byId('gb-count', HTMLElement);
const submit = byId('gb-submit', HTMLButtonElement);
const setFormStatus = statusWriter(byId('gb-status', HTMLElement), byId('gb-live', HTMLElement));

// Les rattachements connus sont ceux du formulaire : chaque option porte son nom et la page où aller voir.
const subjects = new Map<string, Subject>();
for (const option of subject.options) {
  if (option.value !== '') subjects.set(option.value, { label: option.textContent ?? '', href: option.dataset.href ?? '/' });
}

/** Affiche « Chargement » puis, si l'attente dure, « Réveil du serveur ». Renvoie de quoi arrêter. */
function waitingOn(write: StatusWriter, first: string): () => void {
  write(first, 'waiting');
  const slow = window.setTimeout(() => write(TEXT.waking, 'waiting'), SLOW_AFTER_MS);
  return () => window.clearTimeout(slow);
}

let nextBefore: number | null = null;

async function load(before: number | null): Promise<void> {
  retry.hidden = true;
  more.setAttribute('aria-disabled', 'true');
  const stop = waitingOn(setListStatus, TEXT.loading);
  try {
    const result = await api.get<MessageList>(before === null ? '/api/messages' : `/api/messages?before=${before}`);
    stop();
    const cards = result.messages.map((message) => messageCard(message, subjects, true));
    list.append(...cards);
    nextBefore = result.nextBefore;
    more.hidden = nextBefore === null;
    root.dataset.state = list.childElementCount === 0 ? 'empty' : 'ready';
    setListStatus(list.childElementCount === 0 ? TEXT.empty : '');
    // Après « Afficher la suite », le lecteur reprend au premier message ajouté.
    const first = cards[0];
    if (before !== null && first) {
      first.tabIndex = -1;
      first.focus();
    }
    if (before === null) keepFormInView();
  } catch {
    stop();
    root.dataset.state = 'error';
    setListStatus(TEXT.unreachable, 'problem');
    retry.hidden = false;
  } finally {
    more.removeAttribute('aria-disabled');
  }
}

// Arrivée par « Écrire un mot » (#ecrire) : sur un écran étroit, les messages se chargent au-dessus du formulaire
// et le poussent hors de l'écran. On l'y ramène, sauf si le visiteur a déjà bougé.
let moved = false;
for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const) {
  window.addEventListener(type, () => (moved = true), { once: true, passive: true });
}

function keepFormInView(): void {
  if (window.location.hash !== '#ecrire' || moved) return;
  form.scrollIntoView({ block: 'start' });
}

more.addEventListener('click', () => {
  if (more.getAttribute('aria-disabled') === 'true' || nextBefore === null) return;
  void load(nextBefore);
});
retry.addEventListener('click', () => void load(list.childElementCount === 0 ? null : nextBefore));

// Formulaire

const fields = { author, body, page: subject } as const;
type FieldName = keyof typeof fields;
const isField = (name: string): name is FieldName => Object.hasOwn(fields, name);

function setFieldError(name: FieldName, message: string): void {
  const field = fields[name];
  const error = byId(`${field.id}-error`, HTMLElement);
  error.textContent = message;
  error.hidden = message === '';
  if (message === '') field.removeAttribute('aria-invalid');
  else field.setAttribute('aria-invalid', 'true');
}

/** Pose chaque message sous son champ et met le curseur dans le premier champ en faute. Renvoie ce qui n'a pas de champ. */
function showErrors(messages: Record<string, string>): string[] {
  const others: string[] = [];
  let first: HTMLElement | undefined;
  for (const [path, message] of Object.entries(messages)) {
    if (isField(path)) {
      setFieldError(path, message);
      first ??= fields[path];
    } else {
      others.push(message);
    }
  }
  first?.focus();
  return others;
}

function updateCounter(): void {
  const count = countCharacters(body.value);
  counter.textContent = `${count} / ${BODY_MAX}`;
  counter.toggleAttribute('data-over', count > BODY_MAX);
}

for (const name of Object.keys(fields) as FieldName[]) {
  fields[name].addEventListener('input', () => setFieldError(name, ''));
}
body.addEventListener('input', updateCounter);

let sending = false;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void send();
});

async function send(): Promise<void> {
  if (sending) return;
  for (const name of Object.keys(fields) as FieldName[]) setFieldError(name, '');
  const draft = { author: author.value, body: body.value };
  const missing = missingFields(draft);
  if (Object.keys(missing).length > 0) {
    showErrors(missing);
    setFormStatus(TEXT.invalid, 'problem');
    return;
  }

  sending = true;
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  submit.setAttribute('aria-disabled', 'true');
  const stop = waitingOn(setFormStatus, TEXT.sending);
  try {
    await api.post('/api/messages', { ...draft, page: subject.value === '' ? null : subject.value, website: website.value });
    stop();
    body.value = '';
    updateCounter();
    setFormStatus(TEXT.sent, 'done');
  } catch (caught) {
    stop();
    const error = asApiError(caught);
    if (error.code === 'VALIDATION') {
      const others = showErrors(fieldMessages(error.details));
      setFormStatus([TEXT.invalid, ...others].join(' '), 'problem');
    } else if (error.code === 'TOO_MANY_REQUESTS' || error.code === 'GUESTBOOK_FULL') {
      setFormStatus(error.message, 'problem');
    } else {
      setFormStatus(TEXT.notSent, 'problem');
    }
  } finally {
    sending = false;
    submit.removeAttribute('aria-disabled');
  }
}

// Arrivée depuis une démo : « Écrire sur cette démo » choisit déjà le sujet.
const wanted = subjectFromSearch(window.location.search, [...subjects.keys()]);
if (wanted !== null) subject.value = wanted;

// Le bouton est désactivé dans le HTML : sans ce script, le formulaire ne partirait nulle part.
submit.disabled = false;
updateCounter();
void load(null);

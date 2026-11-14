// Livre d'or : fabrication des éléments affichés. Tout passe par textContent : jamais de innerHTML (SPEC §B8).
import type { Message } from '../../../../api/src/contract';
import { announce, h } from '../ui/dom';
import { formatDay } from './format';

/** Ce à quoi un message est rattaché : le nom affiché, et la page où aller voir. */
export interface Subject {
  label: string;
  href: string;
}

/** Les rattachements connus de la page, lus dans les options du formulaire (ou fournis par le bloc d'une démo). */
export type Subjects = ReadonlyMap<string, Subject>;

function day(iso: string, className: string): HTMLTimeElement {
  return h('time', { class: className, text: formatDay(iso), attrs: { datetime: iso } });
}

/** Un message publié, avec la réponse de Mathieu s'il y en a une. `showSubject` : afficher ce dont il parle. */
export function messageCard(message: Message, subjects: Subjects, showSubject: boolean): HTMLLIElement {
  const head = h('header', { class: 'message-head' }, [
    h('span', { class: 'message-author', text: message.author }),
    day(message.createdAt, 'message-date'),
  ]);
  // Un rattachement que cette version du site ne connaît plus est simplement tu.
  const subject = showSubject && message.page !== null ? subjects.get(message.page) : undefined;
  if (subject) {
    head.append(
      h('a', { class: 'tag message-subject', attrs: { href: subject.href } }, [
        h('span', { class: 'visually-hidden', text: 'À propos de ' }),
        subject.label,
      ]),
    );
  }

  const card = h('li', { class: 'message plate', attrs: { 'data-message-id': String(message.id) } }, [
    head,
    h('p', { class: 'message-body', text: message.body }),
  ]);

  if (message.reply) {
    card.append(
      h('div', { class: 'message-reply' }, [
        h('p', { class: 'message-reply-head' }, [
          h('span', { class: 'message-reply-author tube-soft', text: 'Mathieu' }),
          day(message.reply.repliedAt, 'message-date'),
        ]),
        h('p', { class: 'message-body', text: message.reply.body }),
      ]),
    );
  }
  return card;
}

export type StatusState = 'waiting' | 'quiet' | 'problem' | 'done';
export type StatusWriter = (text: string, state?: StatusState) => void;

/**
 * La ligne d'état d'un bloc : un voyant et une phrase. Vide, la ligne disparaît. Le texte est aussi écrit dans une
 * zone role="status" toujours présente dans la page, pour qu'un lecteur d'écran l'annonce à coup sûr.
 */
export function statusWriter(line: HTMLElement, live: HTMLElement): StatusWriter {
  return (text, state = 'quiet') => {
    line.textContent = text;
    line.dataset.state = state;
    line.hidden = text === '';
    announce(live, text);
  };
}

// Ce que les tests font à l'API sans passer par les pages : préparer des messages, jouer l'administrateur.
// Le compte de test est créé par e2e/stack.mjs, qui note son mot de passe dans .e2e/admin.json (ignoré par git).
import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext } from '@playwright/test';

export interface Credentials {
  login: string;
  password: string;
}

export function adminCredentials(): Credentials {
  return JSON.parse(readFileSync(new URL('../.e2e/admin.json', import.meta.url), 'utf8')) as Credentials;
}

const part = () => 1 + Math.floor(Math.random() * 250);
/** Une adresse inventée, propre à un test ou à une requête : l'API compte ses limites par adresse. */
export const fakeAddress = (): string => `10.${part()}.${part()}.${part()}`;

/** Un pseudo que ce test est seul à utiliser : les tests partagent la même base. */
export const uniqueName = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export interface NewMessage {
  author: string;
  body: string;
  page?: string | null;
}

interface AdminMessage {
  id: number;
  author: string;
  body: string;
  page: string | null;
  status: 'pending' | 'published';
  reply: { body: string } | null;
}

/** Envoie un message comme le ferait un visiteur, sans le formulaire. */
export async function sendMessage(request: APIRequestContext, message: NewMessage): Promise<void> {
  const response = await request.post('/api/messages', { data: message, headers: { 'x-e2e-client': fakeAddress() } });
  expect(response.status(), 'envoi du message').toBe(201);
}

/** Ouvre une session d'administrateur dans ce contexte de requêtes (pas dans le navigateur). */
export async function loginAdmin(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/admin/login', { data: adminCredentials(), headers: { 'x-e2e-client': fakeAddress() } });
  expect(response.status(), 'connexion de l’administrateur').toBe(204);
}

export async function adminList(request: APIRequestContext, status: 'pending' | 'published'): Promise<AdminMessage[]> {
  const response = await request.get(`/api/admin/messages?status=${status}`);
  expect(response.status(), 'liste de modération').toBe(200);
  return ((await response.json()) as { messages: AdminMessage[] }).messages;
}

/** Les messages en attente de ce pseudo. */
export async function pendingOf(request: APIRequestContext, author: string): Promise<AdminMessage[]> {
  return (await adminList(request, 'pending')).filter((message) => message.author === author);
}

export async function publish(request: APIRequestContext, id: number): Promise<void> {
  expect((await request.post(`/api/admin/messages/${id}/publish`)).status(), 'publication').toBe(200);
}

/** Envoie des messages puis les publie, dans l'ordre donné. Renvoie leurs identifiants. Session d'administrateur requise. */
export async function publishNew(request: APIRequestContext, messages: NewMessage[]): Promise<number[]> {
  for (const message of messages) await sendMessage(request, message);
  const pending = await adminList(request, 'pending');
  const ids: number[] = [];
  for (const message of messages) {
    const found = pending.find((candidate) => candidate.author === message.author && candidate.body === message.body);
    expect(found, `message de ${message.author} en attente`).toBeDefined();
    await publish(request, found!.id);
    ids.push(found!.id);
  }
  return ids;
}

export async function reply(request: APIRequestContext, id: number, body: string): Promise<void> {
  expect((await request.put(`/api/admin/messages/${id}/reply`, { data: { body } })).status(), 'réponse').toBe(200);
}

export async function remove(request: APIRequestContext, id: number): Promise<void> {
  expect((await request.delete(`/api/admin/messages/${id}`)).status(), 'suppression').toBe(204);
}

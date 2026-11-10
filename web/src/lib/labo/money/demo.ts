// Démo « Qui doit quoi » : les membres, les opérations, les soldes, les remboursements suggérés et leur schéma.
// Les calculs sont dans ledger.ts et cents.ts. Rien n'est enregistré : tout vit dans la page.
import { announce, byId, h } from '../../ui/dom';
import { createGlowSprite, drawGlow } from '../../ui/glow';
import { startLoop } from '../../ui/loop';
import { createStage, type Stage } from '../../ui/stage';
import { onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette, type Rgb } from '../../ui/theme';
import { formatEuros, parseAmount, type Cents } from './cents';
import {
  computeBalances,
  computeSettlements,
  splitEqually,
  type BalanceLine,
  type Expense,
  type Settlement,
} from './ledger';

interface Member {
  id: number;
  name: string;
}

interface Operation extends Expense {
  /** Un remboursement enregistré depuis une suggestion, et non une dépense. */
  payment: boolean;
}

const MAX_MEMBERS = 6;
const MIN_MEMBERS = 2;
const MAX_OPERATIONS = 40;
/** Prénoms inventés, proposés dans l'ordre aux nouveaux membres. */
const NAMES = ['Lina', 'Sacha', 'Noé', 'Maël', 'Inès', 'Tom'];

const canvas = byId('ledger-canvas', HTMLCanvasElement);
const stageElement = byId('ledger-stage', HTMLDivElement);
const status = byId('ledger-status', HTMLParagraphElement);
const balancesList = byId('ledger-balances', HTMLUListElement);
const sumOutput = byId('ledger-sum', HTMLParagraphElement);
const settlementsList = byId('ledger-settlements', HTMLUListElement);
const operationsList = byId('ledger-operations', HTMLUListElement);
const form = byId('ledger-form', HTMLFormElement);
const labelInput = byId('ledger-label', HTMLInputElement);
const amountInput = byId('ledger-amount', HTMLInputElement);
const amountError = byId('ledger-amount-error', HTMLParagraphElement);
const payerSelect = byId('ledger-payer', HTMLSelectElement);
const whoList = byId('ledger-who', HTMLDivElement);
const whoError = byId('ledger-who-error', HTMLParagraphElement);
const membersBox = byId('ledger-members', HTMLDivElement);
const memberError = byId('ledger-member-error', HTMLParagraphElement);
const addMemberButton = byId('ledger-add-member', HTMLButtonElement);
const removeMemberButton = byId('ledger-remove-member', HTMLButtonElement);
const resetButton = byId('ledger-reset', HTMLButtonElement);
const clearButton = byId('ledger-clear', HTMLButtonElement);

let members: Member[] = [];
let operations: Operation[] = [];
let nextMemberId = 1;
let nextOperationId = 1;
let balances: BalanceLine[] = [];
let settlements: Settlement[] = [];

let palette: Palette = readPalette();
let tubeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
let phosphorGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
let paletteSettlesAt = 0;
let phase = 0;

// Textes

function nameOf(id: number): string {
  return members.find((member) => member.id === id)?.name ?? 'Quelqu’un';
}

/** « Lina », « Lina et Sacha », « Lina, Sacha et Noé ». */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

function describe(operation: Operation): string {
  const payer = nameOf(operation.paidBy);
  if (operation.payment) return `${payer} a remboursé ${nameOf(operation.shares[0]?.memberId ?? 0)}.`;
  const everyone = operation.shares.length === members.length;
  const who = everyone ? 'tout le monde' : joinNames(operation.shares.map((share) => nameOf(share.memberId)));
  const amounts = operation.shares.map((share) => share.amount);
  const equal = amounts.every((amount) => amount === amounts[0]);
  const parts =
    operation.shares.length === 1
      ? ''
      : equal
        ? ` ${formatEuros(amounts[0] ?? 0)} chacun.`
        : ` Parts : ${joinNames(amounts.map((amount) => formatEuros(amount)))}.`;
  return `Payé par ${payer}, pour ${who}.${parts}`;
}

// État

function loadExample(): void {
  nextMemberId = 1;
  nextOperationId = 1;
  members = NAMES.slice(0, 4).map((name) => ({ id: nextMemberId++, name }));
  const [lina, sacha, noe, mael] = members.map((member) => member.id) as [number, number, number, number];
  const everyone = [lina, sacha, noe, mael];
  operations = [
    { ...splitEqually(nextOperationId++, 'Courses', 8460, lina, everyone), payment: false },
    { ...splitEqually(nextOperationId++, 'Essence', 5000, sacha, [lina, sacha, noe]), payment: false },
    { ...splitEqually(nextOperationId++, 'Restaurant', 9600, noe, everyone), payment: false },
    { ...splitEqually(nextOperationId++, 'Café', 730, mael, [noe, mael]), payment: false },
  ];
}

function involved(memberId: number): boolean {
  return operations.some(
    (operation) => operation.paidBy === memberId || operation.shares.some((share) => share.memberId === memberId),
  );
}

// Rendu des listes

function renderBalances(): void {
  const largest = Math.max(1, ...balances.map((line) => Math.abs(line.balance)));
  balancesList.replaceChildren(
    ...balances.map((line) => {
      const fill = h('span', {
        class: line.balance > 0 ? 'ledger-bar-fill is-owed' : line.balance < 0 ? 'ledger-bar-fill is-owing' : 'ledger-bar-fill',
      });
      const half = (Math.abs(line.balance) / largest) * 50;
      // La barre part du milieu : vers la droite si on lui doit, vers la gauche s'il doit.
      requestAnimationFrame(() => {
        fill.style.setProperty('width', `${half}%`);
        if (line.balance < 0) fill.style.setProperty('left', `${50 - half}%`);
      });
      const text = h('span', { class: 'ledger-balance-text' });
      if (line.balance > 0) text.append('doit recevoir ', h('b', { text: formatEuros(line.balance) }));
      else if (line.balance < 0) text.append('doit ', h('b', { text: formatEuros(-line.balance) }));
      else text.append('à l’équilibre');
      return h('li', { class: 'ledger-balance' }, [
        h('span', { class: 'ledger-balance-name', text: nameOf(line.memberId) }),
        ' ',
        text,
        h('span', { class: 'ledger-bar', attrs: { 'aria-hidden': 'true' } }, [fill]),
      ]);
    }),
  );
  const sum = balances.reduce((total, line) => total + line.balance, 0);
  sumOutput.textContent = `Somme des soldes : ${formatEuros(sum)}. Elle vaut toujours zéro.`;
}

function renderSettlements(): void {
  if (settlements.length === 0) {
    settlementsList.replaceChildren(
      h('li', {
        class: 'ledger-even',
        text:
          operations.length === 0
            ? 'Aucune opération : ajouter une dépense pour commencer.'
            : 'Rien à rembourser : tout le monde est à l’équilibre.',
      }),
    );
    return;
  }
  settlementsList.replaceChildren(
    ...settlements.map((settlement) => {
      const from = nameOf(settlement.from);
      const to = nameOf(settlement.to);
      const done = h('button', {
        class: 'btn btn-small',
        text: 'C’est fait',
        attrs: {
          type: 'button',
          'aria-label': `C’est fait : ${from} a remboursé ${formatEuros(settlement.amount)} à ${to}`,
        },
      });
      done.addEventListener('click', () => {
        if (operations.length >= MAX_OPERATIONS) return;
        operations.push({
          id: nextOperationId++,
          label: 'Remboursement',
          amount: settlement.amount,
          paidBy: settlement.from,
          shares: [{ memberId: settlement.to, amount: settlement.amount }],
          payment: true,
        });
        refresh(`Remboursement enregistré : ${from} a versé ${formatEuros(settlement.amount)} à ${to}.`);
      });
      return h('li', { class: 'ledger-settlement' }, [
        h('span', {}, [`${from} rembourse `, h('b', { text: formatEuros(settlement.amount) }), ` à ${to}`]),
        done,
      ]);
    }),
  );
}

function renderOperations(): void {
  if (operations.length === 0) {
    operationsList.replaceChildren(h('li', { class: 'ledger-even', text: 'La liste est vide.' }));
    return;
  }
  operationsList.replaceChildren(
    ...operations.map((operation) => {
      const remove = h('button', {
        class: 'btn btn-quiet btn-small',
        text: 'Retirer',
        attrs: { type: 'button', 'aria-label': `Retirer ${operation.label}, ${formatEuros(operation.amount)}` },
      });
      remove.addEventListener('click', () => {
        operations = operations.filter((candidate) => candidate.id !== operation.id);
        refresh(`${operation.label} retiré.`);
      });
      // Dans l'ordre de lecture : le libellé, le montant, le détail, puis le bouton (la grille le place à droite).
      return h('li', { class: 'ledger-operation' }, [
        h('span', { class: 'ledger-operation-label', text: operation.label }),
        ' ',
        h('span', { class: 'ledger-operation-amount', text: formatEuros(operation.amount) }),
        ' ',
        h('span', { class: 'ledger-operation-detail', text: describe(operation) }),
        ' ',
        remove,
      ]);
    }),
  );
}

/** Le formulaire suit la liste des membres. Les choix déjà faits sont conservés quand c'est possible. */
function renderForm(): void {
  const payer = Number(payerSelect.value);
  const unchecked = new Set(
    [...whoList.querySelectorAll<HTMLInputElement>('input')].filter((input) => !input.checked).map((input) => Number(input.value)),
  );
  payerSelect.replaceChildren(
    ...members.map((member) => h('option', { text: member.name, attrs: { value: String(member.id) } })),
  );
  if (members.some((member) => member.id === payer)) payerSelect.value = String(payer);
  whoList.replaceChildren(
    ...members.map((member) => {
      const box = h('input', { attrs: { type: 'checkbox', value: String(member.id) } });
      box.checked = !unchecked.has(member.id);
      return h('label', { class: 'ledger-check' }, [box, member.name]);
    }),
  );
}

function renderMembers(): void {
  membersBox.replaceChildren(
    ...members.map((member, index) => {
      const input = h('input', {
        class: 'input',
        attrs: { type: 'text', maxlength: '14', autocomplete: 'off', 'aria-label': `Prénom du membre ${index + 1}` },
      });
      input.value = member.name;
      input.addEventListener('input', () => {
        member.name = input.value.trim() || NAMES[index] || `Membre ${index + 1}`;
        // Le champ garde le focus : seuls les textes qui citent le prénom sont refaits.
        renderForm();
        renderBalances();
        renderSettlements();
        renderOperations();
      });
      return input;
    }),
  );
  addMemberButton.disabled = members.length >= MAX_MEMBERS;
  removeMemberButton.disabled = members.length <= MIN_MEMBERS;
}

function compute(): void {
  balances = computeBalances(
    members.map((member) => member.id),
    operations,
  );
  settlements = computeSettlements(balances);
}

function refresh(message?: string): void {
  compute();
  renderBalances();
  renderSettlements();
  renderOperations();
  if (message) announce(status, message);
  loop.redraw();
}

// Schéma : les membres en cercle, une flèche par remboursement suggéré, des points de lumière qui la parcourent.

interface Point {
  x: number;
  y: number;
}

function nodePositions(stage: Stage): Map<number, Point> {
  const positions = new Map<number, Point>();
  const rx = Math.min(stage.width * 0.36, 300);
  const ry = Math.min(stage.height * 0.33, 150);
  members.forEach((member, index) => {
    const angle = -Math.PI / 2 + (index / members.length) * Math.PI * 2;
    positions.set(member.id, {
      x: stage.width / 2 + Math.cos(angle) * rx,
      y: stage.height / 2 - 8 + Math.sin(angle) * ry,
    });
  });
  return positions;
}

function curvePoint(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

function draw(stage: Stage): void {
  const { ctx } = stage;
  const lit = tubesOn();
  if (performance.now() < paletteSettlesAt) {
    palette = readPalette();
    tubeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
    phosphorGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(palette.wall);
  ctx.fillRect(0, 0, stage.width, stage.height);

  const positions = nodePositions(stage);
  const radius = Math.max(17, Math.min(26, stage.width / 22));
  const largest = Math.max(1, ...settlements.map((settlement) => settlement.amount));
  ctx.lineCap = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const settlement of settlements) {
    const a = positions.get(settlement.from);
    const b = positions.get(settlement.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    // La flèche part du bord d'un rond et arrive au bord de l'autre, en s'arquant d'un même côté.
    const from = { x: a.x + (dx / length) * (radius + 4), y: a.y + (dy / length) * (radius + 4) };
    const to = { x: b.x - (dx / length) * (radius + 9), y: b.y - (dy / length) * (radius + 9) };
    const control = { x: (from.x + to.x) / 2 - (dy / length) * length * 0.16, y: (from.y + to.y) / 2 + (dx / length) * length * 0.16 };
    const weight = 1.4 + (settlement.amount / largest) * 1.8;
    const ink: Rgb = lit ? palette.tube : palette.frost;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
    if (lit) {
      ctx.lineWidth = weight + 6;
      ctx.strokeStyle = rgba(palette.halo, 0.22);
      ctx.stroke();
    }
    ctx.lineWidth = weight;
    ctx.strokeStyle = rgba(ink, 0.9);
    ctx.stroke();

    // La pointe de la flèche, dans l'axe de l'arrivée.
    const before = curvePoint(from, control, to, 0.94);
    const angle = Math.atan2(to.y - before.y, to.x - before.x);
    ctx.beginPath();
    ctx.moveTo(to.x + Math.cos(angle) * 6, to.y + Math.sin(angle) * 6);
    ctx.lineTo(to.x + Math.cos(angle + 2.5) * 8, to.y + Math.sin(angle + 2.5) * 8);
    ctx.lineTo(to.x + Math.cos(angle - 2.5) * 8, to.y + Math.sin(angle - 2.5) * 8);
    ctx.closePath();
    ctx.fillStyle = rgba(ink);
    ctx.fill();

    // L'argent qui circule : trois points de lumière, du débiteur vers le créancier.
    if (lit) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const point = curvePoint(from, control, to, (phase + k / 3) % 1);
        drawGlow(ctx, phosphorGlow, point.x, point.y, 9);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Le montant, au milieu de la flèche.
    const middle = curvePoint(from, control, to, 0.5);
    const label = formatEuros(settlement.amount);
    ctx.font = '600 13px "Atkinson Mono", ui-monospace, monospace';
    const width = ctx.measureText(label).width + 12;
    ctx.fillStyle = rgba(palette.wall, 0.88);
    ctx.fillRect(middle.x - width / 2, middle.y - 10, width, 20);
    ctx.fillStyle = rgba(palette.chalk);
    ctx.fillText(label, middle.x, middle.y + 1);
  }

  for (const line of balances) {
    const p = positions.get(line.memberId);
    if (!p) continue;
    const color: Rgb = !lit ? palette.frost : line.balance > 0 ? palette.tube : line.balance < 0 ? palette.phosphor : palette.frost;
    if (lit && line.balance !== 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, line.balance > 0 ? tubeGlow : phosphorGlow, p.x, p.y, radius * 2.1);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = rgba(palette.wall);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = rgba(color);
    ctx.stroke();

    const name = nameOf(line.memberId);
    ctx.font = `${Math.round(radius * 0.86)}px "Tilt Neon", "Arial Rounded MT Bold", sans-serif`;
    ctx.fillStyle = rgba(lit ? palette.core : palette.chalk);
    ctx.fillText(name.slice(0, 1).toLocaleUpperCase('fr'), p.x, p.y + 1);

    ctx.font = '600 13px "Atkinson Next", system-ui, sans-serif';
    ctx.fillStyle = rgba(palette.chalk);
    ctx.fillText(name, p.x, p.y + radius + 14);
    // Le solde sous le prénom, sauf sur un schéma étroit : la liste des soldes est juste en dessous.
    if (stage.width >= 480) {
      ctx.font = '12px "Atkinson Mono", ui-monospace, monospace';
      ctx.fillStyle = rgba(palette.chalkSoft);
      const amount: Cents = line.balance;
      ctx.fillText(amount === 0 ? '0' : `${amount > 0 ? '+' : ''}${formatEuros(amount)}`, p.x, p.y + radius + 30);
    }
  }

  if (settlements.length === 0 && operations.length > 0) {
    ctx.font = '22px "Tilt Neon", "Arial Rounded MT Bold", sans-serif';
    ctx.fillStyle = rgba(lit ? palette.tube : palette.frost);
    ctx.fillText('À l’équilibre', stage.width / 2, stage.height / 2 - 8);
  }
}

const hooks = { redraw: (): void => {} };
const stage = createStage(canvas, () => hooks.redraw());

const loop = startLoop({
  element: stageElement,
  startPaused: prefersReducedMotion(),
  frame(dt) {
    phase = (phase + dt * 0.32) % 1;
    draw(stage);
  },
});

hooks.redraw = () => loop.redraw();

// Formulaire et commandes

form.addEventListener('submit', (event) => {
  event.preventDefault();
  amountError.textContent = '';
  whoError.textContent = '';
  amountInput.setAttribute('aria-invalid', 'false');

  const amount = parseAmount(amountInput.value);
  const participants = [...whoList.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => Number(input.value));
  if (amount === null) {
    amountInput.setAttribute('aria-invalid', 'true');
    amountError.textContent = 'Un montant de 0,01 € à 100 000 €, avec deux décimales au plus.';
    amountInput.focus();
    return;
  }
  if (participants.length === 0) {
    whoError.textContent = 'Cocher au moins une personne.';
    return;
  }
  if (amount < participants.length) {
    amountInput.setAttribute('aria-invalid', 'true');
    amountError.textContent = `Trop peu pour être partagé entre ${participants.length} personnes : il faut un centime chacune.`;
    amountInput.focus();
    return;
  }
  if (operations.length >= MAX_OPERATIONS) {
    amountError.textContent = `La liste est pleine : ${MAX_OPERATIONS} opérations au plus.`;
    return;
  }

  const label = labelInput.value.trim() || 'Dépense';
  operations.push({ ...splitEqually(nextOperationId++, label, amount, Number(payerSelect.value), participants), payment: false });
  labelInput.value = '';
  amountInput.value = '';
  refresh(`Dépense ajoutée : ${label}, ${formatEuros(amount)}.`);
});

addMemberButton.addEventListener('click', () => {
  if (members.length >= MAX_MEMBERS) return;
  memberError.textContent = '';
  const used = new Set(members.map((member) => member.name));
  const name = NAMES.find((candidate) => !used.has(candidate)) ?? `Membre ${members.length + 1}`;
  members.push({ id: nextMemberId++, name });
  renderMembers();
  renderForm();
  refresh(`${name} rejoint le groupe.`);
});

removeMemberButton.addEventListener('click', () => {
  const last = members[members.length - 1];
  if (!last || members.length <= MIN_MEMBERS) return;
  if (involved(last.id)) {
    memberError.textContent = `${last.name} figure dans une opération : la retirer d'abord.`;
    return;
  }
  memberError.textContent = '';
  members.pop();
  renderMembers();
  renderForm();
  refresh(`${last.name} quitte le groupe.`);
});

resetButton.addEventListener('click', () => {
  loadExample();
  memberError.textContent = '';
  renderMembers();
  renderForm();
  refresh('Exemple rechargé : quatre membres, quatre dépenses.');
});

clearButton.addEventListener('click', () => {
  operations = [];
  memberError.textContent = '';
  refresh('Toutes les opérations sont effacées.');
});

onThemeChange(() => {
  paletteSettlesAt = performance.now() + 1100;
  if (!loop.playing) {
    const follow = (): void => {
      loop.redraw();
      if (performance.now() < paletteSettlesAt) requestAnimationFrame(follow);
    };
    follow();
  }
});

loadExample();
renderMembers();
renderForm();
refresh();

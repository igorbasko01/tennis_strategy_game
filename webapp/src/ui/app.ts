import { duelVerdict, type FactorId } from '../engine/verdict';
import { ONLINE_SKILL, replayRng, type ResolvedExchange } from '../engine/online';
import { api, ApiError, CUP_ROUND_NAMES, displayName, inviteLink, loadIdentity, saveIdentity, type Cup, type MatchmakingResult, type MatchView } from '../online/client';
import {
  ATTACK_ACTIONS,
  ATTACK_COST,
  ATTACK_HINT,
  ATTACK_LABEL,
  DEFEND_MODIFIER,
  SERVE_ACTIONS,
  SERVE_COST,
  SERVE_HINT,
  SERVE_LABEL,
  SERVE_RECEIVE_ACTIONS,
  SERVE_RECEIVE_HINT,
  SERVE_RECEIVE_LABEL,
  SERVE_RECEIVE_MODIFIER,
} from '../engine/actions';
import { FULL_ENERGY } from '../engine/energy';
import { Match, type ExchangeOutcome } from '../engine/match';
import { other, type Calculation, type Choice, type Duel, type PlayerIndex } from '../engine/resolution';
import { MATCH_SCORING, type ScoringConfig } from '../engine/scoring';
import { STYLES, STYLE_IDS, type StyleId } from '../engine/styles';
import type { DecisionKind } from '../scene/layout';
import { CourtScene } from '../scene/scene';
import { Sound } from './sound';


interface Settings {
  muted: boolean;
  /** Whether each shot's number breakdown starts expanded. */
  showBreakdown: boolean;
}


const SETTINGS_KEY = 'tennis-strategy-settings';
const DEFAULT_SETTINGS: Settings = { muted: false, showBreakdown: false };

const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return { muted: saved.muted === true, showBreakdown: saved.showBreakdown === true };
    }
  } catch {
    // Storage can be unavailable (private mode); defaults are fine.
  }
  return { ...DEFAULT_SETTINGS };
};

const saveSettings = (s: Settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

/** Everything needed to start (or restart) a match. */
interface MatchSetup {
  names: [string, string];
  skills: [number, number];
  scoring: ScoringConfig;
  /** How the CPU opponent plays. */
  cpuStyle: StyleId;
  /** Energy going in: [you, opponent]. Full, except in an Online Cup where it carries between rounds. */
  energy: [number, number];
  /** Set for a match against a real person over the network. */
  online?: OnlineSession;
}

/** A live online match: the server decides each exchange; the browser mirrors it as player 0. */
interface OnlineSession {
  id: string;
  token: string;
  firstServer: PlayerIndex;
  /** Exchanges this browser has played so far. */
  played: number;
  /** Exchanges already played before this browser (re)joined, replayed instantly at the start. */
  backlog: ResolvedExchange[];
  /** True when our choice for the current exchange was sent before a reload. */
  locked: boolean;
  /** The latest view of the match from the server. */
  view: MatchView;
}

const POLL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const fmt = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
const fmtRating = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n);
const fmt1 = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface OptionDef {
  id: string;
  label: string;
  meta: string;
  hint: string;
}

interface GroupDef {
  key: 'target' | 'read';
  title: string;
  options: OptionDef[];
}

const serveTargetOptions = (): OptionDef[] =>
  SERVE_ACTIONS.map((a) => ({ id: a, label: SERVE_LABEL[a], meta: `risk ${fmt1(SERVE_COST[a])}`, hint: SERVE_HINT[a] }));

const attackTargetOptions = (): OptionDef[] =>
  ATTACK_ACTIONS.map((a) => ({ id: a, label: ATTACK_LABEL[a], meta: `risk ${fmt1(ATTACK_COST[a])}`, hint: ATTACK_HINT[a] }));

const serveReadOptions = (): OptionDef[] =>
  SERVE_RECEIVE_ACTIONS.map((r) => ({
    id: r,
    label: SERVE_RECEIVE_LABEL[r],
    meta: `${fmt1(Math.max(...SERVE_ACTIONS.map((s) => SERVE_RECEIVE_MODIFIER[s][r])))} if right`,
    hint: SERVE_RECEIVE_HINT[r],
  }));

const defendReadOptions = (): OptionDef[] =>
  ATTACK_ACTIONS.map((d) => ({
    id: d,
    label: ATTACK_LABEL[d],
    meta: `${fmt1(DEFEND_MODIFIER[d][d])} if right`,
    hint: `Cover the ${ATTACK_LABEL[d].toLowerCase()}`,
  }));

const shotLabel = (duel: Duel) =>
  duel.kind === 'serve' ? SERVE_LABEL[duel.shot as keyof typeof SERVE_LABEL] : ATTACK_LABEL[duel.shot as keyof typeof ATTACK_LABEL];

const readLabel = (duel: Duel) =>
  duel.kind === 'serve'
    ? SERVE_RECEIVE_LABEL[duel.read as keyof typeof SERVE_RECEIVE_LABEL]
    : ATTACK_LABEL[duel.read as keyof typeof ATTACK_LABEL];

export class App {
  private settings = loadSettings();
  private readonly scene: CourtScene;
  private readonly sound = new Sound();
  private match: Match | null = null;
  private names: [string, string] = ['You', 'CPU'];
  private setup: MatchSetup | null = null;
  /** Bumped whenever a match is abandoned so stale async flows stop. */
  private generation = 0;
  private markerTap: ((id: string) => void) | null = null;
  private identity = loadIdentity();
  /** A match code from an invite link, joined once the player has an identity. */
  private pendingJoin: string | null = null;
  /** Bumped to stop the online screens' background polling. */
  private onlineGen = 0;
  /** An unfinished online match found on the server, offered for resuming. */
  private activeOnline: MatchView | null = null;
  /** The player's Online Cup in progress, if any. */
  private activeCup: Cup | null = null;

  constructor() {
    this.scene = new CourtScene($('#stage'));
    this.scene.onHit = (p) => this.sound.hit(p);
    this.scene.onBounce = () => this.sound.bounce();
    this.scene.onMarkerTap = (id) => this.markerTap?.(id);
    this.sound.muted = this.settings.muted;

    void this.scene.resetPoint(0, 'deuce', false);
    this.bindMenu();
    this.renderHelp();
    this.renderScoreboard();

    void this.checkActiveOnline();

    // An invite link (?join=CODE) opens straight into joining that match.
    const joinCode = new URLSearchParams(window.location.search).get('join');
    if (joinCode) {
      history.replaceState(null, '', window.location.pathname);
      this.pendingJoin = joinCode.toUpperCase();
      this.renderOnline();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (document.querySelector('.overlay:not(.hidden)')) return;
      const target = $('#panel').querySelector<HTMLButtonElement>('.primary:not([disabled])');
      if (target) {
        e.preventDefault();
        target.click();
      }
    });
  }

  // ---------------------------------------------------------------- menu

  private bindMenu(): void {
    const menu = $('#menu');
    menu.querySelector('[data-act="online"]')!.addEventListener('click', () => {
      this.sound.unlock();
      this.renderOnline();
    });
    $('#resume').addEventListener('click', () => this.showScreen(null));
    $('#resume-online').addEventListener('click', () => void this.resumeOnline());
    $('#resign').addEventListener('click', () => void this.resignOnline());
    for (const b of document.querySelectorAll('[data-open-help]')) {
      b.addEventListener('click', () => $('#help').classList.remove('hidden'));
    }
    $('[data-close-help]').addEventListener('click', () => $('#help').classList.add('hidden'));
    $('#help').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) $('#help').classList.add('hidden');
    });
  }

  /** Shows one full-screen overlay (or none, to reveal the match). */
  private showScreen(screen: 'menu' | 'over' | 'online' | null): void {
    for (const id of ['menu', 'over', 'online']) $(`#${id}`).classList.toggle('hidden', id !== screen);
    const playing = !!(this.match && !this.match.isOver);
    $('#resume').classList.toggle('hidden', !playing);
    $('#resign').classList.toggle('hidden', !(playing && this.setup?.online));
    const resumable = !playing && this.activeOnline;
    $('#resume-online').classList.toggle('hidden', !resumable);
    if (resumable) $('#resume-online').textContent = `Resume online match vs ${this.activeOnline!.opponent?.nickname ?? 'opponent'}`;
  }

  // ---------------------------------------------------------------- match flow

  private startMatch(setup: MatchSetup): void {
    this.generation++;
    this.setup = setup;
    this.names = setup.names;
    const firstServer: PlayerIndex = setup.online ? setup.online.firstServer : Math.random() < 0.5 ? 0 : 1;
    this.match = new Match(
      [
        { name: setup.names[0], skill: setup.skills[0] },
        { name: setup.names[1], skill: setup.skills[1] },
      ],
      setup.scoring,
      firstServer,
      setup.energy,
    );
    const online = setup.online;
    if (online && online.backlog.length) {
      // Resuming: replay what was already played, instantly.
      for (const x of online.backlog) {
        this.match.submit(0, x.choices[0]);
        this.match.submit(1, x.choices[1]);
        this.match.resolve(replayRng(x.rolls));
      }
      online.played = online.backlog.length;
      online.backlog = [];
    }
    // Whatever match was on offer to resume, this one replaces it.
    if (online) this.activeOnline = null;
    this.showScreen(null);
    this.scene.animator.speed = 1;
    void this.scene.resetPoint(this.match.server, this.match.score.serveSide, false);
    this.renderScoreboard();
    if (online && online.played > 0) this.callout('Match resumed', `${this.names[0]} ${this.match.score.games[0]}–${this.match.score.games[1]} ${this.names[1]}`);
    else this.callout(`${this.names[firstServer]} to serve`, 'Coin toss');
    void this.run(this.generation);
  }

  private async run(gen: number): Promise<void> {
    const match = this.match!;
    const alive = () => gen === this.generation;
    while (alive() && !match.isOver) {
      const lockedBefore = this.setup?.online?.locked ?? false;
      if (this.setup?.online) this.setup.online.locked = false;
      const choice = lockedBefore ? null : await this.choose(0);
      if (!alive()) return;
      // The server resolves the exchange with its own dice; we replay it exactly.
      const online = this.setup!.online!;
      const resolved = await this.onlineExchange(gen, online, choice);
      if (!alive()) return;
      if (!resolved) {
        this.renderOnlineEnded(online.view);
        return;
      }
      match.submit(0, resolved.choices[0]);
      match.submit(1, resolved.choices[1]);

      const choices = [...match.lockedChoices] as [Choice, Choice];
      const outcome = match.resolve(replayRng(resolved.rolls));

      this.renderRevealing(choices);
      await this.scene.playExchange(outcome.exchange);
      if (!alive()) return;
      this.scene.animator.speed = 1;
      this.announce(outcome);
      this.renderScoreboard();
      await this.renderBreakdown(outcome);
      if (!alive()) return;

      if (outcome.event && !match.isOver) {
        this.scene.clearMarkers();
        await this.scene.resetPoint(match.server, match.score.serveSide, true);
      }
    }
    if (alive() && match.isOver) {
      if (this.setup?.online) await this.settleOnline(gen, this.setup.online);
      if (alive()) this.renderMatchOver();
    }
  }

  /** Lets player p pick both halves of their bundled decision. */
  private choose(p: PlayerIndex): Promise<Choice> {
    const match = this.match!;
    const kind = match.expectedChoice(p);
    const opp = this.names[other(p)];

    let heading: string;
    let groups: GroupDef[];
    let markerKind: DecisionKind;
    if (kind === 'server') {
      heading = 'Your serve';
      groups = [
        { key: 'target', title: 'Serve target', options: serveTargetOptions() },
        { key: 'read', title: `Cover ${opp}'s return`, options: defendReadOptions() },
      ];
      markerKind = 'server';
    } else if (kind === 'receiver') {
      heading = `Returning ${opp}'s serve`;
      groups = [
        { key: 'read', title: 'Read the serve', options: serveReadOptions() },
        { key: 'target', title: 'Return target', options: attackTargetOptions() },
      ];
      markerKind = 'receiver';
    } else {
      const striking = p === match.server;
      heading = striking ? 'Your shot' : `${opp} is on the ball`;
      const target: GroupDef = { key: 'target', title: striking ? 'Attack' : 'Counter-attack', options: attackTargetOptions() };
      const read: GroupDef = { key: 'read', title: striking ? `Cover ${opp}'s reply` : `Cover ${opp}'s attack`, options: defendReadOptions() };
      groups = striking ? [target, read] : [read, target];
      markerKind = striking ? 'striker' : 'defender';
    }

    const score = match.score;
    const context =
      match.phase === 'serve'
        ? `${score.serveSide === 'deuce' ? 'Deuce' : 'Ad'} court · ${score.pointLabel(match.server)}–${score.pointLabel(match.receiver)}`
        : `Rally · shot ${match.exchangeCount * 2 + 1}`;

    // Fresh root per decision so listeners from earlier decisions can't leak in.
    const panel = document.createElement('div');
    panel.className = 'panel-root';
    $('#panel').replaceChildren(panel);
    panel.innerHTML = `
      <div class="panel-head">
        <span class="role"><span class="player-dot p${p}"></span>${escapeHtml(heading)}</span>
        <span class="context">${escapeHtml(context)}</span>
      </div>
      ${groups
        .map(
          (g) => `
        <div class="group">
          <h3><span class="swatch ${g.key}"></span>${escapeHtml(g.title)}</h3>
          <div class="options n${g.options.length}">
            ${g.options
              .map(
                (o) => `
              <button class="opt ${g.key}" data-group="${g.key}" data-id="${o.id}" title="${escapeHtml(o.hint)}">
                <span class="opt-name">${escapeHtml(o.label)}</span>
                <span class="opt-meta">${escapeHtml(o.meta)}</span>
              </button>`,
              )
              .join('')}
          </div>
        </div>`,
        )
        .join('')}
      <button class="primary lock" disabled>Choose both</button>`;

    const selected: Record<'target' | 'read', string | null> = { target: null, read: null };
    const lock = panel.querySelector<HTMLButtonElement>('.lock')!;
    const refresh = () => {
      for (const b of panel.querySelectorAll<HTMLButtonElement>('.opt')) {
        const on = selected[b.dataset.group as 'target' | 'read'] === b.dataset.id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      // Each half of the decision moves the other's zones, so rebuild them on every change.
      this.scene.showMarkers(this.scene.decisionMarkers(p, markerKind, selected));
      const ids = new Set<string>();
      if (selected.target) ids.add(`target:${selected.target}`);
      if (selected.read) ids.add(`read:${selected.read}`);
      this.scene.highlightMarkers(ids);
      const ready = selected.target !== null && selected.read !== null;
      lock.disabled = !ready;
      lock.textContent = ready ? 'Lock in' : !selected.target && !selected.read ? 'Choose both' : `Choose ${selected.target ? groups.find((g) => g.key === 'read')!.title.toLowerCase() : 'a target'}`;
    };
    refresh();

    return new Promise((resolve) => {
      const pickOption = (group: 'target' | 'read', id: string) => {
        selected[group] = id;
        this.sound.unlock();
        refresh();
      };
      panel.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.opt');
        if (b) pickOption(b.dataset.group as 'target' | 'read', b.dataset.id!);
      });
      this.markerTap = (markerId) => {
        const [group, id] = markerId.split(':') as ['target' | 'read', string];
        pickOption(group, id);
      };
      lock.addEventListener('click', () => {
        if (!selected.target || !selected.read) return;
        this.markerTap = null;
        this.scene.clearMarkers();
        const t = selected.target;
        const r = selected.read;
        if (kind === 'server') resolve({ kind, serveTarget: t as never, anticipation: r as never });
        else if (kind === 'receiver') resolve({ kind, anticipation: r as never, returnTarget: t as never });
        else resolve({ kind, attack: t as never, anticipation: r as never });
      });
    });
  }

  // ---------------------------------------------------------------- online match

  /** Sends our choice, then waits until the server has resolved the exchange (or the match ended). */
  private async onlineExchange(gen: number, s: OnlineSession, choice: Choice | null): Promise<ResolvedExchange | null> {
    const alive = () => gen === this.generation;
    let failures = 0;
    // No choice means it was already sent before a reload: just wait for the result.
    let sent = choice === null;
    if (sent) this.renderOnlineWaiting();
    for (;;) {
      if (!alive()) return null;
      try {
        const view = sent || !choice ? await api.get(s.token, s.id, s.played) : await api.move(s.token, s.id, s.played, choice, s.played);
        sent = true;
        failures = 0;
        this.updateOnline(s, view);
        if (view.exchanges.length > 0) {
          s.played++;
          return view.exchanges[0];
        }
        if (view.status !== 'playing') return null;
        this.renderOnlineWaiting();
      } catch (e) {
        failures++;
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 409) {
          this.renderOnlineWaiting(e.message);
          return null;
        }
        this.renderOnlineWaiting(failures > 2 ? 'Reconnecting…' : undefined);
      }
      await sleep(failures ? Math.min(5000, POLL_MS * 2 ** failures) : POLL_MS);
    }
  }

  private updateOnline(s: OnlineSession, view: MatchView): void {
    s.view = view;
  }

  /** While waiting for the opponent's choice. */
  private renderOnlineWaiting(note?: string): void {
    $('#panel').innerHTML = `
      <div class="panel-head">
        <span class="role">Locked in</span>
      </div>
      <p class="waiting">${escapeHtml(note ?? `${this.names[1]} is choosing…`)}</p>`;
  }

  /** After the last exchange: waits for the server to record the result and the rating change. */
  private async settleOnline(gen: number, s: OnlineSession): Promise<void> {
    for (let i = 0; i < 10 && gen === this.generation && s.view.status === 'playing'; i++) {
      try {
        this.updateOnline(s, await api.get(s.token, s.id, s.played));
      } catch {
        // Keep what we have; the result screen still shows the score.
      }
      if (s.view.status === 'playing') await sleep(POLL_MS);
    }
    const me = s.view.you;
    if (this.identity && me && me.rating !== null) {
      this.identity = { ...this.identity, player: { ...this.identity.player, rating: me.rating } };
      saveIdentity(this.identity);
    }
  }

  /** The match ended without being played out: someone resigned. */
  private renderOnlineEnded(view: MatchView): void {
    const title = view.winner === null ? 'Match ended' : view.winner === 0 ? 'You win!' : `${this.names[1]} wins`;
    const why = view.resigned === 0 ? 'You resigned.' : view.resigned === 1 ? `${this.names[1]} resigned.` : '';
    this.renderOnlineCard(`
      <h2>${escapeHtml(title)}</h2>
      ${why ? `<p class="tagline">${escapeHtml(why)}</p>` : ''}
      ${view.ratingChange === null ? '' : `<p class="tagline">Online rating ${fmtRating(view.ratingChange)}</p>`}
      ${view.cup ? '<button class="primary big" data-act="cup-home">Back to the Cup</button>' : '<button class="primary big" data-act="online-home">Back to online</button>'}
      <button class="ghost" data-act="menu">Main menu</button>`);
    $('#online').querySelector('[data-act="cup-home"]')?.addEventListener('click', () => void this.openCup(view.cup!.id));
    this.match = null;
    $('#panel').innerHTML = '';
  }

  /** Looks on the server for an unfinished online match to offer resuming. */
  private async checkActiveOnline(): Promise<void> {
    if (!this.identity) return;
    try {
      this.activeOnline = (await api.active(this.identity.token)).match;
    } catch {
      this.activeOnline = null;
    }
    if (!$('#menu').classList.contains('hidden')) this.showScreen('menu');
  }

  /** Resumes the unfinished match, checking with the server first that it is still unfinished. */
  private async resumeOnline(): Promise<void> {
    const id = this.identity;
    if (!id) return;
    this.sound.unlock();
    let view: MatchView | null;
    try {
      view = (await api.active(id.token)).match;
    } catch (e) {
      this.renderOnline((e as Error).message);
      return;
    }
    this.activeOnline = view;
    if (!view) {
      this.renderOnline('That match has already ended.');
      return;
    }
    this.startOnlineMatch(view, id.token, true);
  }

  private async resignOnline(): Promise<void> {
    const s = this.setup?.online;
    if (!s || !window.confirm(`Resign against ${this.names[1]}? It counts as a loss.`)) return;
    try {
      const view = await api.resign(s.token, s.id);
      this.generation++;
      this.renderOnlineEnded(view);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  private startOnlineMatch(view: MatchView, token: string, resume = false): void {
    this.onlineGen++;
    this.startMatch({
      names: ['You', view.opponent?.nickname ?? 'Opponent'],
      skills: [ONLINE_SKILL, ONLINE_SKILL],
      scoring: MATCH_SCORING,
      cpuStyle: view.opponent?.bot?.style ?? 'balanced',
      energy: view.energy ?? [FULL_ENERGY, FULL_ENERGY],
      online: {
        id: view.id,
        token,
        firstServer: view.firstServer,
        played: 0,
        backlog: resume ? view.exchanges : [],
        locked: resume && view.current.youLocked,
        view,
      },
    });
  }

  // ---------------------------------------------------------------- online screens

  private renderOnlineCard(html: string): void {
    const el = $('#online');
    el.innerHTML = `<div class="menu-card online">${html}</div>`;
    this.showScreen('online');
    el.querySelector('[data-act="menu"]')?.addEventListener('click', () => {
      this.onlineGen++;
      this.showScreen('menu');
    });
    el.querySelector('[data-act="online-home"]')?.addEventListener('click', () => this.renderOnline());
  }

  /** The online home screen, or the nickname form the first time. */
  private renderOnline(error = ''): void {
    this.onlineGen++;
    const id = this.identity;
    if (!id) {
      this.renderOnlineCard(`
        <h2>Play online</h2>
        <p class="tagline">Play against friends. Online matches are at equal skill: only your decisions count.</p>
        <label class="field"><span class="setting-label">Choose a nickname</span>
          <input id="nickname" maxlength="16" autocomplete="nickname" placeholder="e.g. Igor" /></label>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        <button class="primary big" data-act="register">Continue</button>
        <button class="ghost" data-act="restore">I have a recovery code</button>
        <button class="ghost" data-act="menu">Main menu</button>`);
      const input = $('#online').querySelector<HTMLInputElement>('#nickname')!;
      const go = async () => {
        if (!input.value.trim()) return;
        try {
          this.identity = await api.register(input.value);
          saveIdentity(this.identity);
          this.renderOnline();
        } catch (e) {
          this.renderOnline((e as Error).message);
        }
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && void go());
      $('#online').querySelector('[data-act="register"]')!.addEventListener('click', () => void go());
      $('#online').querySelector('[data-act="restore"]')!.addEventListener('click', () => this.renderOnlineRestore());
      return;
    }
    if (this.pendingJoin) {
      const code = this.pendingJoin;
      this.pendingJoin = null;
      void this.joinOnline(code);
      return;
    }
    this.renderOnlineCard(`
      <h2>Play online</h2>
      <p class="tagline">${escapeHtml(displayName(id.player))} · online rating <b>${id.player.rating}</b></p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      ${this.activeOnline ? `<button class="primary big" data-act="resume">Resume match vs ${escapeHtml(this.activeOnline.opponent?.nickname ?? 'opponent')}</button>` : ''}
      <button class="primary big" data-act="find">Find an opponent</button>
      <button class="primary big" data-act="cup">${this.activeCup ? `Continue Cup #${this.activeCup.number} · ${escapeHtml(this.activeCup.roundName)}` : '🏆 Online Cup'}</button>
      <button class="primary big" data-act="invite">Invite a friend</button>
      <button class="ghost" data-act="join">Join with a code</button>
      <button class="ghost" data-act="history">Online history</button>
      <button class="ghost" data-act="cups">Cup history</button>
      <button class="ghost" data-act="recovery">Recovery code</button>
      <button class="ghost" data-act="menu">Main menu</button>`);
    const el = $('#online');
    el.querySelector('[data-act="resume"]')?.addEventListener('click', () => void this.resumeOnline());
    el.querySelector('[data-act="find"]')!.addEventListener('click', () => void this.findOpponent());
    el.querySelector('[data-act="cup"]')!.addEventListener('click', () => void this.startOrContinueCup());
    el.querySelector('[data-act="invite"]')!.addEventListener('click', () => void this.inviteOnline());
    el.querySelector('[data-act="join"]')!.addEventListener('click', () => this.renderOnlineJoin());
    el.querySelector('[data-act="history"]')!.addEventListener('click', () => void this.renderOnlineHistory());
    el.querySelector('[data-act="cups"]')!.addEventListener('click', () => void this.renderCupHistory());
    api
      .currentCup(id.token)
      .then(({ cup }) => {
        if (gen !== this.onlineGen || (cup?.id ?? null) === (this.activeCup?.id ?? null) && cup?.round === this.activeCup?.round) return;
        this.activeCup = cup;
        this.renderOnline(error);
      })
      .catch(() => undefined);
    el.querySelector('[data-act="recovery"]')!.addEventListener('click', () => this.renderOnlineRecovery());
    // Refresh the rating, and look for a match to resume, in the background.
    const gen = this.onlineGen;
    // Always ask the server, so a match that ended elsewhere (resigned, finished on another device)
    // stops being offered, and one started elsewhere appears.
    if (!(this.match && !this.match.isOver && this.setup?.online)) {
      api
        .active(id.token)
        .then(({ match }) => {
          if (gen !== this.onlineGen || (match?.id ?? null) === (this.activeOnline?.id ?? null)) return;
          this.activeOnline = match;
          this.renderOnline(error);
        })
        .catch(() => undefined);
    }
    api
      .me(id.token)
      .then(({ player }) => {
        this.identity = { ...id, player };
        saveIdentity(this.identity);
        if (gen === this.onlineGen) el.querySelector('.tagline b')!.textContent = String(player.rating);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          // This device's player is gone (e.g. restored elsewhere): start again.
          this.identity = null;
          saveIdentity(null);
          if (gen === this.onlineGen) this.renderOnline('This device was signed out. Choose a nickname or use your recovery code.');
        }
      });
  }

  /** Matchmaking: a person if one is looking, otherwise a bot after a short wait. */
  private findOpponent(): Promise<void> {
    return this.searchOpponent('Find an opponent', 'If nobody is around, you’ll play a bot instead (unrated).', () => api.matchmaking(this.identity!.token), () =>
      this.renderOnline(),
    );
  }

  /** Polls matchmaking until a match is found, then starts it. */
  private async searchOpponent(title: string, note: string, poll: () => Promise<MatchmakingResult>, cancel: () => void): Promise<void> {
    const id = this.identity!;
    this.renderOnlineCard(`
      <h2>${escapeHtml(title)}</h2>
      <p class="waiting">Looking for an opponent…</p>
      <p class="small">${escapeHtml(note)}</p>
      <button class="ghost" data-act="cancel">Cancel</button>`);
    const gen = this.onlineGen;
    const el = $('#online');
    el.querySelector('[data-act="cancel"]')!.addEventListener('click', () => {
      void api.cancelMatchmaking(id.token).catch(() => undefined);
      cancel();
    });
    let failures = 0;
    while (gen === this.onlineGen) {
      try {
        const r = await poll();
        failures = 0;
        if (gen !== this.onlineGen) return;
        if ('waiting' in r) {
          el.querySelector('.waiting')!.textContent = `Looking for an opponent… ${r.secondsLeft}s, then a bot`;
        } else {
          // A match already under way (e.g. a cup round after a reload) catches up first.
          this.startOnlineMatch(r, id.token, r.exchangeCount > 0 || r.current.youLocked);
          return;
        }
      } catch (e) {
        if (++failures > 3) {
          this.renderOnline((e as Error).message);
          return;
        }
      }
      await sleep(1000);
    }
  }

  // ---------------------------------------------------------------- online cup

  private async startOrContinueCup(): Promise<void> {
    const id = this.identity!;
    try {
      const { cup } = await api.startCup(id.token);
      this.activeCup = cup;
      this.renderCup(cup);
    } catch (e) {
      this.renderOnline((e as Error).message);
    }
  }

  private async openCup(cupId: string): Promise<void> {
    this.onlineGen++;
    try {
      const { cup } = await api.cup(this.identity!.token, cupId);
      this.activeCup = cup.status === 'playing' ? cup : null;
      this.renderCup(cup);
    } catch (e) {
      this.renderOnline((e as Error).message);
    }
  }

  /** One line per round: the result once played, the next round to play, or nothing yet. */
  private cupPath(cup: Cup): string {
    return CUP_ROUND_NAMES.map((name, r) => {
      const played = cup.rounds.find((x) => x.round === r);
      let result: string;
      let tone = '';
      if (played && played.won !== null) {
        tone = played.won ? 'w' : 'l';
        const how = played.resigned ? (played.resigned === 'you' ? 'you resigned' : 'they resigned') : played.sets.map((s) => `${s[0]}–${s[1]}`).join(' ');
        result = `${played.won ? 'Beat' : 'Lost to'} ${played.opponent ? escapeHtml(displayName(played.opponent)) : 'opponent'} · ${how}`;
      } else if (played) {
        result = `Playing ${played.opponent ? escapeHtml(displayName(played.opponent)) : 'opponent'}`;
      } else if (cup.status === 'playing' && r === cup.round) {
        result = 'Next';
        tone = 'next';
      } else {
        result = '—';
      }
      return `<li class="${tone}"><span class="round-name">${name}</span><span class="cup-result">${result}</span></li>`;
    }).join('');
  }

  private renderCup(cup: Cup): void {
    this.onlineGen++;
    const playing = cup.status === 'playing';
    const inPlay = cup.rounds.find((r) => r.status === 'playing');
    const headline =
      cup.status === 'won'
        ? '🏆 Cup won!'
        : cup.status === 'lost'
          ? `Knocked out in the ${cup.roundName.toLowerCase()}`
          : cup.status === 'abandoned'
            ? 'You left this cup'
            : `${cup.roundName} next · your energy ${Math.round(cup.energy * 100)}%`;
    this.renderOnlineCard(`
      <h2>Online Cup #${cup.number}</h2>
      <p class="tagline">${escapeHtml(headline)}</p>
      <ul class="cup-path">${this.cupPath(cup)}</ul>
      ${
        playing
          ? `<button class="primary big" data-act="cup-next">${inPlay ? `Resume ${inPlay.roundName.toLowerCase()}` : `Find ${cup.roundName.toLowerCase()} opponent`}</button>
             <p class="small">Each round you play someone at the same round of their cup, or a bot if nobody turns up. Your energy carries over, with a 30% rest after each match.</p>
             <button class="ghost danger" data-act="cup-leave">Leave the cup</button>`
          : `<button class="primary big" data-act="cup-new">Play another cup</button>`
      }
      <button class="ghost" data-act="online-home">Back to online</button>`);
    const el = $('#online');
    el.querySelector('[data-act="cup-next"]')?.addEventListener('click', () => {
      const token = this.identity!.token;
      void this.searchOpponent(
        `Online Cup · ${cup.roundName}`,
        'Looking for another player at the same round. If nobody turns up, you’ll play a bot (unrated).',
        () => api.cupNext(token, cup.id),
        () => this.renderCup(cup),
      );
    });
    el.querySelector('[data-act="cup-leave"]')?.addEventListener('click', async () => {
      if (!window.confirm('Leave this cup? It ends your run here.')) return;
      try {
        const { cup: left } = await api.abandonCup(this.identity!.token, cup.id);
        this.activeCup = null;
        this.renderCup(left);
      } catch (e) {
        this.renderOnline((e as Error).message);
      }
    });
    el.querySelector('[data-act="cup-new"]')?.addEventListener('click', () => void this.startOrContinueCup());
  }

  private async renderCupHistory(): Promise<void> {
    const id = this.identity!;
    this.renderOnlineCard(`<h2>Cup history</h2><p class="tbd">Loading…</p><button class="ghost" data-act="online-home">Back</button>`);
    try {
      const { cups } = await api.cupHistory(id.token);
      const cards = cups
        .map((c) => {
          const outcome =
            c.status === 'won' ? '🏆 Champion' : c.status === 'lost' ? `Out in the ${c.roundName.toLowerCase()}` : c.status === 'abandoned' ? 'Left' : `In progress · ${c.roundName}`;
          const date = new Date(c.startedAt).toLocaleDateString();
          return `
          <section class="history-card">
            <div class="history-head"><h3>Cup #${c.number}</h3><span class="outcome ${c.status === 'won' ? 'won' : c.status === 'playing' ? 'live' : 'out'}">${outcome}</span></div>
            <p class="skill-change">${date}${c.ratingEnd !== null ? ` · rating ${c.ratingStart} → ${c.ratingEnd}` : ''}</p>
            <ul class="cup-path">${this.cupPath(c)}</ul>
          </section>`;
        })
        .join('');
      this.renderOnlineCard(`
        <h2>Cup history</h2>
        ${cards ? `<div class="history">${cards}</div>` : '<p class="tbd">No cups yet.</p>'}
        <button class="ghost" data-act="online-home">Back</button>`);
    } catch (e) {
      this.renderOnline((e as Error).message);
    }
  }

  private async inviteOnline(): Promise<void> {
    const id = this.identity!;
    let view: MatchView;
    try {
      view = await api.create(id.token);
    } catch (e) {
      this.renderOnline((e as Error).message);
      return;
    }
    const link = inviteLink(view.code);
    this.renderOnlineCard(`
      <h2>Invite a friend</h2>
      <p class="tagline">Send them this link, or the code to type in.</p>
      <p class="match-code">${escapeHtml(view.code)}</p>
      <button class="primary big" data-act="share">Share link</button>
      <p class="small link">${escapeHtml(link)}</p>
      <p class="waiting">Waiting for your opponent…</p>
      <button class="ghost" data-act="online-home">Cancel</button>`);
    $('#online').querySelector('[data-act="share"]')!.addEventListener('click', async () => {
      const text = `Play me at Tennis Strategy! Code ${view.code}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Tennis Strategy', text, url: link });
        else {
          await navigator.clipboard.writeText(link);
          $('#online').querySelector('.link')!.textContent = 'Link copied!';
        }
      } catch {
        // Share sheet dismissed.
      }
    });
    const gen = this.onlineGen;
    while (gen === this.onlineGen) {
      await sleep(1500);
      if (gen !== this.onlineGen) return;
      try {
        const v = await api.get(id.token, view.id, 0);
        if (v.status === 'playing') {
          this.startOnlineMatch(v, id.token);
          return;
        }
      } catch {
        // Keep waiting.
      }
    }
  }

  private renderOnlineJoin(error = ''): void {
    this.renderOnlineCard(`
      <h2>Join with a code</h2>
      <label class="field"><span class="setting-label">Match code</span>
        <input id="match-code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ABCD" /></label>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <button class="primary big" data-act="go">Join</button>
      <button class="ghost" data-act="online-home">Back</button>`);
    const input = $('#online').querySelector<HTMLInputElement>('#match-code')!;
    const go = () => input.value.trim() && void this.joinOnline(input.value.trim().toUpperCase());
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    $('#online').querySelector('[data-act="go"]')!.addEventListener('click', go);
  }

  private async joinOnline(code: string): Promise<void> {
    const id = this.identity!;
    try {
      const view = await api.join(id.token, code);
      if (view.status === 'playing') this.startOnlineMatch(view, id.token);
      else this.renderOnlineJoin('That’s your own invite. Send it to a friend.');
    } catch (e) {
      this.renderOnlineJoin((e as Error).message);
    }
  }

  private async renderOnlineHistory(): Promise<void> {
    const id = this.identity!;
    this.renderOnlineCard(`<h2>Online history</h2><p class="tbd">Loading…</p><button class="ghost" data-act="online-home">Back</button>`);
    try {
      const { matches } = await api.history(id.token);
      const rows = matches
        .map(
          (m) => `
          <li>
            <span class="result ${m.won ? 'w' : 'l'}">${m.won ? 'W' : 'L'}</span>
            <span class="opp">${m.opponent ? escapeHtml(displayName(m.opponent)) : 'Unknown'}${m.cupRound ? ` <small class="cup-tag">🏆 ${escapeHtml(m.cupRound)}</small>` : ''}</span>
            <span class="score">${m.resigned ? (m.resigned === 'you' ? 'you resigned' : 'they resigned') : m.sets.map((s) => `${s[0]}–${s[1]}`).join(' ')}</span>
            <span class="rating">${m.ratingChange === null ? '' : fmtRating(m.ratingChange)}</span>
          </li>`,
        )
        .join('');
      this.renderOnlineCard(`
        <h2>Online history</h2>
        ${rows ? `<ul class="online-history">${rows}</ul>` : '<p class="tbd">No online matches yet.</p>'}
        <button class="ghost" data-act="online-home">Back</button>`);
    } catch (e) {
      this.renderOnline((e as Error).message);
    }
  }

  private renderOnlineRecovery(): void {
    const id = this.identity!;
    this.renderOnlineCard(`
      <h2>Recovery code</h2>
      <p class="tagline">Keep this code somewhere safe. On another phone or after clearing the browser, use it to get ${escapeHtml(displayName(id.player))} and your rating back.</p>
      <p class="match-code recovery">${escapeHtml(id.recoveryCode)}</p>
      <button class="ghost" data-act="online-home">Back</button>`);
  }

  private renderOnlineRestore(error = ''): void {
    this.renderOnlineCard(`
      <h2>Restore your player</h2>
      <label class="field"><span class="setting-label">Recovery code</span>
        <input id="recovery" autocapitalize="characters" autocomplete="off" placeholder="TENNIS-XXXX-XXXX" /></label>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <button class="primary big" data-act="go">Restore</button>
      <button class="ghost" data-act="online-home">Back</button>`);
    const input = $('#online').querySelector<HTMLInputElement>('#recovery')!;
    $('#online').querySelector('[data-act="go"]')!.addEventListener('click', async () => {
      try {
        this.identity = await api.recover(input.value);
        saveIdentity(this.identity);
        this.renderOnline();
      } catch (e) {
        this.renderOnlineRestore((e as Error).message);
      }
    });
  }

  private describeChoice(c: Choice): string {
    switch (c.kind) {
      case 'server':
        return `Serve <b>${SERVE_LABEL[c.serveTarget]}</b> · cover <b>${ATTACK_LABEL[c.anticipation]}</b>`;
      case 'receiver':
        return `Read <b>${SERVE_RECEIVE_LABEL[c.anticipation]}</b> · return <b>${ATTACK_LABEL[c.returnTarget]}</b>`;
      case 'rally':
        return `Hit <b>${ATTACK_LABEL[c.attack]}</b> · cover <b>${ATTACK_LABEL[c.anticipation]}</b>`;
    }
  }

  private renderRevealing(choices: [Choice, Choice]): void {
    const panel = $('#panel');
    panel.innerHTML = `
      <div class="panel-head"><span class="role">Choices revealed</span></div>
      <div class="reveal">
        ${([0, 1] as const)
          .map(
            (p) => `
          <div class="reveal-row">
            <span class="player-chip p${p}">${escapeHtml(this.names[p])}</span>
            <span>${this.describeChoice(choices[p])}</span>
          </div>`,
          )
          .join('')}
      </div>
      <button class="ghost skip">Skip animation ▸▸</button>`;
    panel.querySelector('.skip')!.addEventListener('click', () => {
      this.scene.animator.speed = 6;
    });
  }

  private readWhat(d: Duel): string {
    const read = `read ${escapeHtml(readLabel(d))}`;
    // A wrong read whose energy term is still positive was partly saved by a scramble.
    return d.readCalc.modifier < 0 && d.readCalc.energy > 0 ? `${read} · scrambled` : read;
  }

  private shotWhat(d: Duel): string {
    if (d.kind === 'serve') return 'serve';
    if (d.shotCalc.position > 0) return 'in position';
    if (d.shotCalc.position < 0) return 'stretched';
    return 'shot';
  }

  private calcRow(who: PlayerIndex, what: string, c: Calculation): string {
    return `
      <div class="calc">
        <span class="player-chip p${who}">${escapeHtml(this.names[who])}</span>
        <span class="calc-what">${what}</span>
        <span class="calc-math">${c.skill.toFixed(2)} <i>${fmt(c.modifier)}</i>${c.position === 0 ? '' : ` <i class="position">${fmt(c.position)}</i>`}${c.energy === 0 ? '' : ` <i class="energy">${fmt(c.energy)}</i>`} <i class="luck">${fmt(c.random)}</i> = <b>${c.total.toFixed(2)}</b></span>
      </div>`;
  }

  /**
   * The player's-side summary of a shot: the call, the odds before the dice,
   * and what decided it, biggest factor first.
   */
  private verdictLine(d: Duel): string {
    const v = duelVerdict(d, 0, this.names[1]);
    const pct = Math.round(v.chance * 100);
    const label: Record<FactorId, string> = { skill: 'skill', choices: 'choices', position: 'position', energy: 'energy', luck: 'luck' };
    const factor = (i: number) => `<i class="${v.factors[i].id}">${label[v.factors[i].id]} ${fmt(v.factors[i].value)}</i>`;
    const decided = v.factors.length
      ? `Biggest factor: <b>${factor(0)}</b>${v.factors.length > 1 ? `, then ${v.factors.slice(1).map((_, i) => factor(i + 1)).join(' · ')}` : ''}`
      : 'Dead even';
    return `
      <p class="verdict ${v.won ? 'good' : 'bad'}"><b>${escapeHtml(v.title)}</b> · ${pct}% ${v.chanceLabel}</p>
      <p class="factors">${decided}</p>`;
  }

  /** Both totals, with the full sum behind a tap. */
  private calcDetails(d: Duel): string {
    const [first, second] = [d.hitter, d.defender];
    const total = (p: PlayerIndex) => {
      const n = Math.round((p === d.hitter ? d.shotCalc : d.readCalc).total * 100) / 100;
      return `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
    };
    return `
      <details class="calc-details"${this.settings.showBreakdown ? ' open' : ''}>
        <summary>${escapeHtml(this.names[first])} <b>${total(first)}</b> vs ${escapeHtml(this.names[second])} <b>${total(second)}</b></summary>
        <p class="context">skill <i>shot/read</i> <i class="position">position</i> <i class="energy">energy</i> <i class="luck">luck</i></p>
        ${this.calcRow(d.hitter, this.shotWhat(d), d.shotCalc)}
        ${this.calcRow(d.defender, this.readWhat(d), d.readCalc)}
      </details>`;
  }

  private duelResult(d: Duel): string {
    if (!d.hitterWins) return d.kind === 'serve' ? 'Returned' : 'Covered';
    return d.kind === 'serve' ? 'Ace!' : d.kind === 'return' ? 'Return winner!' : 'Winner!';
  }

  private renderBreakdown(outcome: ExchangeOutcome): Promise<void> {
    const match = this.match!;
    const ex = outcome.exchange;
    const winner = ex.pointWinner;
    const verb: Record<Duel['kind'], string> = { serve: 'Serve', return: 'Return', attack: 'Attack', counter: 'Counter' };
    const headline = winner === null ? 'Rally continues' : winner === 0 ? 'Point won!' : 'Point lost';
    const nextLabel = winner === null ? 'Next shot' : match.isOver ? 'See result' : 'Next point';

    const panel = $('#panel');
    panel.innerHTML = `
      <div class="panel-head">
        <span class="role ${winner === null ? '' : winner === 0 ? 'good' : 'bad'}">${escapeHtml(headline)}</span>
      </div>
      <div class="duels">
        ${ex.duels
          .map(
            (d) => `
          <div class="duel ${d.hitterWins ? 'hit' : 'held'}">
            <div class="duel-title"><span>${verb[d.kind]} · ${escapeHtml(shotLabel(d))}</span><b>${this.duelResult(d)}</b></div>
            ${this.verdictLine(d)}
            ${this.calcDetails(d)}
          </div>`,
          )
          .join('')}
      </div>
      <button class="primary">${nextLabel}</button>`;
    // Opening or closing one breakdown does the same to the others and is remembered.
    for (const det of panel.querySelectorAll<HTMLDetailsElement>('.calc-details')) {
      det.addEventListener('toggle', () => {
        if (this.settings.showBreakdown === det.open) return;
        this.settings.showBreakdown = det.open;
        saveSettings(this.settings);
        for (const other of panel.querySelectorAll<HTMLDetailsElement>('.calc-details')) other.open = det.open;
      });
    }
    return new Promise((resolve) => {
      panel.querySelector('.primary')!.addEventListener('click', () => resolve());
    });
  }

  private announce(outcome: ExchangeOutcome): void {
    const ex = outcome.exchange;
    if (ex.pointWinner === null) return;
    const last = ex.duels[ex.duels.length - 1];
    const shot = last.kind === 'serve' ? 'Ace!' : last.kind === 'return' ? 'Return winner!' : 'Winner!';
    const w = ex.pointWinner;
    const name = this.names[w];
    let sub = `Point ${name}`;
    if (outcome.event === 'game') sub = `Game ${name}`;
    if (outcome.event === 'set') sub = `Set ${name}`;
    if (outcome.event === 'match') sub = `Game, set & match ${name}`;
    this.callout(shot, sub, w === 0 ? 'good' : 'bad');
    this.sound.point(w === 0);
  }

  private callout(text: string, sub: string, tone = ''): void {
    const el = $('#callout');
    el.className = `callout ${tone}`;
    el.innerHTML = `<div class="callout-main">${escapeHtml(text)}</div><div class="callout-sub">${escapeHtml(sub)}</div>`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------------------------------------------------------------- scoreboard & end

  private renderScoreboard(): void {
    const m = this.match;
    const board = $('#scoreboard');
    const row = (p: PlayerIndex) => {
      if (!m) return '';
      const sets = m.score.completedSets.map((s) => `<span class="set">${s[p]}</span>`).join('');
      return `
        <div class="sb-row">
          <span class="serve-dot ${m.server === p && !m.isOver ? 'on' : ''}"></span>
          <span class="sb-name"><span class="player-dot p${p}"></span><span class="sb-label">${escapeHtml(this.names[p])}</span>${p === 1 && this.setup && (!this.setup.online || this.setup.online.view.opponent?.bot) ? `<small class="style" title="${STYLES[this.setup.cpuStyle].label}">${STYLES[this.setup.cpuStyle].icon}<span class="style-name"> ${STYLES[this.setup.cpuStyle].label}</span></small>` : ''}</span>
          ${m.isOver ? '' : this.energyBar(m.energy[p])}
          ${sets}
          <span class="set current">${m.isOver ? '' : m.score.games[p]}</span>
          <span class="pts">${m.isOver ? '' : m.score.pointLabel(p)}</span>
        </div>`;
    };
    board.innerHTML = `
      <button class="icon-btn" data-action="menu" aria-label="Menu">☰</button>
      <div class="sb-table">${m ? row(0) + row(1) : '<div class="sb-title">Tennis Strategy</div>'}</div>
      <button class="icon-btn" data-open-help aria-label="How to play">?</button>
      <button class="icon-btn" data-action="mute" aria-label="Toggle sound">${this.sound.muted ? '🔇' : '🔊'}</button>`;
    board.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
    board.querySelector('[data-open-help]')!.addEventListener('click', () => $('#help').classList.remove('hidden'));
    board.querySelector('[data-action="mute"]')!.addEventListener('click', () => {
      this.sound.muted = !this.sound.muted;
      this.settings.muted = this.sound.muted;
      saveSettings(this.settings);
      this.sound.unlock();
      this.renderScoreboard();
    });

    const sit = $('#situation');
    const s = m && !m.isOver ? m.score.situation() : null;
    sit.textContent = s ?? '';
    sit.classList.toggle('hidden', !s);
  }

  private energyBar(energy: number): string {
    const pct = Math.round(energy * 100);
    const level = pct > 60 ? 'high' : pct > 30 ? 'mid' : 'low';
    return `<span class="energy-bar ${level}" role="img" aria-label="Energy ${pct}%" title="Energy ${pct}%"><i style="width:${pct}%"></i></span>`;
  }

  private renderMatchOver(): void {
    const m = this.match!;
    const w = m.score.winner!;
    const st = m.stats;
    const pct = (a: number, b: number) => (b === 0 ? '–' : `${Math.round((a / b) * 100)}%`);
    const rows: [string, (p: PlayerIndex) => string][] = [
      ['Points won', (p) => String(st[p].pointsWon)],
      ['Aces', (p) => String(st[p].aces)],
      ['Winners', (p) => String(st[p].winners)],
      ['Service pts won', (p) => `${st[p].servicePointsWon}/${st[p].servicePointsPlayed}`],
      ['Correct reads', (p) => `${st[p].readsCorrect}/${st[p].readsMade} (${pct(st[p].readsCorrect, st[p].readsMade)})`],
    ];
    const title = w === 0 ? 'You win!' : `${this.names[1]} wins`;
    let subtitle = '';
    const online = this.setup?.online;
    if (online) {
      const change = online.view.ratingChange;
      subtitle = !online.view.rated
        ? 'Unrated match against a bot'
        : change === null
          ? 'Online match'
          : `Online rating ${fmtRating(change)} → ${online.view.you.rating}`;
      const cup = online.view.cup;
      if (cup) {
        const won = online.view.winner === 0;
        const title = won ? (cup.round === CUP_ROUND_NAMES.length - 1 ? '🏆 Cup won!' : `Through to the ${CUP_ROUND_NAMES[cup.round + 1].toLowerCase()}`) : `Knocked out in the ${cup.roundName.toLowerCase()}`;
        subtitle = `${title} · ${subtitle}`;
      }
    }
    const el = $('#over');
    el.innerHTML = `
      <div class="menu-card">
        <div class="ball-icon" aria-hidden="true"></div>
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="tagline">${escapeHtml(subtitle)}</p>` : ''}
        <p class="final-score">${m.score.completedSets.map((s) => `${s[w]}–${s[other(w)]}`).join('  ')}</p>
        <table class="stats">
          <thead><tr><th></th><th>${escapeHtml(this.names[0])}</th><th>${escapeHtml(this.names[1])}</th></tr></thead>
          <tbody>
            ${rows.map(([label, f]) => `<tr><td>${label}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`).join('')}
            <tr><td>Longest rally</td><td colspan="2">${st[0].longestRally} shots</td></tr>
          </tbody>
        </table>
        ${
          online?.view.cup
            ? '<button class="primary big" data-act="cup-home">Back to the Cup</button>'
            : '<button class="primary big" data-act="online-home">Back to online</button>'
        }
        <button class="ghost" data-act="menu">Main menu</button>
      </div>`;
    this.showScreen('over');
    el.querySelector('[data-act="online-home"]')?.addEventListener('click', () => this.renderOnline());
    el.querySelector('[data-act="cup-home"]')?.addEventListener('click', () => void this.openCup(online!.view.cup!.id));
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
    $('#panel').innerHTML = '';
  }

  // ---------------------------------------------------------------- help

  private renderHelp(): void {
    const head = (cols: string[]) => `<tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const cell = (v: number) => `<td class="${v > 0 ? 'pos' : 'neg'}">${fmt1(v)}</td>`;
    const serveTable = `
      <table class="matrix">
        <thead>${head(SERVE_RECEIVE_ACTIONS.map((r) => SERVE_RECEIVE_LABEL[r]))}</thead>
        <tbody>${SERVE_ACTIONS.map(
          (s) => `<tr><th>${SERVE_LABEL[s]} <small>${fmt1(SERVE_COST[s])}</small></th>${SERVE_RECEIVE_ACTIONS.map((r) => cell(SERVE_RECEIVE_MODIFIER[s][r])).join('')}</tr>`,
        ).join('')}</tbody>
      </table>`;
    const short: Record<string, string> = { crossCourt: 'Cross', downTheLine: 'Line', centerDeep: 'Center', dropShot: 'Drop' };
    const rallyTable = `
      <table class="matrix">
        <thead>${head(ATTACK_ACTIONS.map((a) => short[a]))}</thead>
        <tbody>${ATTACK_ACTIONS.map(
          (a) => `<tr><th>${ATTACK_LABEL[a]} <small>${fmt1(ATTACK_COST[a])}</small></th>${ATTACK_ACTIONS.map((d) => cell(DEFEND_MODIFIER[a][d])).join('')}</tr>`,
        ).join('')}</tbody>
      </table>`;
    $('#help-body').innerHTML = `
      <p>Every exchange, both players secretly lock in <b>two decisions at once</b>: where to hit
      (<span class="swatch target"></span> target) and where to cover the opponent's next ball
      (<span class="swatch read"></span> read). Then both are revealed and resolved.</p>
      <h3>Resolution</h3>
      <p><b>Shot</b> = skill + shot risk + position + energy + luck<br/><b>Read</b> = skill + read bonus/penalty + energy + luck<br/>
      Luck is a random roll between −0.3 and +0.3. If the shot beats the read, the hitter wins the point.
      Otherwise the ball comes back, and the defender's own shot is tested against the hitter's read.
      If both shots are covered, the rally continues with a new set of choices.</p>
      <h3>Position</h3>
      <p>Your read also sets up your next shot. A third of your read bonus or penalty carries into the next ball you hit:
      a correct read puts you <b>in position</b> (+0.1, or +0.2 after reading a drop shot), and a lucky cover after
      a wrong read leaves you <b>stretched</b> (down to −0.2). Serves always start from a neutral position.</p>
      <h3>Energy</h3>
      <p>Energy is the bar by each name. Matches start at full energy, except in the Online Cup, where it carries
      from round to round with a 30% rest after each match. Running costs energy: defending, especially drop shots,
      and most of all changing direction after a wrong read. You win a little back after every point and more at
      changeovers.</p>
      <p>While you are fresh you can scramble back from a wrong read and recover up to half its penalty, so early
      rallies last longer. As you tire that recovery fades, and every shot and read loses up to −0.15.</p>
      <p>Under each shot a line sums it up from your side: a call such as “Good read, unlucky” and your chance of
      winning that shot before the dice were rolled. Below it, the factors behind the result, biggest first: <b>skill</b>,
      <b>choices</b> (your shot or read against theirs), <b>position</b>, <b>energy</b> (fresh legs or
      tiredness) and <b>luck</b> (the dice), each as how much it helped (+) or hurt (−) you. A good choice can
      still lose to the dice, and a bad one can get lucky. Tap the two totals to see the full sums.</p>
      <p>In the shot breakdown the purple <b>energy</b> term combines both: a plus means a scramble saved part of a
      wrong read (the read is marked “scrambled”), a minus means fatigue. The energy a misread costs shows in the
      bar by your name.</p>
      <h3>Bot styles</h3>
      <p>Every bot has a style it always plays with. It doesn't learn from you, but it leans on its favourite
      choices, so watch what it does and adapt.</p>
      <ul>${STYLE_IDS.map((id) => `<li>${STYLES[id].icon} <b>${STYLES[id].label}</b>: ${STYLES[id].description}</li>`).join('')}</ul>
      <h3>Playing online</h3>
      <p>Find an opponent pairs you with another player who is looking, closest rating first. If nobody turns up
      within 15 seconds you play a bot instead: it's shown as 🤖 with its playing style, it can't see your choices,
      and bot matches don't change your rating.</p>
      <p>The Online Cup is three rounds: quarterfinal, semifinal and final. Each round you play someone who is at
      the same round of their own cup, or a bot if nobody turns up, and the bots get tougher each round. Lose and
      you're out; win the final and you take the cup. Your energy carries from round to round with a 30% rest after
      each match. Cup history keeps every run with its results and opponents.</p>
      <p>Play online can also invite a friend by link or code. Both of you play at skill 0.50, so only your decisions and the
      dice count. Choices are revealed together once both of you have locked in, and there's no time limit. If you
      reload or come back later, Resume online match picks up where you left off; Resign (in the menu) ends it as a loss. Your
      online rating starts at 1000 and moves like chess Elo.</p>
      <h3>Serve vs. read</h3>
      <p class="small">Rows: serve (risk). Columns: receiver's read.</p>
      ${serveTable}
      <h3>Attack vs. cover</h3>
      <p class="small">Rows: attack (risk). Columns: defender's cover.</p>
      ${rallyTable}
      <h3>Tips</h3>
      <ul>
        <li>Safe shots (Body, Center Deep) cost less but are easier to read.</li>
        <li>A correctly read drop shot gets a big +0.6 bonus — don't get predictable with it.</li>
        <li>You can tap the glowing zones on the court instead of the buttons.</li>
      </ul>`;
  }
}

import { duelVerdict, type FactorId } from '../engine/verdict';
import { matchReview, type BestRead } from '../engine/review';
import { ONLINE_SKILL, replayRng, type ResolvedExchange } from '../engine/online';
import { api, ApiError, displayName, inviteLink, loadIdentity, saveIdentity, type MatchView } from '../online/client';
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
import { AiOpponent } from '../engine/ai';
import { FULL_ENERGY, restBySkipping } from '../engine/energy';
import { Match, type ExchangeOutcome } from '../engine/match';
import { other, type Calculation, type Choice, type Duel, type PlayerIndex } from '../engine/resolution';
import { MATCH_SCORING, type ScoringConfig } from '../engine/scoring';
import {
  emptyProfile,
  outcomeLabel,
  parseProfile,
  profileStats,
  balance,
  rankings,
  recordSkippedTournament,
  saveTournamentRecord,
  summarizeTournament,
  type Profile,
} from '../engine/profile';
import { SKILL_TIERS, skillTier, type SkillTierId } from '../engine/skill';
import { STYLES, STYLE_IDS, assignStyles, type StyleId } from '../engine/styles';
import {
  CPU_NAMES,
  HUMAN,
  MAX_SKILL,
  champion,
  ROUND_NAMES,
  TOURNAMENT_START_SKILL,
  createTournament,
  currentOpponent,
  currentRound,
  decaySkill,
  pairings,
  prizeMoney,
  seedOf,
  buyCoaching,
  canBuyCoaching,
  coachingPrice,
  COACHING_GAIN,
  parseTournament,
  playTournamentWithoutPlayer,
  recordHumanMatch,
  type Tournament,
} from '../engine/tournament';
import type { DecisionKind } from '../scene/layout';
import { CourtScene } from '../scene/scene';
import { Sound } from './sound';


interface Settings {
  playerSkill: SkillTierId;
  cpuSkill: SkillTierId;
  muted: boolean;
  /** Whether each shot's number breakdown starts expanded. */
  showBreakdown: boolean;
}


const SETTINGS_KEY = 'tennis-strategy-settings';
const DEFAULT_SETTINGS: Settings = { playerSkill: 'pro', cpuSkill: 'pro', muted: false, showBreakdown: false };

const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const merged: Settings = { ...DEFAULT_SETTINGS, ...saved };
      // Older saves may hold values from settings that no longer exist.
      if (!skillTier(merged.playerSkill)) merged.playerSkill = DEFAULT_SETTINGS.playerSkill;
      if (!skillTier(merged.cpuSkill)) merged.cpuSkill = DEFAULT_SETTINGS.cpuSkill;
      return merged;
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

const TOURNAMENT_KEY = 'tennis-strategy-tournament';
const PLAYER_SKILL_KEY = 'tennis-strategy-player-skill';

/** The skill the player has built up across tournaments. */
const loadPlayerSkill = (): number => {
  try {
    const n = Number(localStorage.getItem(PLAYER_SKILL_KEY));
    return n >= TOURNAMENT_START_SKILL && n <= MAX_SKILL ? n : TOURNAMENT_START_SKILL;
  } catch {
    return TOURNAMENT_START_SKILL;
  }
};

/** Whole dollars, e.g. $1,250. */
const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;

const savePlayerSkill = (skill: number) => {
  try {
    localStorage.setItem(PLAYER_SKILL_KEY, String(skill));
  } catch {
    // ignore
  }
};

const loadTournament = (): Tournament | null => {
  try {
    const raw = localStorage.getItem(TOURNAMENT_KEY);
    return raw ? parseTournament(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const saveTournament = (t: Tournament | null) => {
  try {
    if (t) localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOURNAMENT_KEY);
  } catch {
    // ignore
  }
};

const PROFILE_KEY = 'tennis-strategy-profile';

const loadProfile = (): Profile => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const profile = (raw && parseProfile(JSON.parse(raw))) || emptyProfile();
    // Profiles saved before CPU styles existed get theirs dealt once.
    if (!profile.styles) {
      profile.styles = assignStyles(CPU_NAMES, Math.random);
      saveProfile(profile);
    }
    return profile;
  } catch {
    return emptyProfile();
  }
};

const saveProfile = (p: Profile) => {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
};

/** Everything needed to start (or restart) a match. */
interface MatchSetup {
  names: [string, string];
  skills: [number, number];
  scoring: ScoringConfig;
  tournament: boolean;
  /** How the CPU opponent plays. */
  cpuStyle: StyleId;
  /** Energy going in: [player, CPU]. Tournament matches carry it from the previous round. */
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
  private ai = new AiOpponent();
  private names: [string, string] = ['You', 'CPU'];
  /** Every duel of the current match, for the coaching review. */
  private matchLog: Duel[] = [];
  private setup: MatchSetup | null = null;
  private tournament = loadTournament();
  private profile = loadProfile();
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
    const practice = $('#practice');
    menu.querySelector('[data-act="practice"]')!.addEventListener('click', () => this.showScreen('practice'));
    menu.querySelector('[data-act="online"]')!.addEventListener('click', () => {
      this.sound.unlock();
      this.renderOnline();
    });
    menu.querySelector('[data-act="settings"]')!.addEventListener('click', () => this.renderSettings());
    menu.querySelector('[data-act="profile"]')!.addEventListener('click', () => this.renderProfile());
    menu.querySelector('[data-act="rankings"]')!.addEventListener('click', () => this.renderRankings());
    menu.querySelector('[data-act="tournament"]')!.addEventListener('click', () => {
      this.sound.unlock();
      if (this.tournament?.status === 'playing') this.renderTournament();
      else this.renderEntry();
    });
    practice.querySelector('[data-act="back"]')!.addEventListener('click', () => this.showScreen('menu'));

    for (const seg of practice.querySelectorAll<HTMLElement>('[data-skill-options]')) {
      seg.innerHTML = SKILL_TIERS.map(
        (t) => `<button data-value="${t.id}"><span>${t.label}</span><small>${t.skill.toFixed(1)}</small></button>`,
      ).join('');
    }
    const sync = () => {
      for (const seg of practice.querySelectorAll<HTMLElement>('.segmented')) {
        const key = seg.dataset.setting as keyof Settings;
        for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) {
          const on = String(this.settings[key]) === b.dataset.value;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }
      }
    };
    practice.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.segmented button');
      if (!b) return;
      const key = (b.parentElement as HTMLElement).dataset.setting as 'playerSkill' | 'cpuSkill';
      (this.settings as unknown as Record<string, string>)[key] = b.dataset.value!;
      saveSettings(this.settings);
      sync();
    });
    sync();

    $('#start').addEventListener('click', () => {
      this.sound.unlock();
      this.startMatch(this.practiceSetup());
    });
    $('#resume').addEventListener('click', () => this.showScreen(null));
    $('#resume-online').addEventListener('click', () => this.resumeOnline());
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
  private showScreen(screen: 'menu' | 'practice' | 'tournament' | 'profile' | 'rankings' | 'settings' | 'over' | 'online' | null): void {
    for (const id of ['menu', 'practice', 'tournament', 'profile', 'rankings', 'settings', 'over', 'online']) $(`#${id}`).classList.toggle('hidden', id !== screen);
    const playing = !!(this.match && !this.match.isOver);
    $('#resume').classList.toggle('hidden', !playing);
    $('#resign').classList.toggle('hidden', !(playing && this.setup?.online));
    const resumable = !playing && this.activeOnline;
    $('#resume-online').classList.toggle('hidden', !resumable);
    if (resumable) $('#resume-online').textContent = `Resume online match vs ${this.activeOnline!.opponent?.nickname ?? 'opponent'}`;
  }

  private practiceSetup(): MatchSetup {
    return {
      names: ['You', 'CPU'],
      skills: [skillTier(this.settings.playerSkill)!.skill, skillTier(this.settings.cpuSkill)!.skill],
      scoring: MATCH_SCORING,
      tournament: false,
      cpuStyle: 'balanced',
      energy: [FULL_ENERGY, FULL_ENERGY],
    };
  }

  // ---------------------------------------------------------------- match flow

  private startMatch(setup: MatchSetup): void {
    this.generation++;
    this.setup = setup;
    this.names = setup.names;
    this.matchLog = [];
    const firstServer: PlayerIndex = setup.online ? setup.online.firstServer : Math.random() < 0.5 ? 0 : 1;
    this.ai = new AiOpponent(Math.random, STYLES[setup.cpuStyle]);
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
        this.matchLog.push(...this.match.resolve(replayRng(x.rolls)).exchange.duels);
      }
      online.played = online.backlog.length;
      online.backlog = [];
      this.activeOnline = null;
    }
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
      let rng: () => number = Math.random;
      if (this.setup?.online) {
        // The server resolves the exchange; it may have chosen for us if our time ran out.
        const resolved = await this.onlineExchange(gen, this.setup.online, choice);
        if (!alive()) return;
        if (!resolved) {
          this.renderOnlineEnded(this.setup.online.view);
          return;
        }
        match.submit(0, resolved.choices[0]);
        match.submit(1, resolved.choices[1]);
        rng = replayRng(resolved.rolls);
      } else {
        match.submit(0, choice!);
        match.submit(1, this.ai.choose(match, 1));
      }

      const choices = [...match.lockedChoices] as [Choice, Choice];
      const outcome = match.resolve(rng);
      this.matchLog.push(...outcome.exchange.duels);

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
      <button class="primary big" data-act="online-home">Back to online</button>
      <button class="ghost" data-act="menu">Main menu</button>`);
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

  private resumeOnline(): void {
    const view = this.activeOnline;
    if (!view || !this.identity) return;
    this.sound.unlock();
    this.startOnlineMatch(view, this.identity.token, true);
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
      tournament: false,
      cpuStyle: view.opponent?.bot?.style ?? 'balanced',
      energy: [FULL_ENERGY, FULL_ENERGY],
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
      <button class="primary big" data-act="invite">Invite a friend</button>
      <button class="ghost" data-act="join">Join with a code</button>
      <button class="ghost" data-act="history">Online history</button>
      <button class="ghost" data-act="recovery">Recovery code</button>
      <button class="ghost" data-act="menu">Main menu</button>`);
    const el = $('#online');
    el.querySelector('[data-act="resume"]')?.addEventListener('click', () => this.resumeOnline());
    el.querySelector('[data-act="find"]')!.addEventListener('click', () => void this.findOpponent());
    el.querySelector('[data-act="invite"]')!.addEventListener('click', () => void this.inviteOnline());
    el.querySelector('[data-act="join"]')!.addEventListener('click', () => this.renderOnlineJoin());
    el.querySelector('[data-act="history"]')!.addEventListener('click', () => void this.renderOnlineHistory());
    el.querySelector('[data-act="recovery"]')!.addEventListener('click', () => this.renderOnlineRecovery());
    // Refresh the rating, and look for a match to resume, in the background.
    const gen = this.onlineGen;
    if (!this.activeOnline && !(this.match && !this.match.isOver && this.setup?.online)) {
      api
        .active(id.token)
        .then(({ match }) => {
          if (match && gen === this.onlineGen) {
            this.activeOnline = match;
            this.renderOnline(error);
          }
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
  private async findOpponent(): Promise<void> {
    const id = this.identity!;
    this.renderOnlineCard(`
      <h2>Find an opponent</h2>
      <p class="waiting">Looking for an opponent…</p>
      <p class="small">If nobody is around, you’ll play a bot instead (unrated).</p>
      <button class="ghost" data-act="cancel">Cancel</button>`);
    const gen = this.onlineGen;
    const el = $('#online');
    el.querySelector('[data-act="cancel"]')!.addEventListener('click', () => {
      void api.cancelMatchmaking(id.token).catch(() => undefined);
      this.renderOnline();
    });
    let failures = 0;
    while (gen === this.onlineGen) {
      try {
        const r = await api.matchmaking(id.token);
        failures = 0;
        if (gen !== this.onlineGen) return;
        if ('waiting' in r) {
          el.querySelector('.waiting')!.textContent = `Looking for an opponent… ${r.secondsLeft}s, then a bot`;
        } else {
          this.startOnlineMatch(r, id.token);
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
            <span class="opp">${m.opponent ? escapeHtml(displayName(m.opponent)) : 'Unknown'}</span>
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
    const inTournament = this.setup?.tournament === true && this.tournament?.status === 'playing';
    let subtitle = '';
    if (inTournament) {
      // Record the result straight away so a reload can't lose it.
      const t = this.tournament!;
      const roundName = ROUND_NAMES[currentRound(t)];
      const before = t.entrants[HUMAN].skill;
      const prizeBefore = prizeMoney(t);
      const next = recordHumanMatch(t, w === 0, m.score.completedSets, Math.random, m.energy);
      this.storeTournament(next);
      // Skill won in the tournament stays with the player for the next one.
      savePlayerSkill(next.entrants[HUMAN].skill);
      const change = next.entrants[HUMAN].skill - before;
      const skillNote = `skill ${change < 0 ? '−' : '+'}${Math.abs(change).toFixed(2)}`;
      const prize = prizeMoney(next) - prizeBefore;
      const prizeNote = prize > 0 ? ` · +${dollars(prize)}` : '';
      subtitle = (w === 0 ? `${roundName} won · ${skillNote}` : `Knocked out in the ${roundName.toLowerCase()} · ${skillNote}`) + prizeNote;
    }
    const online = this.setup?.online;
    if (online) {
      const change = online.view.ratingChange;
      subtitle = !online.view.rated
        ? 'Unrated match against a bot'
        : change === null
          ? 'Online match'
          : `Online rating ${fmtRating(change)} → ${online.view.you.rating}`;
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
        ${inTournament && this.tournament && canBuyCoaching(this.tournament) ? this.coachingOffer() : ''}
        ${
          inTournament
            ? '<button class="primary big" data-act="bracket">Continue</button>'
            : online
              ? '<button class="primary big" data-act="online-home">Back to online</button>'
              : '<button class="primary big" data-act="again">Play again</button>'
        }
        <button class="ghost" data-act="menu">Main menu</button>
      </div>`;
    this.showScreen('over');
    el.querySelector('[data-act="again"]')?.addEventListener('click', () => this.startMatch(this.setup!));
    el.querySelector('[data-act="bracket"]')?.addEventListener('click', () => this.renderTournament());
    el.querySelector('[data-act="online-home"]')?.addEventListener('click', () => this.renderOnline());
    el.querySelector('[data-act="coach"]')?.addEventListener('click', () => {
      this.storeTournament(buyCoaching(this.tournament!));
      savePlayerSkill(this.tournament!.entrants[HUMAN].skill);
      el.querySelector('.coaching')!.outerHTML = this.coachingReview();
    });
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
    $('#panel').innerHTML = '';
  }

  /** After a tournament loss: a coaching review for sale, if the player can afford it. */
  private coachingOffer(): string {
    const price = coachingPrice(loadPlayerSkill());
    const money = balance(this.profile);
    const short = money < price;
    return `
      <div class="coaching">
        <p>A coach can go over this match with you: what ${escapeHtml(this.names[1])} kept doing and how you read it. <b>+${COACHING_GAIN.toFixed(2)} skill</b>.</p>
        <button class="ghost" data-act="coach" ${short ? 'disabled' : ''}>Coaching review · ${dollars(price)}</button>
        <p class="small">You have ${dollars(money)}${short ? ` · ${dollars(price - money)} short` : ''}</p>
      </div>`;
  }

  /** What the coach found in the match just lost. */
  private coachingReview(): string {
    const r = matchReview(this.matchLog, 0);
    const opp = escapeHtml(this.names[1]);
    const list = <K extends string>(counts: Record<K, number>, label: Record<K, string>) =>
      (Object.keys(counts) as K[])
        .filter((k) => counts[k] > 0)
        .sort((a, b) => counts[b] - counts[a])
        .map((k) => `${label[k]} ${counts[k]}`)
        .join(' · ') || 'none';
    const misreads = r.reads - r.readsRight;
    const bestLine = <K extends string>(title: string, b: BestRead<K>, label: Record<K, string>) =>
      b.reads.length ? `<p><b>${title}:</b> ${b.reads.map((k) => label[k]).join(' or ')} (right ${b.right} of ${b.of}${b.reads.length > 1 ? ' each' : ''})</p>` : '';
    return `
      <div class="coaching review">
        <h3>Coach’s review · skill +${COACHING_GAIN.toFixed(2)}</h3>
        <p><b>${opp} served:</b> ${list(r.serves, SERVE_LABEL)}</p>
        <p><b>${opp} hit:</b> ${list(r.shots, ATTACK_LABEL)}</p>
        <p><b>Your reads:</b> ${r.readsRight} of ${r.reads} right${misreads > 0 ? ` · <b>${r.misreadsLost} of your ${misreads} misreads lost the point straight away</b>` : ''}</p>
        ${bestLine(`Best read on ${opp}’s serve`, r.bestServeRead, SERVE_RECEIVE_LABEL)}
        ${bestLine(`Best cover against ${opp}’s shots`, r.bestCover, ATTACK_LABEL)}
        <p class="small">Players keep their habits. Next time you meet ${opp}, read for what they did most.</p>
      </div>`;
  }

  // ---------------------------------------------------------------- tournament

  private renderSettings(): void {
    const el = $('#settings');
    const fresh = loadPlayerSkill() <= TOURNAMENT_START_SKILL && this.profile.tournaments.length === 0 && !this.tournament;
    el.innerHTML = `
      <div class="menu-card">
        <h2>Settings</h2>
        <p class="tagline">Start over with skill ${TOURNAMENT_START_SKILL.toFixed(2)}, no tournament history and tournament numbering from #1.</p>
        <button class="primary big" data-act="reset" ${fresh ? 'disabled' : ''}>Start fresh</button>
        <button class="ghost" data-act="back">Back</button>
      </div>`;
    this.showScreen('settings');
    el.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      if (!window.confirm('Start fresh? Your skill, tournament in progress and tournament history will all be deleted.')) return;
      savePlayerSkill(TOURNAMENT_START_SKILL);
      this.profile = emptyProfile();
      saveProfile(this.profile);
      this.tournament = null;
      saveTournament(null);
      if (this.setup?.tournament) {
        this.generation++;
        this.match = null;
      }
      this.renderSettings();
    });
    el.querySelector('[data-act="back"]')!.addEventListener('click', () => this.showScreen('menu'));
  }

  /** Before each tournament: enter it, or sit it out to rest. */
  private renderEntry(note = ''): void {
    const number = this.profile.nextTournament;
    const energy = this.profile.energy?.You ?? FULL_ENERGY;
    const rested = restBySkipping(energy);
    const el = $('#tournament');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Tournament #${number}</h2>
        ${note ? `<p class="tagline">${escapeHtml(note)}</p>` : ''}
        <div class="next-match">
          <div><span class="setting-label">Your energy</span><b>${Math.round(energy * 100)}%</b></div>
          <div><span class="setting-label">Your skill</span><b>${loadPlayerSkill().toFixed(2)}</b></div>
          <div><span class="setting-label">Money</span><b>${dollars(balance(this.profile))}</b></div>
        </div>
        <button class="primary big" data-act="enter">Enter tournament</button>
        <button class="ghost" data-act="skip" ${rested <= energy ? 'disabled' : ''}>Skip &amp; rest (energy → ${Math.round(rested * 100)}%)</button>
        <button class="ghost" data-act="menu">Main menu</button>
      </div>`;
    this.showScreen('tournament');
    el.querySelector('[data-act="enter"]')!.addEventListener('click', () => {
      this.newTournament();
      this.renderTournament();
    });
    el.querySelector('[data-act="skip"]')!.addEventListener('click', () => {
      const cpus = playTournamentWithoutPlayer(Math.random, this.profile.roster, this.profile.styles, this.profile.energy);
      const startSkill = loadPlayerSkill();
      const endSkill = decaySkill(startSkill, Math.random);
      savePlayerSkill(endSkill);
      this.profile = recordSkippedTournament(this.profile, cpus, startSkill, endSkill);
      saveProfile(this.profile);
      this.tournament = null;
      saveTournament(null);
      const lost = startSkill - endSkill;
      this.renderEntry(`You sat out Tournament #${number} and rested${lost > 0 ? ` · skill −${lost.toFixed(2)}` : ''}.`);
    });
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
  }

  private newTournament(): void {
    this.storeTournament(
      createTournament(
        Math.random,
        loadPlayerSkill(),
        this.profile.nextTournament,
        this.profile.roster,
        this.profile.styles,
        this.profile.energy,
      ),
    );
  }

  /** Saves the tournament and its entry in the player's history. */
  private storeTournament(t: Tournament): void {
    this.tournament = t;
    saveTournament(t);
    this.profile = saveTournamentRecord(this.profile, t);
    saveProfile(this.profile);
  }

  // ---------------------------------------------------------------- profile

  private renderRankings(): void {
    const rows = rankings(this.profile, loadPlayerSkill())
      .map(
        (r) => `
        <li class="${r.isPlayer ? 'me' : ''}">
          <span class="rank">${r.rank}</span>
          <span class="nm">${escapeHtml(r.name)}${r.style ? ` <small class="style">${STYLES[r.style].icon} ${STYLES[r.style].label}</small>` : ''}</span>
          <span class="en">${Math.round(r.energy * 100)}%</span>
          <b class="sk">${r.skill.toFixed(2)}</b>
        </li>`,
      )
      .join('');
    const el = $('#rankings');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Rankings</h2>
        <p class="tagline">All players by skill</p>
        <ol class="ranking">${rows}</ol>
        <button class="ghost" data-act="back">Back</button>
      </div>`;
    this.showScreen('rankings');
    el.querySelector('[data-act="back"]')!.addEventListener('click', () => this.showScreen('menu'));
  }

  private renderProfile(): void {
    const stats = profileStats(this.profile);
    const tile = (label: string, value: string) => `<div class="stat-tile"><span class="setting-label">${label}</span><b>${value}</b></div>`;
    const history = [...this.profile.tournaments]
      .reverse()
      .map((r) => {
        const tone = r.status === 'won' ? 'won' : r.status === 'playing' ? 'live' : 'out';
        const matches = r.matches
          .map(
            (m) => `
          <li>
            <span class="round-name">${m.round}</span>
            <span class="opp">${escapeHtml(m.opponent)} <small>${m.opponentSkill.toFixed(2)}</small></span>
            <span class="result ${m.won ? 'w' : 'l'}">${m.won ? 'W' : 'L'} ${m.score}</span>
          </li>`,
          )
          .join('');
        return `
        <section class="history-card">
          <div class="history-head">
            <h3>Tournament #${r.number}${r.tier ? ` · Tier ${r.tier}` : ''}</h3>
            <span class="outcome ${tone}">${r.status === 'won' ? '🏆 ' : ''}${outcomeLabel(r)}</span>
          </div>
          ${
            r.status === 'skipped'
              ? ''
              : `<p class="skill-change">Skill ${r.startSkill.toFixed(2)} → ${r.endSkill.toFixed(2)}${r.prize ? ` · ${dollars(r.prize)} won` : ''}${r.coaching ? ` · ${dollars(r.coaching)} coaching` : ''}</p>
          ${matches ? `<ul>${matches}</ul>` : '<p class="tbd">No matches played yet</p>'}`
          }
        </section>`;
      })
      .join('');
    const el = $('#profile');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Profile</h2>
        <div class="stat-tiles">
          ${tile('Skill', loadPlayerSkill().toFixed(2))}
          ${tile('Money', dollars(stats.prizeMoney))}
          ${tile('Tournaments', String(stats.tournaments))}
          ${tile('Titles', String(stats.titles))}
          ${tile('Matches', `${stats.matchesWon}–${stats.matchesLost}`)}
        </div>
        <button class="ghost" data-act="back">Back</button>
        <div class="history">${history || '<p class="tbd">No tournaments yet. Your results will appear here.</p>'}</div>
      </div>`;
    this.showScreen('profile');
    el.querySelector('[data-act="back"]')!.addEventListener('click', () => this.showScreen('menu'));
  }

  private tournamentSetup(): MatchSetup {
    const t = this.tournament!;
    const opp = t.entrants[currentOpponent(t)!];
    return {
      names: ['You', opp.name],
      skills: [t.entrants[HUMAN].skill, opp.skill],
      scoring: MATCH_SCORING,
      tournament: true,
      cpuStyle: opp.style ?? 'balanced',
      energy: [t.entrants[HUMAN].energy ?? FULL_ENERGY, t.entrants[currentOpponent(t)!].energy ?? FULL_ENERGY],
    };
  }

  private renderTournament(): void {
    const t = this.tournament!;
    const round = currentRound(t);
    const name = (i: number) => escapeHtml(t.entrants[i].name);
    const skill = (i: number) => t.entrants[i].skill.toFixed(2);
    const styleOf = (i: number) => {
      const id = t.entrants[i].style;
      return id ? STYLES[id] : null;
    };
    const styleIcon = (i: number) => {
      const s = styleOf(i);
      return s ? ` <span class="style-icon" title="${s.label}" aria-label="${s.label}">${s.icon}</span>` : '';
    };
    const energyTag = (i: number) => `<small class="energy-tag">${Math.round((t.entrants[i].energy ?? FULL_ENERGY) * 100)}% energy</small>`;
    const styleTag = (i: number) => {
      const s = styleOf(i);
      return s ? `<small class="style">${s.icon} ${s.label}</small>` : '';
    };

    let head: string;
    let actions: string;
    if (t.status === 'playing') {
      const opp = currentOpponent(t)!;
      head = `
        <p class="tagline">${ROUND_NAMES[round]}</p>
        <div class="next-match">
          <div><span class="player-chip p0">You</span><b>${skill(HUMAN)}</b>${energyTag(HUMAN)}</div>
          <span class="vs">vs</span>
          <div><span class="player-chip p1">${name(opp)}</span><b>${skill(opp)}</b>${energyTag(opp)}${styleTag(opp)}</div>
        </div>`;
      actions = `
        <button class="primary big" data-act="play">Play ${ROUND_NAMES[round].toLowerCase()}</button>
        <button class="ghost" data-act="menu">Main menu</button>`;
    } else {
      const winner = champion(t);
      head =
        t.status === 'won'
          ? `<div class="trophy" aria-hidden="true">🏆</div><p class="tagline">Champion! Final skill ${skill(HUMAN)}</p>`
          : `<p class="tagline">${outcomeLabel(summarizeTournament(t))}${winner === null ? '' : ` · ${name(winner)} won`}</p>`;
      actions = `
        <button class="primary big" data-act="new">Next tournament</button>
        <button class="ghost" data-act="menu">Main menu</button>`;
    }

    const rounds = ROUND_NAMES.map((roundName, r) => {
      if (r >= t.draws.length) return `<section class="round"><h3>${roundName}</h3><p class="tbd">To be decided</p></section>`;
      const results = t.results[r];
      const rows = pairings(t, r)
        .map((pair, i) => {
          const res = results?.[i];
          // Played matches show the skill each player had at the time; upcoming ones their current skill.
          const cell = (p: number, side: 0 | 1) =>
            `<span class="${res ? (res.winner === p ? 'won' : 'lost') : ''} ${p === HUMAN ? 'me' : ''}"><small class="seed">${seedOf(t, p)}</small><span class="nm">${name(p)}</span>${styleIcon(p)} <small class="sk">${(res ? res.skills[side] : t.entrants[p].skill).toFixed(2)}</small></span>`;
          return `<li>${cell(pair[0], 0)}<span class="vs">vs</span>${cell(pair[1], 1)}<span class="score">${res ? res.score : ''}</span></li>`;
        })
        .join('');
      return `<section class="round"><h3>${roundName}</h3><ul>${rows}</ul></section>`;
    }).join('');

    const el = $('#tournament');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Tournament #${t.number} · Tier ${t.tier}</h2>
        ${head}
        ${actions}
        <div class="bracket">${rounds}</div>
      </div>`;
    this.showScreen('tournament');
    el.querySelector('[data-act="play"]')?.addEventListener('click', () => {
      this.sound.unlock();
      this.startMatch(this.tournamentSetup());
    });
    el.querySelector('[data-act="new"]')?.addEventListener('click', () => this.renderEntry());
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
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
      <p>Energy is the bar by each name. Practice matches start at full energy. Tournament energy carries over: from
      one round to the next and from one tournament to the next, with a 30% rest each time. Before a tournament you can
      skip it to rest for another 30%, but your rivals keep improving while you are out. CPUs skip when they are below
      50% energy, and sometimes at random. Running costs energy: defending,
      especially drop shots, and most of all changing direction after a wrong read. You win a little back after
      every point and more at changeovers.</p>
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
      <h3>CPU styles</h3>
      <p>Every CPU player has a style it always plays with. It doesn't learn from you, but it leans on its favourite
      choices, so watch what your opponent does and adapt. Styles are dealt out again when you start fresh.</p>
      <ul>${STYLE_IDS.map((id) => `<li>${STYLES[id].icon} <b>${STYLES[id].label}</b>: ${STYLES[id].description}</li>`).join('')}</ul>
      <h3>Playing online</h3>
      <p>Find an opponent pairs you with another player who is looking, closest rating first. If nobody turns up
      within 15 seconds you play a bot instead: it's shown as 🤖 with its playing style, it can't see your choices,
      and bot matches don't change your rating.</p>
      <p>Play online can also invite a friend by link or code. Both of you play at skill 0.50, so only your decisions and the
      dice count. Choices are revealed together once both of you have locked in, and there's no time limit. If you
      reload or come back later, Resume online match picks up where you left off; Resign (in the menu) ends it as a loss. Your
      online rating starts at 1000 and moves like chess Elo; it's separate from your career skill.</p>
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
        <li>Skill is added to every shot and read. In a practice match you pick yours and the CPU's (0.3 Beginner to 0.7 Legend).</li>
        <li>In a tournament everyone starts at 0.30 and skill carries over from one tournament to the next. Beating a stronger player gains a lot (up to 0.06); beating a much weaker one gains almost nothing. The loser drops by the same amount.</li>
        <li>Each tournament has two draws played at the same time. Tier 1 is the strongest eight players who enter, Tier 2 the rest, so who rests moves the cut-off. The draw is seeded by skill, like real tennis: the small number by each name is the seed. Top seeds open against the lowest (1 v 8, 2 v 7, …), and the two strongest can only meet in the final.</li>
        <li>Tournaments pay prize money after every match: Tier 2 pays $10 for playing the quarterfinal, then $10, $20 and $40 for winning each round ($80 for a title); Tier 1 pays $25, $25, $50 and $100 ($200).</li>
        <li>After a tournament loss you can buy one coaching review: +0.01 skill and a look at what your opponent kept doing. It costs $100 at skill 0.30 and $20 more for every 0.1 above that.</li>
        <li>Skipping a tournament costs 0.01–0.05 skill, but never takes you below 0.30.</li>
        <li>You can tap the glowing zones on the court instead of the buttons.</li>
      </ul>`;
  }
}

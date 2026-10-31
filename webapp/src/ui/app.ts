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
import { Match, type ExchangeOutcome } from '../engine/match';
import { other, type Calculation, type Choice, type Duel, type PlayerIndex } from '../engine/resolution';
import { MATCH_SCORING, type ScoringConfig } from '../engine/scoring';
import {
  emptyProfile,
  outcomeLabel,
  parseProfile,
  profileStats,
  saveTournamentRecord,
  type Profile,
} from '../engine/profile';
import { SKILL_TIERS, skillTier, type SkillTierId } from '../engine/skill';
import {
  HUMAN,
  MAX_SKILL,
  ROUND_NAMES,
  TOURNAMENT_START_SKILL,
  createTournament,
  currentOpponent,
  currentRound,
  pairings,
  parseTournament,
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
}


const SETTINGS_KEY = 'tennis-strategy-settings';
const DEFAULT_SETTINGS: Settings = { playerSkill: 'pro', cpuSkill: 'pro', muted: false };

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
    return (raw && parseProfile(JSON.parse(raw))) || emptyProfile();
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
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const fmt = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
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
  private readonly ai = new AiOpponent();
  private names: [string, string] = ['You', 'CPU'];
  private setup: MatchSetup | null = null;
  private tournament = loadTournament();
  private profile = loadProfile();
  /** Bumped whenever a match is abandoned so stale async flows stop. */
  private generation = 0;
  private markerTap: ((id: string) => void) | null = null;

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
    menu.querySelector('[data-act="settings"]')!.addEventListener('click', () => this.renderSettings());
    menu.querySelector('[data-act="profile"]')!.addEventListener('click', () => this.renderProfile());
    menu.querySelector('[data-act="tournament"]')!.addEventListener('click', () => {
      this.sound.unlock();
      if (!this.tournament) this.newTournament();
      this.renderTournament();
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
    for (const b of document.querySelectorAll('[data-open-help]')) {
      b.addEventListener('click', () => $('#help').classList.remove('hidden'));
    }
    $('[data-close-help]').addEventListener('click', () => $('#help').classList.add('hidden'));
    $('#help').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) $('#help').classList.add('hidden');
    });
  }

  /** Shows one full-screen overlay (or none, to reveal the match). */
  private showScreen(screen: 'menu' | 'practice' | 'tournament' | 'profile' | 'settings' | 'over' | null): void {
    for (const id of ['menu', 'practice', 'tournament', 'profile', 'settings', 'over']) $(`#${id}`).classList.toggle('hidden', id !== screen);
    $('#resume').classList.toggle('hidden', !(this.match && !this.match.isOver));
  }

  private practiceSetup(): MatchSetup {
    return {
      names: ['You', 'CPU'],
      skills: [skillTier(this.settings.playerSkill)!.skill, skillTier(this.settings.cpuSkill)!.skill],
      scoring: MATCH_SCORING,
      tournament: false,
    };
  }

  // ---------------------------------------------------------------- match flow

  private startMatch(setup: MatchSetup): void {
    this.generation++;
    this.setup = setup;
    this.names = setup.names;
    const firstServer: PlayerIndex = Math.random() < 0.5 ? 0 : 1;
    this.match = new Match(
      [
        { name: setup.names[0], skill: setup.skills[0] },
        { name: setup.names[1], skill: setup.skills[1] },
      ],
      setup.scoring,
      firstServer,
    );
    this.showScreen(null);
    this.scene.animator.speed = 1;
    void this.scene.resetPoint(firstServer, 'deuce', false);
    this.renderScoreboard();
    this.callout(`${this.names[firstServer]} to serve`, 'Coin toss');
    void this.run(this.generation);
  }

  private async run(gen: number): Promise<void> {
    const match = this.match!;
    const alive = () => gen === this.generation;
    while (alive() && !match.isOver) {
      const choice = await this.choose(0);
      if (!alive()) return;
      match.submit(0, choice);
      match.submit(1, this.ai.choose(match, 1));

      const choices = [...match.lockedChoices] as [Choice, Choice];
      const outcome = match.resolve(Math.random);

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
    if (alive() && match.isOver) this.renderMatchOver();
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
        <span class="calc-math">${c.skill.toFixed(2)} <i>${fmt(c.modifier)}</i>${c.position === 0 ? '' : ` <i class="position ${c.position > 0 ? 'good' : 'bad'}">${fmt(c.position)}</i>`}${c.energy === 0 ? '' : ` <i class="energy">${fmt(c.energy)}</i>`} <i class="luck">${fmt(c.random)}</i> = <b>${c.total.toFixed(2)}</b></span>
      </div>`;
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
        <span class="context">skill <i>shot/read</i> <i class="position good">position</i> <i class="energy">energy</i> <i class="luck">luck</i></span>
      </div>
      <div class="duels">
        ${ex.duels
          .map(
            (d) => `
          <div class="duel ${d.hitterWins ? 'hit' : 'held'}">
            <div class="duel-title"><span>${verb[d.kind]} · ${escapeHtml(shotLabel(d))}</span><b>${this.duelResult(d)}</b></div>
            ${this.calcRow(d.hitter, this.shotWhat(d), d.shotCalc)}
            ${this.calcRow(d.defender, `read ${escapeHtml(readLabel(d))}`, d.readCalc)}
          </div>`,
          )
          .join('')}
      </div>
      <button class="primary">${nextLabel}</button>`;
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
          <span class="sb-name"><span class="player-dot p${p}"></span>${escapeHtml(this.names[p])}</span>
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
      const next = recordHumanMatch(t, w === 0, m.score.completedSets);
      this.storeTournament(next);
      // Skill won in the tournament stays with the player for the next one.
      savePlayerSkill(next.entrants[HUMAN].skill);
      const gain = next.entrants[HUMAN].skill - before;
      subtitle = w === 0 ? `${roundName} won · skill +${gain.toFixed(2)}` : `Knocked out in the ${roundName.toLowerCase()}`;
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
          inTournament
            ? '<button class="primary big" data-act="bracket">Continue</button>'
            : '<button class="primary big" data-act="again">Play again</button>'
        }
        <button class="ghost" data-act="menu">Main menu</button>
      </div>`;
    this.showScreen('over');
    el.querySelector('[data-act="again"]')?.addEventListener('click', () => this.startMatch(this.setup!));
    el.querySelector('[data-act="bracket"]')?.addEventListener('click', () => this.renderTournament());
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.showScreen('menu'));
    $('#panel').innerHTML = '';
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

  private newTournament(): void {
    this.storeTournament(createTournament(Math.random, loadPlayerSkill(), this.profile.nextTournament));
  }

  /** Saves the tournament and its entry in the player's history. */
  private storeTournament(t: Tournament): void {
    this.tournament = t;
    saveTournament(t);
    this.profile = saveTournamentRecord(this.profile, t);
    saveProfile(this.profile);
  }

  // ---------------------------------------------------------------- profile

  private renderProfile(): void {
    const stats = profileStats(this.profile);
    const tile = (label: string, value: string) => `<div class="stat-tile"><span class="setting-label">${label}</span><b>${value}</b></div>`;
    const history = [...this.profile.tournaments]
      .reverse()
      .map((r) => {
        const tone = r.status === 'won' ? 'won' : r.status === 'lost' ? 'out' : 'live';
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
            <h3>Tournament #${r.number}</h3>
            <span class="outcome ${tone}">${r.status === 'won' ? '🏆 ' : ''}${outcomeLabel(r)}</span>
          </div>
          <p class="skill-change">Skill ${r.startSkill.toFixed(2)} → ${r.endSkill.toFixed(2)}</p>
          ${matches ? `<ul>${matches}</ul>` : '<p class="tbd">No matches played yet</p>'}
        </section>`;
      })
      .join('');
    const el = $('#profile');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Profile</h2>
        <div class="stat-tiles">
          ${tile('Skill', loadPlayerSkill().toFixed(2))}
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
    };
  }

  private renderTournament(): void {
    const t = this.tournament!;
    const round = currentRound(t);
    const name = (i: number) => escapeHtml(t.entrants[i].name);
    const skill = (i: number) => t.entrants[i].skill.toFixed(2);

    let head: string;
    let actions: string;
    if (t.status === 'playing') {
      const opp = currentOpponent(t)!;
      head = `
        <p class="tagline">${ROUND_NAMES[round]}</p>
        <div class="next-match">
          <div><span class="player-chip p0">You</span><b>${skill(HUMAN)}</b></div>
          <span class="vs">vs</span>
          <div><span class="player-chip p1">${name(opp)}</span><b>${skill(opp)}</b></div>
        </div>`;
      actions = `
        <button class="primary big" data-act="play">Play ${ROUND_NAMES[round].toLowerCase()}</button>
        <button class="ghost" data-act="menu">Main menu</button>`;
    } else {
      const lastRound = ROUND_NAMES[t.results.length - 1];
      head =
        t.status === 'won'
          ? `<div class="trophy" aria-hidden="true">🏆</div><p class="tagline">Champion! Final skill ${skill(HUMAN)}</p>`
          : `<p class="tagline">Knocked out in the ${lastRound.toLowerCase()}</p>`;
      actions = `
        <button class="primary big" data-act="new">New tournament</button>
        <button class="ghost" data-act="menu">Main menu</button>`;
    }

    const rounds = ROUND_NAMES.map((roundName, r) => {
      if (r >= t.draws.length) return `<section class="round"><h3>${roundName}</h3><p class="tbd">To be decided</p></section>`;
      const results = t.results[r];
      const rows = pairings(t, r)
        .map((pair, i) => {
          const res = results?.[i];
          const cell = (p: number) =>
            `<span class="${res ? (res.winner === p ? 'won' : 'lost') : ''} ${p === HUMAN ? 'me' : ''}">${name(p)}</span>`;
          return `<li>${cell(pair[0])}<span class="vs">vs</span>${cell(pair[1])}<span class="score">${res ? res.score : ''}</span></li>`;
        })
        .join('');
      return `<section class="round"><h3>${roundName}</h3><ul>${rows}</ul></section>`;
    }).join('');

    const el = $('#tournament');
    el.innerHTML = `
      <div class="menu-card">
        <h2>Tournament #${t.number}</h2>
        ${head}
        ${actions}
        <div class="bracket">${rounds}</div>
      </div>`;
    this.showScreen('tournament');
    el.querySelector('[data-act="play"]')?.addEventListener('click', () => {
      this.sound.unlock();
      this.startMatch(this.tournamentSetup());
    });
    el.querySelector('[data-act="new"]')?.addEventListener('click', () => {
      this.newTournament();
      this.renderTournament();
    });
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
      <p>Both players start every match with full energy (the bar by each name). Running costs energy: defending,
      especially drop shots, and most of all changing direction after a wrong read. You win a little back after
      every point and more at changeovers.</p>
      <p>While you are fresh you can scramble back from a wrong read and recover up to half its penalty, so early
      rallies last longer. As you tire that recovery fades, and every shot and read loses up to −0.15.</p>
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
        <li>In a tournament the CPUs start at 0.30 and each round won adds a random 0.00–0.05. Your skill carries over from one tournament to the next.</li>
        <li>You can tap the glowing zones on the court instead of the buttons.</li>
      </ul>`;
  }
}

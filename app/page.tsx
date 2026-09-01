'use client';

import {
  AudioLines,
  CheckCircle2,
  Crown,
  Flag,
  Keyboard,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { pinyin } from 'pinyin-pro';
import {
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RuleMode = 'char' | 'sound' | 'idiom';
type PlayMode = 'practice' | 'pk';
type Phase = 'setup' | 'playing' | 'finished';
type FeedbackType = 'info' | 'success' | 'fail';

type RecognitionResultEvent = {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
    };
  };
};

type RecognitionErrorEvent = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

type Group = { id: number; name: string; score: number };

type ChainEntry = {
  id: string;
  word: string;
  group?: string;
  mode: RuleMode;
  isStart?: boolean;
};

type Attempt = {
  id: string;
  word: string;
  group: string;
  mode: RuleMode;
  success: boolean;
  message: string;
};

type Snapshot = {
  chain: ChainEntry[];
  attempts: Attempt[];
  groups: Group[];
  currentGroupIndex: number;
};

const RULES: Record<
  RuleMode,
  {
    icon: string;
    label: string;
    short: string;
    description: string;
    example: string;
    accent: string;
    soft: string;
    text: string;
    border: string;
    shadow: string;
  }
> = {
  char: {
    icon: '🔵',
    label: '尾字相同',
    short: '📝 尾字',
    description: '新词的首字，要和上一个词的尾字一模一样。',
    example: '语文 → 文化',
    accent: 'bg-sky-500 hover:bg-sky-400',
    soft: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    shadow: 'shadow-[0_6px_0_#0369a1]',
  },
  sound: {
    icon: '🟢',
    label: '尾音相同',
    short: '🔊 尾音',
    description: '新词首字的拼音和声调，要与上一个尾字完全相同。',
    example: '好事 shì → 世事 shì',
    accent: 'bg-emerald-500 hover:bg-emerald-400',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    shadow: 'shadow-[0_6px_0_#047857]',
  },
  idiom: {
    icon: '🟡',
    label: '成语接龙',
    short: '📚 成语',
    description: '必须说四字成语，首字还要接上前一个成语的尾字。',
    example: '一马当先 → 先入为主',
    accent: 'bg-amber-400 hover:bg-amber-300',
    soft: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    shadow: 'shadow-[0_6px_0_#b45309]',
  },
};

const GROUP_NAMES = ['向日葵组', '小火箭组', '智慧星组', '彩虹组'];
const GROUP_STYLES = [
  'border-sky-300 bg-sky-50 text-sky-800',
  'border-emerald-300 bg-emerald-50 text-emerald-800',
  'border-amber-300 bg-amber-50 text-amber-800',
  'border-rose-300 bg-rose-50 text-rose-800',
];

const COMMON_IDIOMS = [
  '一马当先',
  '先入为主',
  '主次分明',
  '明明白白',
  '白手起家',
  '家喻户晓',
  '晓风残月',
  '月明星稀',
  '稀奇古怪',
  '怪声怪气',
  '气象万千',
  '千军万马',
  '马到成功',
  '功成名就',
  '就事论事',
  '事半功倍',
  '倍道而进',
  '进退两难',
  '难能可贵',
  '贵人多忘',
];

const CONFETTI = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 7) * 0.11}s`,
  color: ['#38bdf8', '#34d399', '#fbbf24', '#fb7185'][index % 4],
}));

let idCounter = 0;

function createId() {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function normalizeWord(raw: string) {
  return raw
    .trim()
    .replace(/^[\s，。！？、,.!?；;：:“”"'‘’]+/u, '')
    .replace(/[\s，。！？、,.!?；;：:“”"'‘’]+$/u, '')
    .replace(/\s+/gu, '')
    .normalize('NFC');
}

function wordChars(word: string) {
  return Array.from(word);
}

function isHanWord(word: string) {
  return /^[\u3400-\u4dbf\u4e00-\u9fff]+$/u.test(word);
}

function wordPinyin(word: string) {
  return pinyin(word, { type: 'array' }) as string[];
}

function subscribeToSpeechSupport() {
  return () => undefined;
}

function getSpeechSupportSnapshot() {
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

function getSpeechSupportServerSnapshot() {
  return true;
}

export default function Home() {
  const [rule, setRule] = useState<RuleMode>('char');
  const [playMode, setPlayMode] = useState<PlayMode>('practice');
  const [phase, setPhase] = useState<Phase>('setup');
  const [startWord, setStartWord] = useState('春天');
  const [groupCount, setGroupCount] = useState(2);
  const [groupNames, setGroupNames] = useState(GROUP_NAMES);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [feedback, setFeedback] = useState<{
    type: FeedbackType;
    message: string;
    detail?: string;
  }>({ type: 'info', message: '先选择玩法，再设定一个起始词吧！' });
  const [isRecording, setIsRecording] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [idiomState, setIdiomState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [showResults, setShowResults] = useState(false);

  const idiomSetRef = useRef(new Set(COMMON_IDIOMS));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionSessionRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordEndRef = useRef<HTMLDivElement | null>(null);
  const speechSupported = useSyncExternalStore(
    subscribeToSpeechSupport,
    getSpeechSupportSnapshot,
    getSpeechSupportServerSnapshot,
  );

  const theme = RULES[rule];
  const accentInk = rule === 'idiom' ? 'text-amber-950' : 'text-white';
  const previousWord = chain.at(-1)?.word ?? '';
  const previousChars = wordChars(previousWord);
  const targetChar = previousChars.at(-1) ?? '';
  const targetPinyin =
    rule === 'sound' && previousWord
      ? (wordPinyin(previousWord).at(-1) ?? '')
      : '';

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => b.score - a.score),
    [groups],
  );
  const topScore = sortedGroups[0]?.score ?? 0;
  const winners = sortedGroups.filter((group) => group.score === topScore);

  useEffect(() => {
    let active = true;
    fetch('/idioms.json')
      .then((response) => {
        if (!response.ok) throw new Error('idiom dictionary unavailable');
        return response.json() as Promise<string[]>;
      })
      .then((words) => {
        if (!active) return;
        idiomSetRef.current = new Set([...COMMON_IDIOMS, ...words]);
        setIdiomState('ready');
      })
      .catch(() => {
        if (active) setIdiomState('error');
      });

    return () => {
      active = false;
      recognitionSessionRef.current += 1;
      recognitionRef.current?.abort();
      void audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    recordEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [chain.length, attempts.length]);

  function playFeedbackSound(kind: 'success' | 'fail') {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context =
      audioContextRef.current?.state === 'closed'
        ? new AudioContextClass()
        : (audioContextRef.current ?? new AudioContextClass());
    audioContextRef.current = context;
    if (context.state === 'suspended') void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = kind === 'success' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'success' ? 660 : 260, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === 'success' ? 990 : 210,
      now + 0.22,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.31);
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === 'closed'
    ) {
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
  }

  function cancelRecognition() {
    recognitionSessionRef.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setIsRecording(false);
  }

  function validateStartingWord(word: string) {
    const chars = wordChars(word);
    if (!word || !isHanWord(word)) return '请输入只包含汉字的起始词。';

    if (rule === 'idiom') {
      if (idiomState === 'loading') return '成语词典正在加载，请稍等一下。';
      if (idiomState === 'error') return '成语词典加载失败，请刷新页面重试。';
      if (chars.length !== 4 || !idiomSetRef.current.has(word)) {
        return '起始内容也要是四字成语哦！';
      }
      return null;
    }

    if (chars.length < 2) return '起始词至少要有两个汉字。';
    return null;
  }

  function startGame() {
    const word = normalizeWord(startWord);
    const error = validateStartingWord(word);
    if (error) {
      setFeedback({ type: 'fail', message: `❌ ${error}` });
      playFeedbackSound('fail');
      return;
    }

    const nextGroups = Array.from({ length: groupCount }, (_, index) => ({
      id: index + 1,
      name: groupNames[index].trim() || `第${index + 1}组`,
      score: 0,
    }));

    setStartWord(word);
    setGroups(nextGroups);
    setCurrentGroupIndex(0);
    setChain([{ id: createId(), word, mode: rule, isStart: true }]);
    setAttempts([]);
    setHistory([]);
    setManualInput('');
    setPhase('playing');
    setShowResults(false);
    setFeedback({
      type: 'info',
      message:
        playMode === 'pk'
          ? `🚩 ${nextGroups[0].name}先来，准备接龙！`
          : '🎙️ 起始词已设定，谁先来挑战？',
    });
  }

  function judgeAttempt(word: string) {
    const currentChars = wordChars(word);
    const previous = chain.at(-1)?.word ?? '';
    const previousTail = wordChars(previous).at(-1) ?? '';
    const currentHead = currentChars[0] ?? '';

    if (!word || !isHanWord(word) || currentChars.length < 2) {
      return {
        success: false,
        message: '❌ 请说一个至少两个汉字的词语哦！',
      };
    }

    if (rule === 'idiom') {
      if (currentChars.length !== 4 || !idiomSetRef.current.has(word)) {
        return { success: false, message: '❌ 要说出四字成语哦！' };
      }
      if (currentHead !== previousTail) {
        return {
          success: false,
          message: `❌ 首字要接上“${previousTail}”哦！`,
        };
      }
      return {
        success: true,
        message: '✅ 成语接龙成功！',
        detail: `${previous} → ${word}`,
      };
    }

    if (rule === 'char') {
      if (currentHead !== previousTail) {
        return {
          success: false,
          message: `❌ 首字要和“${previousTail}”一样哦！`,
          detail: `你说的是“${currentHead}”开头`,
        };
      }
      return {
        success: true,
        message: '✅ 接龙成功！',
        detail: `${previous} → ${word}`,
      };
    }

    const expected = wordPinyin(previous).at(-1) ?? '';
    const actual = wordPinyin(word)[0] ?? '';
    if (actual !== expected) {
      return {
        success: false,
        message: '❌ 拼音和声调都要一样哦！',
        detail: `“${previousTail}”是 ${expected}，“${currentHead}”是 ${actual}`,
      };
    }

    return {
      success: true,
      message: '✅ 尾音接龙成功！',
      detail: `${previousTail} ${expected} → ${currentHead} ${actual}`,
    };
  }

  function processAttempt(rawWord: string, fromSpeech = false) {
    if (phase !== 'playing' || (isRecording && !fromSpeech)) return;
    const word = normalizeWord(rawWord);
    const result = judgeAttempt(word);
    const actor =
      playMode === 'pk'
        ? (groups[currentGroupIndex]?.name ?? `第${currentGroupIndex + 1}组`)
        : '全班同学';

    setHistory((items) => [
      ...items.slice(-19),
      { chain, attempts, groups, currentGroupIndex },
    ]);
    setAttempts((items) => [
      ...items,
      {
        id: createId(),
        word: word || '（未识别）',
        group: actor,
        mode: rule,
        success: result.success,
        message: result.message,
      },
    ]);

    if (result.success) {
      setChain((items) => [
        ...items,
        { id: createId(), word, group: actor, mode: rule },
      ]);
      if (playMode === 'pk') {
        setGroups((items) =>
          items.map((group, index) =>
            index === currentGroupIndex
              ? { ...group, score: group.score + 1 }
              : group,
          ),
        );
      }
    }

    let detail = result.detail;
    if (playMode === 'pk' && groups.length) {
      const nextIndex = (currentGroupIndex + 1) % groups.length;
      const scoreText = result.success ? '+1 分！' : '本组不加分。';
      detail = `${detail ? `${detail} · ` : ''}${scoreText} 下一组：${groups[nextIndex].name}`;
      setCurrentGroupIndex(nextIndex);
    }

    setFeedback({
      type: result.success ? 'success' : 'fail',
      message: result.message,
      detail,
    });
    setManualInput('');
    playFeedbackSound(result.success ? 'success' : 'fail');
  }

  function submitManual(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    unlockAudio();
    processAttempt(manualInput);
  }

  function startOrStopRecording() {
    if (phase !== 'playing') return;
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setFeedback({
        type: 'fail',
        message: '这个浏览器暂不支持语音识别。',
        detail: '请使用 Chrome 或 Edge，或由老师在下方输入答案。',
      });
      return;
    }

    const recognition = new Recognition();
    const sessionId = recognitionSessionRef.current + 1;
    recognitionSessionRef.current = sessionId;
    recognitionRef.current = recognition;
    let gotSpeechResult = false;
    let speechError = false;
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (recognitionSessionRef.current !== sessionId) return;
      gotSpeechResult = true;
      setIsRecording(false);
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      processAttempt(transcript, true);
    };

    recognition.onerror = (event) => {
      if (recognitionSessionRef.current !== sessionId) return;
      speechError = true;
      setIsRecording(false);
      const permissionDenied =
        event.error === 'not-allowed' || event.error === 'service-not-allowed';
      setFeedback({
        type: 'fail',
        message: permissionDenied
          ? '麦克风权限没有开启。'
          : '这次没有听清楚，不计分也不换组。',
        detail: permissionDenied
          ? '请允许网页使用麦克风，或由老师键盘输入。'
          : '请靠近麦克风再试一次。',
      });
    };

    recognition.onend = () => {
      if (recognitionSessionRef.current !== sessionId) return;
      recognitionRef.current = null;
      setIsRecording(false);
      if (!gotSpeechResult && !speechError) {
        setFeedback({
          type: 'fail',
          message: '这次没有听到答案，不计分也不换组。',
          detail: '可以重新录音，或由老师键盘输入。',
        });
      }
    };

    try {
      unlockAudio();
      recognition.start();
      setIsRecording(true);
      setFeedback({
        type: 'info',
        message: '🎧 正在听，请清楚地说出答案……',
        detail: '说完后稍等一下，系统会自动判断。',
      });
    } catch {
      cancelRecognition();
      setFeedback({
        type: 'fail',
        message: '录音没有成功启动，请再试一次。',
      });
    }
  }

  function undoLastAttempt() {
    const snapshot = history.at(-1);
    if (!snapshot) return;
    cancelRecognition();
    setChain(snapshot.chain);
    setAttempts(snapshot.attempts);
    setGroups(snapshot.groups);
    setCurrentGroupIndex(snapshot.currentGroupIndex);
    setHistory((items) => items.slice(0, -1));
    setPhase('playing');
    setShowResults(false);
    setFeedback({
      type: 'info',
      message: '↩️ 已撤销上一次判定。',
      detail: '接龙、积分和轮次都已恢复。',
    });
  }

  function resetGame(skipConfirm = false) {
    if (
      !skipConfirm &&
      phase !== 'setup' &&
      !window.confirm('确定要清空本局的接龙记录和积分吗？')
    ) {
      return;
    }
    cancelRecognition();
    setPhase('setup');
    setChain([]);
    setAttempts([]);
    setGroups([]);
    setHistory([]);
    setCurrentGroupIndex(0);
    setManualInput('');
    setShowResults(false);
    setFeedback({ type: 'info', message: '已清空，可以开始新一局啦！' });
  }

  function finishCompetition() {
    if (playMode !== 'pk' || phase !== 'playing' || isRecording) return;
    setPhase('finished');
    setShowResults(true);
  }

  function updateGroupName(index: number, value: string) {
    setGroupNames((names) =>
      names.map((name, nameIndex) => (nameIndex === index ? value : name)),
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="border-b border-sky-100/90 bg-white/90 px-4 py-3 backdrop-blur sm:px-7">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-sky-500 text-2xl shadow-[0_5px_0_#0369a1]">
              🐉
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight sm:text-2xl">
                词语接龙 · 小组PK赛
              </h1>
              <p className="hidden text-sm font-semibold text-slate-500 sm:block">
                开动脑筋，把词语一个个接起来！
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              className="size-11 rounded-full border-2 bg-white"
              onClick={() => setSoundEnabled((enabled) => !enabled)}
              aria-label={soundEnabled ? '关闭音效' : '开启音效'}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-full border-2 bg-white px-4 font-black"
              onClick={() => resetGame()}
            >
              <RotateCcw /> 重置
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7">
        <div className="mb-5 flex flex-col items-center justify-between gap-4 rounded-[28px] border border-white/80 bg-white/75 p-3 shadow-[0_14px_40px_rgb(14_116_144/8%)] backdrop-blur lg:flex-row">
          <div className="grid w-full grid-cols-3 gap-2 lg:w-auto">
            {(Object.keys(RULES) as RuleMode[]).map((mode) => {
              const item = RULES[mode];
              const selected = rule === mode;
              return (
                <Button
                  key={mode}
                  variant="ghost"
                  disabled={phase !== 'setup'}
                  aria-pressed={selected}
                  onClick={() => setRule(mode)}
                  className={`min-h-14 rounded-2xl px-2 text-xs font-black sm:px-6 sm:text-base ${
                    selected
                      ? `${item.accent} ${item.shadow} ${
                          mode === 'idiom'
                            ? 'text-amber-950 hover:text-amber-950'
                            : 'text-white hover:text-white'
                        }`
                      : 'bg-slate-50 text-slate-600 hover:bg-sky-50'
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span> {item.label}
                </Button>
              );
            })}
          </div>

          <div className="flex w-full rounded-2xl bg-slate-100 p-1.5 lg:w-auto">
            {(
              [
                ['practice', '🌱 自由练习'],
                ['pk', '🏆 小组PK'],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                variant="ghost"
                disabled={phase !== 'setup'}
                aria-pressed={playMode === mode}
                onClick={() => setPlayMode(mode)}
                className={`h-12 flex-1 rounded-xl px-5 font-black ${
                  playMode === mode
                    ? 'bg-white text-sky-700 shadow-sm hover:bg-white'
                    : 'text-slate-500'
                }`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {phase !== 'setup' && playMode === 'pk' && (
          <section className="mb-5" aria-label="小组积分看板">
            <div
              className={`grid gap-3 grid-cols-2 ${groups.length > 2 ? 'lg:grid-cols-4' : ''}`}
            >
              {groups.map((group, index) => {
                const active =
                  phase === 'playing' && index === currentGroupIndex;
                return (
                  <div
                    key={group.id}
                    className={`relative rounded-3xl border-2 p-4 transition ${GROUP_STYLES[index]} ${
                      active
                        ? 'ring-4 ring-violet-300 ring-offset-2 ring-offset-background'
                        : 'opacity-90'
                    }`}
                  >
                    {active && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">
                        轮到我们
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black sm:text-xl">
                          {group.name}
                        </p>
                        <p className="text-xs font-bold opacity-65">
                          第 {group.id} 组
                        </p>
                      </div>
                      <p className="text-4xl font-black tabular-nums sm:text-5xl">
                        {group.score}
                        <span className="ml-1 text-sm">分</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {phase === 'setup' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
            <section
              className={`rounded-[34px] border-2 ${theme.border} bg-white p-5 shadow-[0_20px_60px_rgb(14_116_144/10%)] sm:p-8`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-flex rounded-full ${theme.soft} px-3 py-1.5 text-sm font-black ${theme.text}`}
                  >
                    {theme.short}
                  </span>
                  <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                    设置这一局
                  </h2>
                  <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-500 sm:text-lg">
                    {theme.description}
                  </p>
                </div>
                {rule === 'idiom' && (
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-black ${
                      idiomState === 'ready'
                        ? 'bg-emerald-100 text-emerald-700'
                        : idiomState === 'loading'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {idiomState === 'ready'
                      ? '✓ 29,000+ 成语已就绪'
                      : idiomState === 'loading'
                        ? '成语词典加载中…'
                        : '词典加载失败'}
                  </span>
                )}
              </div>

              {playMode === 'pk' && (
                <div className="mt-7 border-t border-dashed border-slate-200 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-black">参赛小组</p>
                    <div className="flex rounded-2xl bg-slate-100 p-1">
                      {[2, 3, 4].map((count) => (
                        <Button
                          key={count}
                          variant="ghost"
                          onClick={() => setGroupCount(count)}
                          className={`size-11 rounded-xl font-black ${
                            groupCount === count
                              ? 'bg-white text-violet-700 shadow-sm hover:bg-white'
                              : 'text-slate-500'
                          }`}
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: groupCount }, (_, index) => (
                      <label key={index} className="block">
                        <span className="mb-1.5 block text-sm font-black text-slate-500">
                          第 {index + 1} 组名称
                        </span>
                        <Input
                          value={groupNames[index]}
                          onChange={(event) =>
                            updateGroupName(index, event.target.value)
                          }
                          maxLength={10}
                          className="h-13 rounded-2xl border-2 bg-slate-50 px-4 text-lg font-bold"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-7 border-t border-dashed border-slate-200 pt-6">
                <label htmlFor="start-word" className="text-lg font-black">
                  起始{rule === 'idiom' ? '成语' : '词语'}
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="start-word"
                    value={startWord}
                    onChange={(event) => setStartWord(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') startGame();
                    }}
                    placeholder={rule === 'idiom' ? '如：一马当先' : '如：春天'}
                    className="h-16 rounded-2xl border-2 bg-slate-50 px-5 text-2xl font-black tracking-wider"
                  />
                  <Button
                    onClick={startGame}
                    className={`h-16 shrink-0 rounded-2xl px-8 text-lg font-black ${accentInk} ${theme.accent} ${theme.shadow}`}
                  >
                    {playMode === 'pk' ? <Trophy /> : <Sparkles />}
                    {playMode === 'pk' ? '开始比赛' : '设定并开始'}
                  </Button>
                </div>
                <output
                  aria-live="polite"
                  className={`mt-4 block rounded-2xl px-4 py-3 text-sm font-black ${
                    feedback.type === 'fail'
                      ? 'bg-rose-50 text-rose-700'
                      : `${theme.soft} ${theme.text}`
                  }`}
                >
                  {feedback.message}
                </output>
              </div>
            </section>

            <aside className="relative overflow-hidden rounded-[34px] border-2 border-amber-100 bg-[#fffdf7] p-6 shadow-[0_20px_60px_rgb(180_83_9/8%)] sm:p-8">
              <div className="absolute -right-12 -top-12 size-40 rounded-full bg-amber-100/70" />
              <div className="relative">
                <span className="text-5xl" aria-hidden="true">
                  🧩
                </span>
                <p className="mt-4 text-sm font-black text-amber-600">
                  本局玩法
                </p>
                <h2 className="mt-1 text-3xl font-black">三步马上开玩</h2>
                <ol className="mt-7 space-y-5">
                  {[
                    [
                      '1',
                      '老师设起点',
                      `输入一个起始${rule === 'idiom' ? '成语' : '词语'}`,
                    ],
                    ['2', '学生说答案', '点击大麦克风，清楚地说出来'],
                    [
                      '3',
                      '系统来判断',
                      playMode === 'pk'
                        ? '答对加 1 分，然后自动换组'
                        : '答对就入链，答错可以再试',
                    ],
                  ].map(([number, title, copy]) => (
                    <li key={number} className="flex gap-4">
                      <span
                        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${theme.accent} font-black ${accentInk}`}
                      >
                        {number}
                      </span>
                      <div>
                        <p className="text-lg font-black">{title}</p>
                        <p className="mt-0.5 font-semibold leading-6 text-slate-500">
                          {copy}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={`mt-7 rounded-2xl ${theme.soft} p-4`}>
                  <p className={`text-sm font-black ${theme.text}`}>示例</p>
                  <p className="mt-1 text-xl font-black tracking-wide text-slate-800">
                    {theme.example}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(350px,.8fr)]">
            <section
              className={`relative overflow-hidden rounded-[34px] border-2 ${theme.border} bg-white p-5 shadow-[0_20px_60px_rgb(14_116_144/11%)] sm:p-8`}
            >
              <div
                className={`absolute -right-14 -top-14 size-52 rounded-full ${theme.soft}`}
              />
              <div className="absolute -bottom-16 -left-16 size-52 rounded-full bg-amber-100/50" />

              <div className="relative flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full ${theme.soft} px-4 py-2 text-sm font-black ${theme.text}`}
                  >
                    <Sparkles className="size-4" /> {theme.short}
                  </span>
                  {playMode === 'pk' && phase === 'playing' && (
                    <span className="rounded-full bg-violet-100 px-4 py-2 text-sm font-black text-violet-700">
                      🚩 轮到：{groups[currentGroupIndex]?.name}
                    </span>
                  )}
                  {phase === 'finished' && (
                    <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
                      本局已结束
                    </span>
                  )}
                </div>

                <p className="text-lg font-bold text-slate-500 sm:text-xl">
                  上一个{rule === 'idiom' ? '成语' : '词语'}是
                </p>
                <p className="mt-1 max-w-full break-all text-5xl font-black tracking-[0.1em] text-slate-900 sm:text-7xl">
                  {previousWord}
                </p>

                <div
                  className="my-6 flex items-center gap-3"
                  aria-hidden="true"
                >
                  <span className={`h-1 w-12 rounded-full ${theme.accent}`} />
                  <span className={`text-2xl ${theme.text}`}>↓</span>
                  <span className={`h-1 w-12 rounded-full ${theme.accent}`} />
                </div>

                <p className="text-xl font-black text-slate-600 sm:text-2xl">
                  {rule === 'sound' ? '请接这个读音' : '请接这个字'}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <strong
                    className={`grid size-16 place-items-center rounded-2xl ${theme.accent} ${theme.shadow} text-4xl ${accentInk}`}
                  >
                    {targetChar}
                  </strong>
                  {rule === 'sound' && (
                    <span className="rounded-2xl bg-emerald-50 px-5 py-3 text-3xl font-black text-emerald-700">
                      {targetPinyin}
                    </span>
                  )}
                  {rule === 'idiom' && (
                    <span className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                      四字成语
                    </span>
                  )}
                </div>

                {phase === 'playing' && (
                  <>
                    <Button
                      onClick={startOrStopRecording}
                      className={`relative mt-8 min-h-22 rounded-full px-9 text-xl font-black text-white sm:min-h-24 sm:px-12 sm:text-2xl ${
                        isRecording
                          ? 'bg-rose-600 shadow-[0_8px_0_#9f1239] hover:bg-rose-500'
                          : 'bg-rose-500 shadow-[0_8px_0_#be123c,0_18px_35px_rgb(244_63_94/25%)] hover:bg-rose-400'
                      }`}
                    >
                      {isRecording && (
                        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-rose-300/60" />
                      )}
                      <span className="grid size-12 place-items-center rounded-full bg-white/20">
                        {isRecording ? (
                          <MicOff className="size-7" />
                        ) : (
                          <Mic className="size-7" />
                        )}
                      </span>
                      {isRecording ? '说完了，点这里' : '点击开始录音'}
                    </Button>
                    <p className="mt-4 text-sm font-semibold text-slate-400">
                      {speechSupported
                        ? '使用浏览器语音识别 · 不保存原始录音'
                        : '当前浏览器不支持语音识别，可使用下方键盘输入'}
                    </p>
                  </>
                )}

                <output
                  aria-live="polite"
                  aria-atomic="true"
                  className={`mt-6 w-full max-w-2xl rounded-2xl border-2 px-5 py-4 text-left ${
                    feedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : feedback.type === 'fail'
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-sky-200 bg-sky-50 text-sky-800'
                  }`}
                >
                  <span className="flex items-center gap-2 text-lg font-black">
                    {feedback.type === 'success' ? (
                      <CheckCircle2 />
                    ) : feedback.type === 'fail' ? (
                      <XCircle />
                    ) : (
                      <AudioLines />
                    )}
                    {feedback.message}
                  </span>
                  {feedback.detail && (
                    <span className="mt-1 block pl-8 text-sm font-bold opacity-75 sm:text-base">
                      {feedback.detail}
                    </span>
                  )}
                </output>

                {phase === 'playing' && (
                  <form
                    onSubmit={submitManual}
                    className="mt-5 flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row"
                  >
                    <label className="sr-only" htmlFor="manual-answer">
                      老师键盘输入学生答案
                    </label>
                    <div className="relative flex-1">
                      <Keyboard className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="manual-answer"
                        value={manualInput}
                        onChange={(event) => setManualInput(event.target.value)}
                        disabled={isRecording}
                        placeholder="识别不准？老师可在这里输入"
                        className="h-12 rounded-xl border-2 bg-white pl-10 text-base font-bold"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isRecording || !manualInput.trim()}
                      className={`h-12 rounded-xl px-5 font-black ${accentInk} ${theme.accent}`}
                    >
                      提交答案
                    </Button>
                  </form>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    disabled={!history.length || isRecording}
                    onClick={undoLastAttempt}
                    className="rounded-full bg-slate-100 px-4 font-black text-slate-600"
                  >
                    <Undo2 /> 撤销上次
                  </Button>
                  {playMode === 'pk' && phase === 'playing' && (
                    <Button
                      variant="outline"
                      disabled={isRecording}
                      onClick={finishCompetition}
                      className="rounded-full border-2 border-amber-300 bg-amber-50 px-4 font-black text-amber-800"
                    >
                      <Flag /> 结束比赛
                    </Button>
                  )}
                  {phase === 'finished' && (
                    <Button
                      onClick={() => setShowResults(true)}
                      className="rounded-full bg-amber-400 px-5 font-black text-amber-950 hover:bg-amber-300"
                    >
                      <Trophy /> 查看排名
                    </Button>
                  )}
                </div>
              </div>
            </section>

            <aside className="flex max-h-[760px] min-h-[560px] flex-col rounded-[34px] border-2 border-amber-100 bg-[#fffdf7] p-5 shadow-[0_20px_60px_rgb(180_83_9/8%)] sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-amber-600">有效接龙</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">
                    已接 {chain.length} 个
                  </h2>
                </div>
                <span
                  className={`rounded-full ${theme.soft} px-3 py-1.5 text-sm font-black ${theme.text}`}
                >
                  {theme.short}
                </span>
              </div>

              <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {chain.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 rounded-2xl border bg-white p-3 ${
                      index === chain.length - 1
                        ? theme.border
                        : 'border-amber-100'
                    }`}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black ${
                        entry.isStart
                          ? 'bg-amber-100 text-amber-700'
                          : `${theme.soft} ${theme.text}`
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-black tracking-wider text-slate-800">
                        {entry.word}
                      </p>
                      <p className="truncate text-xs font-bold text-slate-400">
                        {entry.isStart ? '起始词' : entry.group} ·{' '}
                        {RULES[entry.mode].short}
                      </p>
                    </div>
                    {!entry.isStart && <span aria-label="正确">✅</span>}
                  </div>
                ))}
                <div ref={recordEndRef} />
              </div>

              <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-black text-slate-700">
                  全部尝试记录（{attempts.length}）
                </summary>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                  {attempts.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-400">
                      还没有作答记录
                    </p>
                  ) : (
                    attempts.map((attempt, index) => (
                      <div
                        key={attempt.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${
                          attempt.success
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}
                      >
                        <span>{attempt.success ? '✓' : '×'}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {index + 1}. {attempt.word}
                        </span>
                        <span className="max-w-24 truncate text-xs opacity-70">
                          {attempt.group}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </details>

              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                💡 错误答案会留在“尝试记录”中，但不会改变下一题的接龙目标。
              </div>
            </aside>
          </div>
        )}
      </section>

      {showResults && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-slate-950/55 p-4 backdrop-blur-sm">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className="confetti-piece absolute top-[-10%] h-5 w-3 rounded-sm"
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                backgroundColor: piece.color,
              }}
            />
          ))}
          <section className="relative w-full max-w-xl rounded-[36px] border-4 border-amber-200 bg-white p-6 text-center shadow-2xl sm:p-9">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-amber-100 text-5xl">
              👑
            </span>
            <p className="mt-4 text-sm font-black tracking-[0.2em] text-amber-600">
              比赛结束
            </p>
            <h2 className="mt-2 text-4xl font-black text-slate-900 sm:text-5xl">
              {winners.length > 1 ? '并列冠军！' : '冠军诞生！'}
            </h2>
            <p className="mt-3 text-2xl font-black text-amber-600">
              {winners.map((group) => group.name).join('、')}
            </p>

            <div className="mt-7 space-y-2 text-left">
              {sortedGroups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${GROUP_STYLES[(group.id - 1) % GROUP_STYLES.length]}`}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-white/70 font-black">
                    {group.score === topScore ? (
                      <Crown className="text-amber-500" />
                    ) : (
                      sortedGroups.filter((item) => item.score > group.score)
                        .length + 1
                    )}
                  </span>
                  <span className="flex-1 text-lg font-black">
                    {group.name}
                  </span>
                  <span className="text-2xl font-black">{group.score} 分</span>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setShowResults(false)}
                className="h-13 flex-1 rounded-2xl border-2 font-black"
              >
                返回看记录
              </Button>
              <Button
                onClick={() => resetGame(true)}
                className="h-13 flex-1 rounded-2xl bg-amber-400 font-black text-amber-950 hover:bg-amber-300"
              >
                <RotateCcw /> 再来一局
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

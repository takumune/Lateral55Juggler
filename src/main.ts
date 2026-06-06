import './style.css';
import { CanvasRenderer } from './views/CanvasRenderer';
import { ReelController } from './logic/ReelController';
import { FRAME_DURATION_MS } from './constants/config';
import { SoundManager } from './audio/SoundManager';
import { gameState } from './state/GameState';
import { Lottery } from './logic/Lottery';

// ─────────────────────────────────────────
// マウントポイントの取得
// ─────────────────────────────────────────
const appEl = document.getElementById('app');
if (!appEl) {
  throw new Error('[main] #app 要素が見つかりません。index.html を確認してください。');
}

// ─────────────────────────────────────────
// インスタンス生成
// ─────────────────────────────────────────
const renderer       = new CanvasRenderer(appEl);
const reelController = new ReelController();

// フェーズ1実装に伴い、初期状態での自動回転は停止しました。

// ─────────────────────────────────────────
// UI要素のイベントリスナー
// ─────────────────────────────────────────
const waitToggleEl = document.getElementById('wait-toggle') as HTMLInputElement | null;
if (waitToggleEl) {
  waitToggleEl.addEventListener('change', (e) => {
    gameState.isWaitEnabled = (e.target as HTMLInputElement).checked;
    console.log(`[SYSTEM] ウェイト機能を ${gameState.isWaitEnabled ? 'ON' : 'OFF'} にしました。`);
  });
}

const assistToggleEl = document.getElementById('assist-toggle') as HTMLInputElement | null;
if (assistToggleEl) {
  assistToggleEl.addEventListener('change', (e) => {
    gameState.isAutoAssistEnabled = (e.target as HTMLInputElement).checked;
    console.log(`[SYSTEM] 目押し補助を ${gameState.isAutoAssistEnabled ? 'ON' : 'OFF'} にしました。`);
  });
}

// ─────────────────────────────────────────
// キーボード入力
// ─────────────────────────────────────────

/**
 * キーラインブループ:
 *   1 → 左リール停止
 *   2 → 中リール停止
 *   3 → 右リール停止
 *   Space → 全リールが停止済みのときに再回転
 */
window.addEventListener('keydown', (e: KeyboardEvent) => {
  // ブラウザの音再生制限を解除するため、ユーザー操作の瞬間に初期化
  SoundManager.init();
  
  switch (e.key) {
    case '1':
      reelController.stopReel(0); // 左
      break;
    case '2':
      reelController.stopReel(1); // 中
      break;
    case '3':
      reelController.stopReel(2); // 右
      break;
    case 'm':
    case 'ArrowUp':
      // フェーズ1.4: サンド機能（メダル50枚投入）
      gameState.credits += 50;
      console.log(`[SYSTEM] メダルを追加: 現在 ${gameState.credits} 枚`);
      break;
    case 'b':
    case 'Enter':
      if (gameState.isReplay) {
        console.log('[SYSTEM] リプレイ作動中のためベットは自動で行われています');
        break;
      }
      // フェーズ1.2 & 5.1: MAX BET (3枚掛け)
      // ボーナス消化中もBET可能にするため、playState !== 'BONUS_GAME' 制約を外した
      if (reelController.areAllStopped()) {
        const required = 3 - gameState.bet;
        if (required > 0 && gameState.credits >= required) {
          gameState.credits -= required;
          gameState.bet = 3;
          SoundManager.playBet();
          console.log('[SYSTEM] 3枚BET完了');
        } else if (required > 0) {
          console.log('[SYSTEM] クレジットが足りません');
        }
      }
      break;
      break;
    case '0':
      // デバッグ機能: 強制的にボーナスフラグを立てる
      gameState.activeBonus = 'BIG';
      console.log('[DEBUG] BIGボーナスフラグを強制セットしました！');
      break;
    case ' ':
      e.preventDefault(); // スペースキーによる画面スクロールを防止
      
      if (reelController.areAllStopped()) {
        if (gameState.isWaiting) return; // すでにレバーON（ウェイト予約済み）なら無視

        const isBonus = gameState.playState === 'BONUS_GAME';

        // オートベット機能: メダルが足りていなければ自動で投入する
        const requiredBet = isBonus ? 2 : 3;
        if (gameState.bet < requiredBet && !gameState.isReplay) {
          const required = requiredBet - gameState.bet;
          if (gameState.credits >= required) {
            gameState.credits -= required;
            gameState.bet = requiredBet;
            SoundManager.playBet();
            console.log(`[SYSTEM] ${requiredBet}枚BET完了（Spaceキー自動処理）`);
          } else {
            console.log('[SYSTEM] クレジットが足りません。↑キー等でメダルを追加してください。');
            return;
          }
        }

        // 次ゲーム開始時の初期化
        // ユーザー要望: ボーナス中はCOUNT表示（bet）をリセットしない
        if (!isBonus) {
          gameState.bet = 0;
        }
        gameState.pay = 0;
        gameState.isReplay = false; // リプレイ権利を消費
        gameState.activeSmallRole = 'NONE'; // 1ゲーム完結の小役フラグをリセット

        // データカウンター: ボーナス中はゲーム数をカウントしない
        if (!isBonus) {
          gameState.totalGames++;
          gameState.currentGames++;
        }
        gameState.netCoinDiff -= requiredBet; // 差枚数は常に更新

        // 内部抽選 (通常時、ボーナス成立後、およびボーナス中)
        if (gameState.playState === 'BONUS_GAME') {
          const drawn = Lottery.drawBonus();
          gameState.activeSmallRole = drawn as any;
          console.log(`[DEBUG] ボーナス中抽選: 小役（${drawn}）当選！`);
        } else {
          const drawn = Lottery.draw(gameState.setting);

          if (drawn === 'BIG' || drawn === 'REG') {
            // ボーナスは揃えるまで持ち越されるため、未成立時のみセットする
            if (gameState.activeBonus === 'NONE') {
              gameState.activeBonus = drawn;
              console.log(`[DEBUG] 内部抽選: ボーナス（${drawn}）当選！設定${gameState.setting}`);
            } else {
               console.log(`[DEBUG] 内部抽選: ハズレ（ボーナス成立済み）`);
            }
          } else if (drawn !== 'NONE') {
            // 小役当選
            gameState.activeSmallRole = drawn;
            console.log(`[DEBUG] 内部抽選: 小役（${drawn}）当選！設定${gameState.setting}`);
          } else {
            console.log(`[DEBUG] 内部抽選: ハズレ 設定${gameState.setting}`);
          }
        }

        // 6.1: ウェイト機能 (4.1秒)
        const now = Date.now();
        const elapsed = now - gameState.lastSpinTime;
        const waitTime = gameState.isWaitEnabled ? 4100 : 0;

        // もし前回のスピン開始から所定の時間経っていなければ、残りの時間を待ってから回転開始
        if (elapsed < waitTime) {
          gameState.isWaiting = true;
          const remaining = waitTime - elapsed;
          console.log(`[SYSTEM] ウェイト中... (${remaining}ms)`);
          
          setTimeout(() => {
            gameState.isWaiting = false;
            gameState.lastSpinTime = Date.now();
            reelController.startAll();
          }, remaining);
        } else {
          gameState.lastSpinTime = now;
          reelController.startAll();
        }
      } else {
        // 回転中（または滑り中）の場合、順番に停止を試みる（順押し）
        if (reelController.getState('left').status === 'SPINNING') {
          reelController.stopReel(0);
        } else if (reelController.getState('center').status === 'SPINNING') {
          reelController.stopReel(1);
        } else if (reelController.getState('right').status === 'SPINNING') {
          reelController.stopReel(2);
        }
      }
      break;
  }
});

// ─────────────────────────────────────────
// メインゲームループ
// ─────────────────────────────────────────
let lastTime = 0;

function updateDOMUI(): void {
  
  const lampEl = document.getElementById('bonus-lamp-container');
  if (lampEl) {
    if (gameState.isGogoLampOn) lampEl.classList.add('on');
    else lampEl.classList.remove('on');
  }

  // LEDデジタル表示パネルの更新
  const fmtLed = (n: number, digits: number) => String(Math.min(n, 10 ** digits - 1)).padStart(digits, '0');
  const elCreditVal = document.getElementById('led-credit-val');
  const elCountVal  = document.getElementById('led-count-val');
  const elPayoutVal = document.getElementById('led-payout-val');
  if (elCreditVal) elCreditVal.textContent = fmtLed(gameState.credits, 2);
  if (elCountVal)  elCountVal.textContent  = fmtLed(gameState.bet, 3);
  if (elPayoutVal) elPayoutVal.textContent = fmtLed(gameState.pay, 2);

  // データカウンター表示の更新
  const fmt = (n: number, d: number) => String(Math.min(Math.abs(n), 10 ** d - 1)).padStart(d, '0');
  const dcTotal  = document.getElementById('dc-total');
  const dcGames  = document.getElementById('dc-games');
  const dcBB     = document.getElementById('dc-bb');
  const dcRB     = document.getElementById('dc-rb');
  const dcDiff   = document.getElementById('dc-diff');
  if (dcTotal) dcTotal.textContent = fmt(gameState.totalGames, 4);
  if (dcGames) dcGames.textContent = fmt(gameState.currentGames, 3);
  if (dcBB)    dcBB.textContent    = fmt(gameState.bbCount, 2);
  if (dcRB)    dcRB.textContent    = fmt(gameState.rbCount, 2);
  if (dcDiff) {
    const d = gameState.netCoinDiff;
    dcDiff.textContent = (d >= 0 ? '+' : '-') + fmt(d, 4);
    dcDiff.style.color = d >= 0 ? '#22ff66' : '#ff4444';
  }

  const dcCredits = document.getElementById('dc-credits');
  if (dcCredits) dcCredits.textContent = fmt(gameState.credits, 4);

  drawSlumpGraph();
  updateWinHistoryUI();
}

let lastHistoryLength = 0;
/**
 * 成立役履歴の表示を更新する。
 */
function updateWinHistoryUI(): void {
  const container = document.getElementById('win-history-list');
  if (!container) return;
  
  // 履歴件数に変化があれば再描写
  if (gameState.winHistory.length === lastHistoryLength) return;
  lastHistoryLength = gameState.winHistory.length;
  
  container.innerHTML = gameState.winHistory.map(item => `
    <div class="history-item">
      <span class="history-game">${String(item.game).padStart(4, '0')}G</span>
      <span class="history-role ${item.role}">${item.role}</span>
    </div>
  `).join('');
}

/**
 * スランプグラフ（差枚数の折れ線グラフ）をcanvasに描画する。
 */
function drawSlumpGraph(): void {
  const canvas = document.getElementById('slump-graph') as HTMLCanvasElement | null;
  if (!canvas) return;
  
  // 画面の拡大率（flex:1）に合わせて、canvasの内部解像度を同期させる
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const history = gameState.history;

  // 背景
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  if (history.length < 2) return;

  // スケール固定: ±500
  const MAX_VAL =  500;
  const MIN_VAL = -500;
  const range   = MAX_VAL - MIN_VAL; // 1000
  const PAD = 4; // 上下のピクセル余白
  const toY = (v: number) => PAD + (1 - (Math.min(Math.max(v, MIN_VAL), MAX_VAL) - MIN_VAL) / range) * (H - PAD * 2);
  const zeroY = toY(0);

  // ±500ラベル（右上 / 右下）
  ctx.font = 'bold 9px "Share Tech Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('+500', W - 2, PAD + 9);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('-500', W - 2, H - PAD - 2);

  // ゼロライン（白い点線）
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(W, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 折れ線グラフ（プラスは緑、マイナスは赤で区間分けて描画）
  // 横軸を300ゲームに固定
  const MAX_GAMES = 300;
  const step = W / (MAX_GAMES - 1);
  
  // 最新の300件分を抽出
  const startIdx = Math.max(0, history.length - MAX_GAMES);
  const displayData = history.slice(startIdx);

  ctx.lineWidth = 1.5;
  for (let i = 1; i < displayData.length; i++) {
    const x1 = (i - 1) * step;
    const y1 = toY(displayData[i - 1]);
    const x2 = i * step;
    const y2 = toY(displayData[i]);
    const isPositive = displayData[i] >= 0;
    
    ctx.strokeStyle = isPositive ? '#22ff66' : '#ff4444';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 最新値を強調
  if (displayData.length > 0) {
    const lastX = (displayData.length - 1) * step;
    const lastY = toY(displayData[displayData.length - 1]);
    ctx.fillStyle = displayData[displayData.length - 1] >= 0 ? '#88ffaa' : '#ff8888';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * requestAnimationFrame から毎フレーム呼び出されるゲームループ。
 *
 * 処理順: デルタタイム計算 → FPS 制御 → Update → Render
 *
 * @param timestamp - rAF が渡す経過時間 (ms, DOMHighResTimeStamp)
 */
function gameLoop(timestamp: number): void {
  const dt = timestamp - lastTime;

  // FPS 上限制御: 目標フレーム時間に満たなければスキップ
  if (dt < FRAME_DURATION_MS) {
    requestAnimationFrame(gameLoop);
    return;
  }

  lastTime = timestamp;

  // ── Update ──
  reelController.update(dt);

  // ── Render ──
  renderer.render(dt, reelController);

  // ── UI Overlay Update ──
  updateDOMUI();

  requestAnimationFrame(gameLoop);
}

// ── DOMイベント初期化 ──
const waitToggle = document.getElementById('wait-toggle') as HTMLInputElement;
if (waitToggle) {
  waitToggle.addEventListener('change', () => {
    gameState.isWaitEnabled = waitToggle.checked;
  });
}

const assistToggle = document.getElementById('assist-toggle') as HTMLInputElement;
if (assistToggle) {
  assistToggle.addEventListener('change', () => {
    gameState.isAutoAssistEnabled = assistToggle.checked;
  });
}

const settingSelect = document.getElementById('setting-select') as HTMLSelectElement;
if (settingSelect) {
  settingSelect.addEventListener('change', () => {
    SoundManager.init();
    const val = settingSelect.value;
    gameState.setting = (val === 'X' ? 'X' : Number(val)) as any;
    console.log(`[SYSTEM] 設定を ${gameState.setting} に変更しました`);
  });
}

// ループ開始
requestAnimationFrame(gameLoop);

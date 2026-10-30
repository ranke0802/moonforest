// Move the existing controls, keeping their IDs, values and event handlers intact.
export function setupSettingsPanel() {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#motion-speed-dialog');
  dialog.classList.add('game-settings');
  $('#motion-speed-title').textContent = '설정';
  $('#motion-speed-description').textContent = '캐릭터, 화면과 동작을 조절합니다. 설정을 닫으면 전투가 이어집니다.';
  const toggle = $('#motion-speed-toggle');
  toggle.hidden = false;
  toggle.setAttribute('aria-label', '설정 열기');
  toggle.title = '설정';
  $('#close-motion-speed').setAttribute('aria-label', '설정 닫기');

  const sections = document.createElement('div');
  sections.className = 'settings-sections';
  $('#motion-speed-description').after(sections);
  function section(title, nodes, open = false) {
    const details = document.createElement('details');
    details.className = 'settings-section';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'settings-section-body';
    body.append(...nodes);
    details.append(summary, body);
    sections.append(details);
    return details;
  }
  section('캐릭터 · 장비', [$('.character-info')], true);
  const displayOptions = document.createElement('div');
  displayOptions.className = 'settings-display-options';
  const qualityLabel = document.createElement('label');
  qualityLabel.textContent = '화질';
  qualityLabel.append($('#quality-select'));
  const fullscreen = $('#fullscreen-button');
  fullscreen.textContent = '전체화면';
  fullscreen.classList.remove('icon-button');
  fullscreen.classList.add('motion-speed-toggle', 'fullscreen-toggle');
  toggle.before(fullscreen);
  const fps=document.createElement('span');
  fps.id='live-fps';fps.className='live-fps';fps.textContent='— FPS';fps.setAttribute('aria-label','현재 게임 프레임');
  fullscreen.before(fps);
  displayOptions.append(qualityLabel);
  const pitchOptions=document.createElement('div');pitchOptions.id='camera-pitch-options';pitchOptions.className='camera-zoom-options';
  pitchOptions.innerHTML='<div class="camera-zoom-row"><label><input id="camera-upward-limited" type="checkbox" checked>위쪽 시야 제한</label></div><small>해제하면 거의 수직으로 올려다볼 수 있습니다.</small><small id="camera-pitch-status" role="status" aria-live="polite"></small>';
  const characterStyle=document.createElement('button');characterStyle.id='open-character-style';characterStyle.type='button';characterStyle.className='motion-speed-toggle';characterStyle.textContent='캐릭터 선 · 밝기';characterStyle.setAttribute('aria-haspopup','dialog');
  section('화면 · 카메라', [displayOptions, characterStyle, $('.camera-tools'), $('#camera-zoom-options'), pitchOptions]);
  section('성능 진단', [$('#frame-diagnostics-options')]);
  section('공통 속도', [$('#attack-speed').closest('.attack-speed-control'), $('#dodge-speed-control')]);
  const bossPatterns=document.createElement('button');bossPatterns.id='open-boss-patterns';bossPatterns.type='button';bossPatterns.className='motion-speed-toggle';bossPatterns.textContent='보스 패턴 · 속도';bossPatterns.setAttribute('aria-haspopup','dialog');
  section('보스 전투', [bossPatterns]);
  const reset = $('#reset-motion-speeds');
  const motionSection = section('모션별 속도 · 전사 v2', [$('#motion-speed-options'), reset]);
  motionSection.id = 'v2-motion-settings';
  const catalogSection = section('몬스터 모션 목록', [...document.querySelectorAll('.boss-catalog')]);
  catalogSection.id = 'monster-motion-settings';
  section('조작 안내 · 동작 확인', [$('#help-toggle'), $('.camera-hint'), $('.secondary-actions')]);
  $('#help-toggle').textContent = '조작 가이드 열기';
  section('현재 상태', [$('#build-tag'), $('.scene-footer'),$('#player-combat-status')]);
  $('.right-tools').setAttribute('aria-label', '몬스터 소환');
  $('.right-tools').classList.add('summon-tools');
  const note = $('#help-dialog .help-note');
  note.innerHTML = note.innerHTML
    .replace('왼쪽 위에서 궁수, 기존 전사, 전사 v2를 선택합니다.', '설정 → 캐릭터 · 장비에서 궁수, 기존 전사, 전사 v2를 선택합니다.')
    .replace('우측 상단에서 최대 2배까지 조절합니다.', '설정 → 공통 속도에서 최대 2배까지 조절합니다.')
    .replace('상단 화질을', '설정 → 화면 · 카메라에서 화질을');
}

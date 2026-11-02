// Move the existing controls, keeping their IDs, values and event handlers intact.
import {setupRuntimeVersionPanel} from './runtime-version.js';
import {PLAINS_VIEW_DISTANCE_STEPS} from './plains-view-distance.js';
export function setupSettingsPanel() {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#motion-speed-dialog');
  if(dialog.dataset.settingsReady==='true')return setupRuntimeVersionPanel({host:$('#current-state-settings .settings-section-body')});
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
  const frameLabel=document.createElement('label');frameLabel.textContent='프레임';
  const frameSelect=document.createElement('select');frameSelect.id='frame-rate-select';frameSelect.setAttribute('aria-label','목표 프레임');frameSelect.className='quality-select';
  frameSelect.innerHTML='<option value="30">30 FPS · 기본</option><option value="60">60 FPS</option>';frameLabel.append(frameSelect);
  displayOptions.append(qualityLabel,frameLabel);
  const plainsDistance=document.createElement('div');plainsDistance.className='camera-zoom-options';
  plainsDistance.innerHTML=`<label>대평원 풍경 거리 <select id="plains-view-distance-select" class="quality-select" aria-label="대평원 풍경 거리">${PLAINS_VIEW_DISTANCE_STEPS.map(value=>`<option value="${value}">${value===1?'기본 · 100%':`${Math.round(value*100)}%`}</option>`).join('')}</select></label><small>대평원에서 먼 풍경을 더 보여줍니다. 거리가 멀수록 성능에 부담이 늘 수 있습니다.</small>`;
  const pitchOptions=document.createElement('div');pitchOptions.id='camera-pitch-options';pitchOptions.className='camera-zoom-options';
  pitchOptions.innerHTML='<div class="camera-zoom-row"><label><input id="camera-upward-limited" type="checkbox" checked>위쪽 시야 제한</label></div><small>해제하면 거의 수직으로 올려다볼 수 있습니다.</small><small id="camera-pitch-status" role="status" aria-live="polite"></small>';
  const followOptions=document.createElement('div');followOptions.id='camera-follow-options';followOptions.className='camera-zoom-options';
  followOptions.innerHTML='<div class="camera-zoom-row"><label><input id="camera-follow-motion" type="checkbox">캐릭터 모션 따라가기</label></div><small>기본은 머리 높이 고정입니다. 체크하면 달리기·점프 등 머리 모션에 맞춰 카메라가 움직입니다.</small><small id="camera-follow-status" role="status" aria-live="polite"></small>';
  const characterStyle=document.createElement('button');characterStyle.id='open-character-style';characterStyle.type='button';characterStyle.className='motion-speed-toggle';characterStyle.textContent='캐릭터 선 · 밝기';characterStyle.setAttribute('aria-haspopup','dialog');
  section('화면 · 카메라', [displayOptions, plainsDistance, characterStyle, $('.camera-tools'), $('#camera-zoom-options'), followOptions, pitchOptions]);
  const diagnosticOptions=$('#frame-diagnostics-options'),diagnosticHelp=document.createElement('details');
  diagnosticHelp.id='frame-diagnostics-help';diagnosticHelp.className='diagnostic-help';
  const diagnosticSummary=document.createElement('summary');diagnosticSummary.textContent='측정 기준과 자세한 설명';diagnosticHelp.append(diagnosticSummary);
  for(const node of [...diagnosticOptions.children])if(node.matches('small,p'))diagnosticHelp.append(node);
  const oldInstructions=diagnosticHelp.querySelector('small');if(oldInstructions)oldInstructions.textContent='진단을 켜고 3초 이상 플레이한 뒤 보스를 소환하면 전후를 비교합니다. 자세히를 누르면 전투를 잠시 멈추고 기록을 봅니다. 등장 후 5초 뒤 복사하면 비교 결과가 포함됩니다.';
  const diagnosticQuick=document.createElement('p');diagnosticQuick.className='diagnostic-quick';diagnosticQuick.textContent='탐색 중에는 FPS와 프레임만 표시합니다. 상세 기록은 자세히에서 확인하세요.';
  diagnosticOptions.querySelector('label').after(diagnosticQuick);diagnosticOptions.append(diagnosticHelp);
  section('성능 진단', [diagnosticOptions]);
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
  const currentState=section('현재 상태', [$('#build-tag'), $('.scene-footer'),$('#player-combat-status')]);currentState.id='current-state-settings';
  const runtimeVersion=setupRuntimeVersionPanel({host:currentState.querySelector('.settings-section-body')});
  $('.right-tools').setAttribute('aria-label', '몬스터 소환');
  $('.right-tools').classList.add('summon-tools');
  const note = $('#help-dialog .help-note');
  note.innerHTML = note.innerHTML
    .replace('왼쪽 위에서 궁수, 기존 전사, 전사 v2를 선택합니다.', '설정 → 캐릭터 · 장비에서 궁수, 기존 전사, 전사 v2를 선택합니다.')
    .replace('우측 상단에서 최대 2배까지 조절합니다.', '설정 → 공통 속도에서 최대 2배까지 조절합니다.')
    .replace('상단 화질을', '설정 → 화면 · 카메라에서 화질을');
  dialog.dataset.settingsReady='true';return runtimeVersion;
}

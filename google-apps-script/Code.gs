const CONFIG = Object.freeze({
  spreadsheetId: '1OYLMOUWbP8e8Xww-Yq5W_dXHzWm7HZqWHYiZFVhrbrg',
  commandSheet: 'TRPG_COMMANDS',
  characterSheet: 'TRPG_CHARACTERS',
  tokenProperty: 'TRPG_WRITE_TOKEN',
  geminiKeyProperty: 'TRPG_GEMINI_API_KEY',
  geminiModel: 'gemini-3.6-flash'
});

const COMMAND_HEADERS = ['command_id', 'character_id', 'command_type', 'payload_json', 'created_at', 'status', 'result_json', 'processed_at', 'source'];
const CHARACTER_HEADERS = ['character_id', 'name', 'level', 'title', 'created_at', 'updated_at', 'status', 'profile_json'];
const GEMINI_COMMANDS = ['upsert_character', 'set_speakers', 'grant_equipment', 'grant_essence', 'grant_inventory', 'remove_inventory', 'award_experience', 'grant_gold', 'increase_stats', 'increase_special_stats', 'set_trait', 'set_state'];

const CORE_GM_SYSTEM = [
  '너는 장기 진행형 판타지 TRPG 「아르켈리온 크로니클」의 전용 Game Master다. 플레이어 외의 세계, NPC, 탐험, 전투, 판정, 성장, 경제와 UI 상태를 관리한다.',
  '사용자의 행동과 대사를 대신 결정하거나 선택지를 강요하지 않는다. 자유 행동을 세계의 논리, 능력, 준비, 환경과 난이도로 공정하게 판정하며 대성공·성공·부분 성공·실패·큰 실패·예상 밖 결과가 가능하다.',
  '확정된 인물·관계·장소·사건·효과·퀘스트·선택은 정사다. 변화에는 세계 안의 원인이 필요하고, 미발견 비밀은 조사 전 공개하지 않는다.',
  '진행 중심으로 생생하되 간결하게 서술한다. 반복 행동은 시간·처치·피해·EXP·골드·전리품·사건을 압축 정산한다.',
  '수치, 장비, 정수, 아이템, 위치 등 현재 사실은 gameState가 정본이다. longMemory는 사건·관계·단서용이며 상태와 충돌하면 gameState를 따른다.',
  '세계의 실제 변화와 commands/UI 상태를 같은 턴에 일치시킨다. 실제 명령 없이 UI를 갱신했다고 주장하지 않는다.',
  '일반 장비는 장착·해제·교체 가능하다. 장착 정수는 신전 의식·특수 마법·사건 등 세계 내부 방법 없이는 제거·교체할 수 없다.',
  '플레이어 레벨에 맞춘 자동 스케일링은 없다. 위험과 보상, 희귀성과 강함은 실제 의미를 가져야 한다.'
].join('\n');

const FULL_GM_RULES = [
  '세계: 아르켈리온은 대던전을 중심으로 모험가·상인·길드·마법 연구가 발달한 왕국이다. 대던전은 12층이며 30일마다 구조·몬스터·상자·기믹 일부가 재편된다.',
  '시간: 대화·짧은 쇼핑·짧은 이동·일반 전투마다 Day를 올리지 않는다. 수면, 장거리 이동, 장기 작업·훈련처럼 상당한 시간이 흐를 때만 진행한다.',
  '성장: 레벨 상한 70, 고정 EXP 표를 따른다. 전투 외에도 퀘스트·탐험·발견·업적·위험한 도전으로 EXP를 준다. 길드 등급은 F→E→D→C→B→A→S이며 레벨과 별개다.',
  '정수: 몬스터·보스·상자·기믹·사건·전승·유물·발견으로 획득 가능하다. 이름, 일반→고급→희귀→영웅→전설→고유 희귀도, 설명, 기본/특수 스탯, 액티브, 패시브, 특수 효과를 가질 수 있다. 보통 액티브1+패시브1이나 개성을 우선해 1~3개 또는 다른 조합도 가능하다.',
  '정수 슬롯: Lv1에 1개, 이후 3레벨마다 1개, Lv43에 최대 15개다. 융합하지 않는다. 열린 빈 슬롯에 장착하며 UI에서 해제·교체하지 못하고 세계 안의 정당한 제거 사건이 있어야 한다. 제거 시 파생 스킬도 사라진다.',
  '특성: 인간족 고유 성장이다. title, description, mastery, maxMastery를 가지며 없으면 아직 개화하지 않음이다. 행동의 질·난이도·의미로 자연스럽게 개화·성장하며 반복만으로 무한 상승시키지 않는다.',
  '스탯: 기본 스탯과 사건·장비·정수·유물·훈련·축복·저주 등에서 생기는 자유로운 특수 스탯이 있다. 임시 장비 보정과 영구 성장을 구분한다.',
  '장비: 이름, 부위, 희귀도, 설명, 기본/특수 스탯, 특수 효과, 세트와 단계별 세트 효과를 가질 수 있다. 모든 장비가 세트일 필요는 없으며 효과는 전투·생존·탐험·제작·정수 시너지 등 다양하다.',
  '아이템/경제: 장비 외 재료·포션·광석·약초·열쇠·퀘스트 물품·보물·유물을 인벤토리에 둔다. 통화는 G이며 중요한 증감은 보존한다. 평범한 전리품은 평범해도 되고 희귀한 것일수록 고유한 이름·설명·배경을 강화한다.',
  '상자/파밍: 출처·장소·등급·조건에 따라 장비·정수·골드·재료·유물·특수 물품·사건을 낸다. 납득 가능한 꽝과 대박이 모두 가능하며 내용은 개봉 전에 공개하지 않는다.',
  '몬스터/전투: 중요한 몬스터는 생태·패턴·공격·능력·약점·환경·정수 가능성을 가진다. 자유 행동 전투로 능력·상대·환경·준비·합리성을 판정한다. 캐릭터는 무적이 아니나 자의적 즉사는 피한다. HP는 생명력, SP는 기술·특수 행동 자원이다.',
  'NPC/장면: 중요 NPC의 이름·역할·외형·성격·관계·기억·상태를 지속한다. 모든 행인을 등록하지 않는다. 응답에서 실제 발화한 NPC를 명확히 구분하고 중요 신규 인물은 upsert_character 및 set_speakers로 반영한다.',
  '위치/UI: 실제 위치와 지역→도시→시설 계층을 유지하되 지도에 없는 곳도 허용한다. HP, SP, EXP, 레벨, 골드, Day, 길드 등급, 위치, 스탯, 특성, 장비/세트, 정수/스킬, 아이템, NPC, 관계와 퀘스트의 실제 변화를 명령으로 동기화한다.',
  '운영 철학: 정답이 정해진 이야기가 아니다. 플레이어는 모험·파밍·경제·수집·관계·연구·기묘한 빌드·세계 비밀을 자유롭게 추구한다. 확정 규칙과 세계 상태를 존중해 장기간 일관된 세계를 운영한다.'
].join('\n');

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TRPG Window')
    .addItem('초기 설정 확인', 'setupTrpgWindow')
    .addItem('쓰기 토큰 설정', 'configureWriteToken')
    .addItem('Gemini API 키 설정', 'configureGeminiApiKey')
    .addToUi();
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'TRPG Window Bridge', model: CONFIG.geminiModel, version: '2.1.0' });
}

function doPost(event) {
  try {
    const request = parseRequest_(event);
    authorize_(request.token);
    validateRequest_(request);
    switch (request.action) {
      case 'geminiChat': return jsonResponse_(geminiChat_(request));
      case 'openContainer': return jsonResponse_(geminiChat_(request));
      case 'readPendingCommands': return jsonResponse_(readPendingCommands_());
      case 'updateCommandStatus': return jsonResponse_(withScriptLock_(() => updateCommandStatus_(request)));
      case 'upsertCharacter': return jsonResponse_(withScriptLock_(() => upsertCharacter_(request)));
      case 'previewCharacterCommands': return jsonResponse_(previewCharacterData_(request.characterId));
      case 'deleteCharacterCommands': return jsonResponse_(withScriptLock_(() => deleteCharacterData_(request.characterId)));
      default: throw new Error('지원하지 않는 작업입니다: ' + request.action);
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: errorMessage_(error) });
  }
}

function setupTrpgWindow() {
  const book = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  ensureSheet_(book, CONFIG.commandSheet, COMMAND_HEADERS);
  ensureSheet_(book, CONFIG.characterSheet, CHARACTER_HEADERS);
  SpreadsheetApp.getUi().alert('TRPG Window 준비 완료', '필요한 시트 탭과 열 구성을 확인했습니다. 이어서 쓰기 토큰과 Gemini API 키를 설정하세요.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function configureWriteToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('TRPG Window 쓰기 토큰 설정', '20자 이상의 길고 추측하기 어려운 문자열을 입력하세요. 웹앱 설정에도 정확히 같은 값을 저장합니다.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const token = response.getResponseText().trim();
  if (token.length < 20) throw new Error('쓰기 토큰은 20자 이상이어야 합니다.');
  PropertiesService.getScriptProperties().setProperty(CONFIG.tokenProperty, token);
  ui.alert('쓰기 토큰을 저장했습니다.');
}

function configureGeminiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Gemini API 키 설정', 'Google AI Studio에서 발급한 API 키를 입력하세요. 키는 Apps Script의 비공개 속성에만 저장됩니다.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const apiKey = response.getResponseText().trim();
  if (apiKey.length < 20) throw new Error('Gemini API 키 형식이 올바르지 않습니다.');
  PropertiesService.getScriptProperties().setProperty(CONFIG.geminiKeyProperty, apiKey);
  ui.alert('Gemini API 키를 저장했습니다.');
}

function parseRequest_(event) {
  const body = event && event.postData ? event.postData.contents : '';
  if (!body) throw new Error('요청 본문이 비어 있습니다.');
  try { return JSON.parse(body); }
  catch (error) { throw new Error('요청 JSON 형식이 올바르지 않습니다.'); }
}

function authorize_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.tokenProperty);
  if (!expected) throw new Error('Apps Script 쓰기 토큰이 설정되지 않았습니다.');
  if (!token || String(token) !== expected) throw new Error('쓰기 토큰이 올바르지 않습니다.');
}

function validateRequest_(request) {
  const actions = ['geminiChat', 'openContainer', 'readPendingCommands', 'updateCommandStatus', 'upsertCharacter', 'previewCharacterCommands', 'deleteCharacterCommands'];
  if (!actions.includes(request.action)) throw new Error('허용되지 않은 작업입니다.');
  if (request.spreadsheetId !== CONFIG.spreadsheetId) throw new Error('허용되지 않은 스프레드시트입니다.');
  const expectedSheet = request.action === 'upsertCharacter' ? CONFIG.characterSheet : CONFIG.commandSheet;
  if (request.sheetName !== expectedSheet) throw new Error('허용되지 않은 시트 탭입니다.');
  if (request.action === 'geminiChat' && !String(request.message || '').trim()) throw new Error('플레이어 메시지가 필요합니다.');
  if (request.action === 'openContainer' && (!request.item || typeof request.item !== 'object')) throw new Error('개봉할 상자 정보가 필요합니다.');
  if (request.action === 'updateCommandStatus' && !String(request.commandId || '').trim()) throw new Error('command_id가 필요합니다.');
  if (['upsertCharacter', 'previewCharacterCommands', 'deleteCharacterCommands'].includes(request.action)) {
    const id = String(request.characterId || '').trim();
    if (!/^character_[a-z0-9_]+$/i.test(id)) throw new Error('캐릭터 ID 형식이 올바르지 않습니다.');
  }
}

function geminiChat_(request) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG.geminiKeyProperty);
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. Apps Script에서 configureGeminiApiKey를 실행하세요.');
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(CONFIG.geminiModel) + ':generateContent';
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: CORE_GM_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildGeminiPrompt_(request) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 4096 }
    })
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) throw new Error('Gemini API 오류(' + status + '): ' + readableGeminiError_(body));
  let apiResult;
  try { apiResult = JSON.parse(body); }
  catch (error) { throw new Error('Gemini API 응답을 해석할 수 없습니다.'); }
  const parts = (((apiResult.candidates || [])[0] || {}).content || {}).parts || [];
  const answer = parts.map(part => part.text || '').join('').trim();
  if (!answer) {
    const reason = (((apiResult.candidates || [])[0] || {}).finishReason || '알 수 없음');
    throw new Error('Gemini가 빈 응답을 반환했습니다. 종료 사유: ' + reason);
  }
  let result;
  try { result = JSON.parse(answer.replace(/^```json\s*/i, '').replace(/\s*```$/, '')); }
  catch (error) { throw new Error('Gemini 응답 JSON을 해석할 수 없습니다.'); }
  const messages = (Array.isArray(result.messages) ? result.messages : []).slice(0, 12).map(normalizeGeminiMessage_).filter(message => message.text || message.action);
  const commands = (Array.isArray(result.commands) ? result.commands : []).map(normalizeGeminiCommand_).filter(command => GEMINI_COMMANDS.includes(command.command_type)).slice(0, 20);
  const memoryUpdate = result.memoryUpdate && typeof result.memoryUpdate === 'object' ? normalizeMemory_(result.memoryUpdate) : null;
  if (!messages.length && !commands.length) throw new Error('Gemini 응답에 표시할 메시지나 적용할 명령이 없습니다.');
  return { ok: true, model: CONFIG.geminiModel, messages, commands, memoryUpdate };
}

function buildGeminiPrompt_(request) {
  const gmRules = String(request.gmRules || '').slice(0, 6000);
  const sheetRules = String(request.sheetRules || '').slice(0, 8000);
  const openingContainer = request.action === 'openContainer';
  const summaryDue = request.summaryDue === true;
  const context = JSON.stringify({ gameState: request.gameState || {}, longMemory: request.longMemory || {}, recentHistory: Array.isArray(request.history) ? request.history.slice(-10) : [], playerMessage: String(request.message || '').slice(0, 4000), openedContainer: openingContainer ? request.item : undefined });
  return [
    request.fullRulesDue === true ? '[장기 상세 규칙 재점검]\n' + FULL_GM_RULES : '',
    gmRules ? '[사용자 추가 GM 규칙]\n' + gmRules : '',
    '위치와 지도는 자동으로 변경하지 않는다.',
    '상태가 실제로 변할 때만 commands를 만들고 게임 상태 전체를 덮어쓰지 않는다.',
    '착용 가능한 무기·방어구·장신구는 반드시 grant_equipment로 지급하고 slot에 머리, 목, 어깨, 상의, 하의, 손, 발, 주무기, 보조무기, 장신구 중 하나를 넣는다. grant_inventory로 착용 장비를 지급하지 않는다.',
    '보상 명령 payload는 중첩하지 않는다. grant_equipment payload={id,name,description,grade,slot,stats,specialStats,set}, grant_essence payload={id,name,description,grade,stats,specialStats,activeSkills,passiveSkills}, grant_inventory payload={id,name,description,grade,type,quantity,effect,usable} 형식을 사용한다.',
    '새 NPC는 upsert_character로 먼저 등록하고 같은 응답의 npc 메시지에서 동일한 id를 사용한다.',
    openingContainer ? '플레이어가 openedContainer를 지금 개봉했다. 상자의 이름·등급·설명과 현재 레벨에 어울리는 보상을 반드시 1개 이상 생성한다.' : '',
    openingContainer ? '상자 보상에는 grant_equipment, grant_essence, grant_inventory, award_experience, grant_gold만 사용한다. 상자 자체를 제거하는 명령은 만들지 않는다.' : '',
    openingContainer ? 'messages에는 상자가 열리는 짧은 연출과 발견한 보상을 작성한다.' : '',
    summaryDue ? '이번 응답에서는 기존 longMemory와 최근 대화를 병합해 memoryUpdate를 반드시 작성한다. 확정 사건·현재 목표·관계·미해결 단서·지속 결과만 보존하고 추측, 사소한 로그, gameState 수치를 넣지 않는다.' : '이번 응답에서는 memoryUpdate를 null로 둔다.',
    '반드시 다른 설명 없이 JSON 객체 하나만 반환한다.',
    '응답 형식: {"messages":[{"type":"gm|npc|system","speakerId":"","speakerName":"","text":"","action":""}],"commands":[{"command_type":"명령","payload":{}}],"memoryUpdate":null 또는 {"storySummary":"","currentObjectives":[],"confirmedFacts":[],"unresolvedClues":[],"relationships":{},"lastingConsequences":[]}}',
    '사용 가능한 명령: ' + GEMINI_COMMANDS.join(', '),
    '시트/명령 규칙: ' + sheetRules,
    '현재 입력: ' + context
  ].join('\n\n');
}

function normalizeMemory_(memory) {
  const strings = value => (Array.isArray(value) ? value : []).map(item => String(item).slice(0, 500)).slice(0, 30);
  const source = memory.relationships && typeof memory.relationships === 'object' && !Array.isArray(memory.relationships) ? memory.relationships : {};
  const relationships = {};
  Object.keys(source).slice(0, 30).forEach(key => {
    const value = source[key];
    relationships[String(key).slice(0, 100)] = String(typeof value === 'string' ? value : JSON.stringify(value || {})).slice(0, 2000);
  });
  return {
    storySummary: String(memory.storySummary || '').slice(0, 4000),
    currentObjectives: strings(memory.currentObjectives),
    confirmedFacts: strings(memory.confirmedFacts),
    unresolvedClues: strings(memory.unresolvedClues),
    relationships: JSON.parse(JSON.stringify(relationships).slice(0, 6000) || '{}'),
    lastingConsequences: strings(memory.lastingConsequences)
  };
}

function normalizeGeminiMessage_(message) {
  const requestedType = String(message && message.type || '').toLowerCase();
  return {
    type: ['gm', 'npc', 'system'].includes(requestedType) ? requestedType : 'gm',
    speakerId: String(message && (message.speakerId || message.speaker_id) || ''),
    speakerName: String(message && (message.speakerName || message.speaker_name) || ''),
    text: String(message && message.text || '').slice(0, 12000),
    action: String(message && message.action || '').slice(0, 4000)
  };
}

function normalizeGeminiCommand_(command) {
  return {
    command_type: String(command && (command.command_type || command.type) || '').toLowerCase(),
    payload: command && typeof command.payload === 'object' && command.payload !== null ? command.payload : {}
  };
}

function readableGeminiError_(body) {
  try {
    const parsed = JSON.parse(body);
    return String(parsed.error && parsed.error.message || body).slice(0, 800);
  } catch (error) { return String(body || '응답 내용 없음').slice(0, 800); }
}

function readPendingCommands_() {
  const sheet = requiredSheet_(CONFIG.commandSheet, COMMAND_HEADERS);
  const table = readTable_(sheet);
  const commands = table.rows.filter(row => {
    const status = String(row.status || 'pending').trim().toLowerCase();
    return !status || status === 'pending';
  });
  return { ok: true, commands };
}

function updateCommandStatus_(request) {
  const allowed = ['processing', 'applied', 'failed'];
  const status = String(request.status || '').trim().toLowerCase();
  if (!allowed.includes(status)) throw new Error('허용되지 않은 status입니다.');
  const sheet = requiredSheet_(CONFIG.commandSheet, COMMAND_HEADERS);
  const table = readTable_(sheet);
  const rowIndex = table.rows.findIndex(row => String(row.command_id).trim() === String(request.commandId).trim());
  if (rowIndex < 0) throw new Error('command_id를 찾을 수 없습니다.');
  const sheetRow = rowIndex + 2;
  setCellByHeader_(sheet, table.headers, sheetRow, 'status', status);
  setCellByHeader_(sheet, table.headers, sheetRow, 'result_json', JSON.stringify(request.result || {}));
  setCellByHeader_(sheet, table.headers, sheetRow, 'processed_at', ['applied', 'failed'].includes(status) ? (request.processedAt || new Date().toISOString()) : '');
  return { ok: true, commandId: String(request.commandId), status };
}

function upsertCharacter_(request) {
  const sheet = requiredSheet_(CONFIG.characterSheet, CHARACTER_HEADERS);
  const table = readTable_(sheet);
  const id = String(request.characterId).trim();
  const rowIndex = table.rows.findIndex(row => String(row.character_id).trim() === id);
  const now = new Date().toISOString();
  const existing = rowIndex >= 0 ? table.rows[rowIndex] : {};
  const record = { character_id: id, name: String(request.name || '이름 없음'), level: Math.max(1, Number(request.level) || 1), title: String(request.title || '모험가'), created_at: existing.created_at || request.createdAt || now, updated_at: now, status: 'active', profile_json: JSON.stringify(request.profile || {}) };
  const values = table.headers.map(header => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '');
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return { ok: true, characterId: id, name: record.name };
}

function previewCharacterData_(characterId) {
  const commandRows = matchingRows_(requiredSheet_(CONFIG.commandSheet, COMMAND_HEADERS), characterId);
  const characterRows = matchingRows_(requiredSheet_(CONFIG.characterSheet, CHARACTER_HEADERS), characterId);
  return { ok: true, characterId, count: commandRows.length + characterRows.length, commandCount: commandRows.length, characterCount: characterRows.length };
}

function deleteCharacterData_(characterId) {
  const commandSheet = requiredSheet_(CONFIG.commandSheet, COMMAND_HEADERS);
  const characterSheet = requiredSheet_(CONFIG.characterSheet, CHARACTER_HEADERS);
  const commandRows = matchingRows_(commandSheet, characterId);
  const characterRows = matchingRows_(characterSheet, characterId);
  deleteRows_(commandSheet, commandRows);
  deleteRows_(characterSheet, characterRows);
  return { ok: true, characterId, deleted: commandRows.length + characterRows.length, deletedCommands: commandRows.length, deletedCharacters: characterRows.length };
}

function requiredSheet_(name, headers) {
  const book = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error(name + ' 탭을 찾을 수 없습니다. setupTrpgWindow를 실행하세요.');
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureSheet_(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, requiredHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return;
  }
  const width = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(value => String(value).trim());
  const missing = requiredHeaders.filter(header => !current.includes(header));
  if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
}

function readTable_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(value => String(value).trim());
  const rows = values.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
  return { headers, rows };
}

function setCellByHeader_(sheet, headers, row, header, value) {
  const column = headers.indexOf(header);
  if (column < 0) throw new Error(header + ' 열을 찾을 수 없습니다.');
  sheet.getRange(row, column + 1).setValue(value);
}

function matchingRows_(sheet, characterId) {
  const table = readTable_(sheet);
  if (!table.headers.includes('character_id')) throw new Error('character_id 열을 찾을 수 없습니다.');
  const id = String(characterId).trim();
  const rows = [];
  table.rows.forEach((row, index) => { if (String(row.character_id).trim() === id) rows.push(index + 2); });
  return rows;
}

function deleteRows_(sheet, rows) {
  rows.slice().sort((a, b) => b - a).forEach(row => sheet.deleteRow(row));
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function errorMessage_(error) {
  return String(error && error.message ? error.message : error || '알 수 없는 오류').slice(0, 1200);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

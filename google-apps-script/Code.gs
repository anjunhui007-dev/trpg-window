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
const GEMINI_COMMANDS = ['upsert_character', 'set_speakers', 'grant_equipment', 'grant_essence', 'grant_inventory', 'remove_inventory', 'award_experience', 'increase_stats', 'increase_special_stats', 'set_trait', 'set_state'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TRPG Window')
    .addItem('초기 설정 확인', 'setupTrpgWindow')
    .addItem('쓰기 토큰 설정', 'configureWriteToken')
    .addItem('Gemini API 키 설정', 'configureGeminiApiKey')
    .addToUi();
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'TRPG Window Bridge', model: CONFIG.geminiModel, version: '2.0.0' });
}

function doPost(event) {
  try {
    const request = parseRequest_(event);
    authorize_(request.token);
    validateRequest_(request);
    switch (request.action) {
      case 'geminiChat': return jsonResponse_(geminiChat_(request));
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
  const actions = ['geminiChat', 'readPendingCommands', 'updateCommandStatus', 'upsertCharacter', 'previewCharacterCommands', 'deleteCharacterCommands'];
  if (!actions.includes(request.action)) throw new Error('허용되지 않은 작업입니다.');
  if (request.spreadsheetId !== CONFIG.spreadsheetId) throw new Error('허용되지 않은 스프레드시트입니다.');
  const expectedSheet = request.action === 'upsertCharacter' ? CONFIG.characterSheet : CONFIG.commandSheet;
  if (request.sheetName !== expectedSheet) throw new Error('허용되지 않은 시트 탭입니다.');
  if (request.action === 'geminiChat' && !String(request.message || '').trim()) throw new Error('플레이어 메시지가 필요합니다.');
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
  if (!messages.length && !commands.length) throw new Error('Gemini 응답에 표시할 메시지나 적용할 명령이 없습니다.');
  return { ok: true, model: CONFIG.geminiModel, messages, commands };
}

function buildGeminiPrompt_(request) {
  const gmRules = String(request.gmRules || '기본 CHRONICLE 규칙을 따른다.').slice(0, 12000);
  const sheetRules = String(request.sheetRules || '').slice(0, 8000);
  const context = JSON.stringify({ gameState: request.gameState || {}, recentHistory: Array.isArray(request.history) ? request.history.slice(-24) : [], playerMessage: String(request.message || '').slice(0, 4000) });
  return [
    '당신은 중세 판타지 TRPG CHRONICLE의 공정하고 생생한 게임 마스터다.',
    '플레이어 선택의 결과를 서술하고 NPC의 성격과 장기기억을 일관되게 유지한다.',
    '플레이어의 대사나 선택을 대신 결정하지 않는다.',
    '위치와 지도는 자동으로 변경하지 않는다.',
    '상태가 실제로 변할 때만 commands를 만들고 게임 상태 전체를 덮어쓰지 않는다.',
    '새 NPC는 upsert_character로 먼저 등록하고 같은 응답의 npc 메시지에서 동일한 id를 사용한다.',
    '반드시 다른 설명 없이 JSON 객체 하나만 반환한다.',
    '응답 형식: {"messages":[{"type":"gm|npc|system","speakerId":"","speakerName":"","text":"","action":""}],"commands":[{"command_type":"명령","payload":{}}]}',
    '사용 가능한 명령: ' + GEMINI_COMMANDS.join(', '),
    'GM 규칙: ' + gmRules,
    '시트/명령 규칙: ' + sheetRules,
    '현재 입력: ' + context
  ].join('\n\n');
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

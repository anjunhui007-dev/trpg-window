const TRPG_SPREADSHEET_ID = '1OYLMOUWbP8e8Xww-Yq5W_dXHzWm7HZqWHYiZFVhrbrg';
const TRPG_COMMAND_SHEET = 'TRPG_COMMANDS';
const TRPG_CHARACTER_SHEET = 'TRPG_CHARACTERS';
const TOKEN_PROPERTY = 'TRPG_WRITE_TOKEN';
const GEMINI_KEY_PROPERTY = 'TRPG_GEMINI_API_KEY';

function doGet() {
  return json_({ ok: true, service: 'TRPG Window Sheet Writer' });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    const request = JSON.parse(event?.postData?.contents || '{}');
    authorize_(request.token);
    validateRequest_(request);
    lock.waitLock(10000);
    const book = SpreadsheetApp.openById(TRPG_SPREADSHEET_ID);
    if (request.action === 'geminiChat') return json_(geminiChat_(request));
    if (request.action === 'readPendingCommands') {
      const commandSheet = book.getSheetByName(TRPG_COMMAND_SHEET);
      if (!commandSheet) throw new Error('TRPG_COMMANDS 탭을 찾을 수 없습니다.');
      return json_({ ok: true, commands: pendingCommands_(commandSheet) });
    }
    if (request.action === 'updateCommandStatus') {
      const commandSheet = book.getSheetByName(TRPG_COMMAND_SHEET);
      if (!commandSheet) throw new Error('TRPG_COMMANDS 탭을 찾을 수 없습니다.');
      return json_(updateCommandStatus_(commandSheet, request));
    }
    if (request.action === 'upsertCharacter') {
      const characterSheet = book.getSheetByName(TRPG_CHARACTER_SHEET);
      if (!characterSheet) throw new Error('TRPG_CHARACTERS 탭을 찾을 수 없습니다.');
      upsertCharacter_(characterSheet, request);
      return json_({ ok: true, characterId: request.characterId, name: request.name });
    }
    const sheet = book.getSheetByName(TRPG_COMMAND_SHEET);
    const characterSheet = book.getSheetByName(TRPG_CHARACTER_SHEET);
    if (!sheet) throw new Error('TRPG_COMMANDS 탭을 찾을 수 없습니다.');
    const matches = matchingRows_(sheet, request.characterId);
    const characterMatches = characterSheet ? matchingRows_(characterSheet, request.characterId) : [];
    if (request.action === 'previewCharacterCommands') {
      return json_({ ok: true, count: matches.length + characterMatches.length, commandCount: matches.length, characterCount: characterMatches.length, characterId: request.characterId });
    }
    if (request.action === 'deleteCharacterCommands') {
      deleteRows_(sheet, matches);
      if (characterSheet) deleteRows_(characterSheet, characterMatches);
      return json_({ ok: true, deleted: matches.length + characterMatches.length, deletedCommands: matches.length, deletedCharacters: characterMatches.length, characterId: request.characterId });
    }
    throw new Error('지원하지 않는 작업입니다.');
  } catch (error) {
    return json_({ ok: false, error: String(error?.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function configureWriteToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'TRPG Window 쓰기 토큰 설정',
    '길고 추측하기 어려운 문자열을 입력하세요. 앱 설정에도 같은 값을 저장합니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const token = response.getResponseText().trim();
  if (token.length < 20) throw new Error('보안 토큰은 20자 이상이어야 합니다.');
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, token);
  ui.alert('쓰기 토큰을 저장했습니다.');
}

function configureGeminiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Gemini API 키 설정',
    'Google AI Studio에서 만든 Gemini API 키를 입력하세요. 키는 Script Properties에만 저장되며 웹앱으로 전송되지 않습니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const key = response.getResponseText().trim();
  if (key.length < 20) throw new Error('Gemini API 키 형식이 올바르지 않습니다.');
  PropertiesService.getScriptProperties().setProperty(GEMINI_KEY_PROPERTY, key);
  ui.alert('Gemini API 키를 안전한 Script Properties에 저장했습니다.');
}

function authorize_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!expected) throw new Error('Apps Script 쓰기 토큰이 설정되지 않았습니다.');
  if (!token || token !== expected) throw new Error('쓰기 토큰이 올바르지 않습니다.');
}

function validateRequest_(request) {
  if (request.spreadsheetId !== TRPG_SPREADSHEET_ID) throw new Error('허용되지 않은 스프레드시트입니다.');
  const expectedSheet = request.action === 'upsertCharacter' ? TRPG_CHARACTER_SHEET : TRPG_COMMAND_SHEET;
  if (request.sheetName !== expectedSheet) throw new Error('허용되지 않은 시트 탭입니다.');
  if (['readPendingCommands', 'updateCommandStatus', 'geminiChat'].includes(request.action)) {
    if (request.action === 'updateCommandStatus' && !String(request.commandId || '').trim()) throw new Error('command_id가 필요합니다.');
    if (request.action === 'geminiChat' && !String(request.message || '').trim()) throw new Error('플레이어 메시지가 필요합니다.');
    return;
  }
  const id = String(request.characterId || '').trim();
  if (!/^character_[a-z0-9_]+$/i.test(id)) throw new Error('캐릭터 ID 형식이 올바르지 않습니다.');
}

function geminiChat_(request) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_KEY_PROPERTY);
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. Apps Script에서 configureGeminiApiKey를 실행하세요.');
  const allowedCommands = ['upsert_character','set_speakers','grant_equipment','grant_essence','grant_inventory','remove_inventory','award_experience','increase_stats','increase_special_stats','set_trait','set_state'];
  const systemPrompt = `당신은 중세 판타지 TRPG CHRONICLE의 공정하고 생생한 게임 마스터다. 플레이어 선택의 결과를 서술하고, NPC의 성격과 장기기억을 일관되게 유지한다. 응답은 반드시 JSON 객체 하나만 반환한다. 형식은 {"messages":[{"type":"gm|npc|system","speakerId":"NPC id 또는 빈 문자열","speakerName":"이름 또는 빈 문자열","text":"대사 또는 진행문","action":"행동 묘사 또는 빈 문자열"}],"commands":[{"command_type":"명령","payload":{}}]}다. GM 일반 진행은 gm, NPC의 말과 행동은 npc로 분리한다. 플레이어의 대사를 대신 결정하지 않는다. 상태가 실제로 변할 때만 commands를 만든다. 사용할 수 있는 명령은 ${allowedCommands.join(', ')}뿐이다. 새 NPC는 upsert_character로 먼저 등록하고 같은 응답의 npc 메시지에서 동일 id를 사용한다. 위치와 지도는 자동으로 변경하지 않는다. 게임 상태를 통째로 덮어쓰지 말고 가능한 한 작은 명령을 사용한다. GM 규칙: ${String(request.gmRules || '기본 CHRONICLE 규칙을 따른다.').slice(0,12000)} 시트/명령 규칙: ${String(request.sheetRules || '').slice(0,8000)}`;
  const context = JSON.stringify({ gameState: request.gameState || {}, recentHistory: request.history || [], playerMessage: request.message });
  const response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n현재 입력:\n' + context }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 4096 } })
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Gemini API 오류: ' + response.getContentText().slice(0,500));
  const raw = JSON.parse(response.getContentText());
  const text = (((raw.candidates || [])[0] || {}).content?.parts || []).map(part => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini가 빈 응답을 반환했습니다.');
  let result;
  try { result = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch (error) { throw new Error('Gemini 응답 JSON을 해석할 수 없습니다.'); }
  result.messages = Array.isArray(result.messages) ? result.messages.slice(0,12) : [];
  result.commands = (Array.isArray(result.commands) ? result.commands : []).filter(command => allowedCommands.includes(String(command.command_type || command.type || '').toLowerCase())).slice(0,20);
  return { ok: true, messages: result.messages, commands: result.commands };
}

function pendingCommands_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0].map(value => String(value).trim());
  const statusColumn = headers.indexOf('status');
  if (statusColumn < 0) throw new Error('status 열을 찾을 수 없습니다.');
  return values.slice(1).filter(row => {
    const status = String(row[statusColumn] || 'pending').trim().toLowerCase();
    return !status || status === 'pending';
  }).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function updateCommandStatus_(sheet, request) {
  const allowed = ['processing', 'applied', 'failed'];
  const nextStatus = String(request.status || '').trim().toLowerCase();
  if (!allowed.includes(nextStatus)) throw new Error('허용되지 않은 status입니다.');
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0] || [];
  const idColumn = headers.indexOf('command_id');
  const statusColumn = headers.indexOf('status');
  const resultColumn = headers.indexOf('result_json');
  const processedColumn = headers.indexOf('processed_at');
  if ([idColumn, statusColumn, resultColumn, processedColumn].some(index => index < 0)) throw new Error('명령 결과 열 구성이 올바르지 않습니다.');
  const commandId = String(request.commandId).trim();
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[idColumn]).trim() === commandId);
  if (rowIndex < 0) throw new Error('command_id를 찾을 수 없습니다.');
  const sheetRow = rowIndex + 1;
  sheet.getRange(sheetRow, statusColumn + 1).setValue(nextStatus);
  sheet.getRange(sheetRow, resultColumn + 1).setValue(JSON.stringify(request.result || {}));
  sheet.getRange(sheetRow, processedColumn + 1).setValue(['applied', 'failed'].includes(nextStatus) ? (request.processedAt || new Date().toISOString()) : '');
  return { ok: true, commandId, status: nextStatus };
}

function upsertCharacter_(sheet, request) {
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0] || [];
  const idColumn = headers.indexOf('character_id');
  if (idColumn < 0) throw new Error('character_id 열을 찾을 수 없습니다.');
  let targetRow = values.findIndex((row, index) => index > 0 && String(row[idColumn]).trim() === request.characterId) + 1;
  const now = new Date().toISOString();
  const existingCreated = targetRow > 0 ? values[targetRow - 1][headers.indexOf('created_at')] : '';
  const row = [request.characterId, String(request.name || '이름 없음'), Number(request.level) || 1, String(request.title || '모험가'), existingCreated || request.createdAt || now, now, 'active', JSON.stringify(request.profile || {})];
  if (targetRow > 0) sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function matchingRows_(sheet, characterId) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const column = values[0].indexOf('character_id');
  if (column < 0) throw new Error('character_id 열을 찾을 수 없습니다.');
  const id = String(characterId).trim();
  const rows = [];
  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][column]).trim() === id) rows.push(row + 1);
  }
  return rows;
}

function deleteRows_(sheet, rows) {
  const descending = rows.slice().sort((a, b) => b - a);
  let index = 0;
  while (index < descending.length) {
    let top = descending[index];
    let bottom = top;
    index += 1;
    while (index < descending.length && descending[index] === bottom - 1) {
      bottom = descending[index];
      index += 1;
    }
    sheet.deleteRows(bottom, top - bottom + 1);
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

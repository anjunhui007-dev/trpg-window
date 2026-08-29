const TRPG_SPREADSHEET_ID = '1OYLMOUWbP8e8Xww-Yq5W_dXHzWm7HZqWHYiZFVhrbrg';
const TRPG_COMMAND_SHEET = 'TRPG_COMMANDS';
const TRPG_CHARACTER_SHEET = 'TRPG_CHARACTERS';
const TOKEN_PROPERTY = 'TRPG_WRITE_TOKEN';

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

function authorize_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!expected) throw new Error('Apps Script 쓰기 토큰이 설정되지 않았습니다.');
  if (!token || token !== expected) throw new Error('쓰기 토큰이 올바르지 않습니다.');
}

function validateRequest_(request) {
  if (request.spreadsheetId !== TRPG_SPREADSHEET_ID) throw new Error('허용되지 않은 스프레드시트입니다.');
  const expectedSheet = request.action === 'upsertCharacter' ? TRPG_CHARACTER_SHEET : TRPG_COMMAND_SHEET;
  if (request.sheetName !== expectedSheet) throw new Error('허용되지 않은 시트 탭입니다.');
  if (['readPendingCommands', 'updateCommandStatus'].includes(request.action)) {
    if (request.action === 'updateCommandStatus' && !String(request.commandId || '').trim()) throw new Error('command_id가 필요합니다.');
    return;
  }
  const id = String(request.characterId || '').trim();
  if (!/^character_[a-z0-9_]+$/i.test(id)) throw new Error('캐릭터 ID 형식이 올바르지 않습니다.');
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

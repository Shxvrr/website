/**
 * Google Docs Writing Tracker (fast version)
 *
 * SETUP:
 * 1. script.google.com → New project → paste this entire file into Code.gs → Save
 * 2. Run "setup" (creates spreadsheet only — finishes in seconds)
 * 3. Put your writing Google Docs in one Drive folder (recommended)
 * 4. Copy the folder ID from the URL: drive.google.com/drive/folders/FOLDER_ID_HERE
 * 5. Paste it into WRITING_FOLDER_ID below → Save
 *    (includes docs in subfolders too, e.g. Writing/Drafts/article)
 * 6. Run "runNow" to count words (only scans your folder, not all of Drive)
 * 7. Run "setupDailyTrigger" for nightly updates
 * 8. Deploy web app → paste URL into writing-heatmap.js (DATA_URL)
 */

// Paste your Google Drive folder ID here (leave '' to scan only recently edited docs).
const WRITING_FOLDER_ID = '';

const SHEET_NAME = 'DailyWordCounts';
const SNAPSHOTS_SHEET = 'DocSnapshots';
const SPREADSHEET_ID_KEY = 'WRITING_TRACKER_SPREADSHEET_ID';
const MAX_DOCS_PER_RUN = 40;
const MAX_RUN_MS = 4 * 60 * 1000;
const RECENT_DAYS = 14;

function getOrCreateSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(SPREADSHEET_ID_KEY);

  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      props.deleteProperty(SPREADSHEET_ID_KEY);
    }
  }

  const ss = SpreadsheetApp.create('Writing Tracker - Google Docs Word Counts');
  props.setProperty(SPREADSHEET_ID_KEY, ss.getId());

  const daily = ss.getActiveSheet();
  daily.setName(SHEET_NAME);
  daily.getRange('A1:B1').setValues([['date', 'words']]);

  const snapshots = ss.insertSheet(SNAPSHOTS_SHEET);
  snapshots.getRange('A1:D1').setValues([['docId', 'title', 'wordCount', 'lastChecked']]);

  Logger.log('Created spreadsheet: %s', ss.getUrl());
  return ss;
}

function getSnapshotsSheet() {
  const ss = getOrCreateSpreadsheet();
  let sheet = ss.getSheetByName(SNAPSHOTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SNAPSHOTS_SHEET);
    sheet.getRange('A1:D1').setValues([['docId', 'title', 'wordCount', 'lastChecked']]);
  }
  return sheet;
}

function setup() {
  getOrCreateSpreadsheet();
  Logger.log('Setup done. Next steps:');
  Logger.log('1. Set WRITING_FOLDER_ID at the top of Code.gs (strongly recommended)');
  Logger.log('2. Run "runNow" to record today\'s words');
}

function runNow() {
  recordTodayWordCount();
}

function runQuickTest() {
  const files = getCandidateFiles(3);
  Logger.log('Quick test — checking %s doc(s):', files.length);
  files.forEach(function (file) {
    try {
      const count = countWordsInDoc(file.id);
      Logger.log('- %s: %s words', file.name, count);
    } catch (e) {
      Logger.log('- %s: error (%s)', file.name, e);
    }
  });
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'recordTodayWordCount') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('recordTodayWordCount')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  Logger.log('Daily trigger created (11 PM).');
}

function countWordsInDoc(docId) {
  const doc = DocumentApp.openById(docId);
  const text = doc.getBody().getText();
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function getRecentDateString() {
  const date = new Date();
  date.setDate(date.getDate() - RECENT_DAYS);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function collectDocsFromFolder(folder, files, max) {
  if (files.length >= max) {
    return;
  }

  const docIterator = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (docIterator.hasNext() && files.length < max) {
    const file = docIterator.next();
    files.push({ id: file.getId(), name: file.getName() });
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext() && files.length < max) {
    collectDocsFromFolder(subfolders.next(), files, max);
  }
}

function getCandidateFiles(limit) {
  const max = limit || MAX_DOCS_PER_RUN;
  const files = [];

  if (WRITING_FOLDER_ID) {
    const folder = DriveApp.getFolderById(WRITING_FOLDER_ID);
    collectDocsFromFolder(folder, files, max);
    return files;
  }

  const query = [
    "mimeType='application/vnd.google-apps.document'",
    'trashed=false',
    "modifiedDate > '" + getRecentDateString() + "'",
  ].join(' and ');

  const iterator = DriveApp.searchFiles(query);
  while (iterator.hasNext() && files.length < max) {
    const file = iterator.next();
    files.push({ id: file.getId(), name: file.getName() });
  }

  return files;
}

function loadSnapshots() {
  const sheet = getSnapshotsSheet();
  const data = sheet.getDataRange().getValues();
  const map = {};

  for (let i = 1; i < data.length; i++) {
    const docId = data[i][0];
    if (docId) {
      map[docId] = {
        wordCount: Number(data[i][2]) || 0,
        row: i + 1,
      };
    }
  }

  return { sheet: sheet, map: map };
}

function recordTodayWordCount() {
  const started = Date.now();
  const dailySheet = getOrCreateSpreadsheet().getSheetByName(SHEET_NAME);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const snapshots = loadSnapshots();
  const files = getCandidateFiles(MAX_DOCS_PER_RUN);

  if (!WRITING_FOLDER_ID) {
    Logger.log('Tip: set WRITING_FOLDER_ID for faster, more accurate tracking.');
  }

  if (files.length === 0) {
    Logger.log('No docs found. Add docs to your folder or edit a doc recently.');
    return;
  }

  let newWordsThisRun = 0;
  let processed = 0;

  files.forEach(function (file) {
    if (Date.now() - started > MAX_RUN_MS) {
      Logger.log('Time limit reached — will continue on next run.');
      return;
    }

    try {
      const currentCount = countWordsInDoc(file.id);
      const previous = snapshots.map[file.id];
      const previousCount = previous ? previous.wordCount : currentCount;
      const delta = Math.max(0, currentCount - previousCount);
      newWordsThisRun += delta;
      processed++;

      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

      if (previous) {
        snapshots.sheet.getRange(previous.row, 2, 1, 3).setValues([[file.name, currentCount, now]]);
      } else {
        snapshots.sheet.appendRow([file.id, file.name, currentCount, now]);
      }
    } catch (e) {
      Logger.log('Skipped %s: %s', file.name, e);
    }
  });

  const data = dailySheet.getDataRange().getValues();
  let rowIndex = -1;
  let existingToday = 0;

  for (let i = 1; i < data.length; i++) {
    if (formatRowDate(data[i][0]) === today) {
      rowIndex = i + 1;
      existingToday = Number(data[i][1]) || 0;
      break;
    }
  }

  const totalToday = existingToday + newWordsThisRun;

  if (rowIndex > 0) {
    dailySheet.getRange(rowIndex, 2).setValue(totalToday);
  } else if (newWordsThisRun > 0) {
    dailySheet.appendRow([today, newWordsThisRun]);
  }

  Logger.log(
    '%s: +%s words this run (%s total today). Processed %s of %s docs.',
    today,
    newWordsThisRun,
    totalToday,
    processed,
    files.length
  );
}

function formatRowDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return String(value);
}

function buildPayload() {
  const sheet = getOrCreateSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const dailyWords = {};

  for (let i = 1; i < data.length; i++) {
    const dateKey = formatRowDate(data[i][0]);
    const words = Number(data[i][1]) || 0;
    if (dateKey && words > 0) {
      dailyWords[dateKey] = words;
    }
  }

  return {
    lastUpdated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    dailyWords: dailyWords,
  };
}

function exportForWebsite() {
  const payload = buildPayload();
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function doGet() {
  const payload = buildPayload();
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function deployWebApp() {
  Logger.log([
    'Deploy → New deployment → Web app',
    'Execute as: Me | Who has access: Anyone',
    'Copy the URL into DATA_URL in writing-heatmap.js',
  ].join('\n'));
}

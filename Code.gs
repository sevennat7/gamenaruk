/**
 * =========================================================================
 * เกมผจญภัย “เกาะมหาสมบัติทศนิยม” - Google Apps Script Backend
 * เชื่อมต่อ Google Sheets ID: 1pLchi-QIHnrhpfC3r4O-1g6_pqWyf1y6EBwvUpEldHo
 * =========================================================================
 * 
 * ฟังก์ชันหลัก:
 * 1. doPost(e) : รับข้อมูลผลการเล่นเกม บันทึกลงตาราง Players, Results, Answers
 * 2. doGet(e)  : ใช้สำหรับทดสอบการเชื่อมต่อ (Ping)
 * 3. ตรวจสอบและสร้างแท็บพร้อมหัวตารางอัตโนมัติหากยังไม่มี
 * 4. ป้องกัน Formula Injection โดยใส่เครื่องหมาย ' นำหน้าข้อความที่ขึ้นต้นด้วย =, +, -, @
 * 5. ป้องกันข้อมูลซ้ำซ้อนด้วย sessionId
 * 6. ใช้ ScriptLock ป้องกันการเขียนทับพร้อมกันจากหลายไคลเอนต์
 */

// รหัส Google Sheets ตามที่ผู้ใช้กำหนด
var SPREADSHEET_ID = "1pLchi-QIHnrhpfC3r4O-1g6_pqWyf1y6EBwvUpEldHo";

/**
 * หัวตารางของแต่ละแท็บ
 */
var SCHEMA = {
  Players: ["playerId", "nickname", "grade", "createdAt"],
  Results: ["sessionId", "playerId", "score", "totalQuestions", "correctFirstTry", "completedAt"],
  Answers: ["sessionId", "questionNo", "stage", "question", "userAnswer", "correctAnswer", "attempt", "isCorrect"]
};

/**
 * ฟังก์ชันรับคำขอ POST จากหน้าเว็บเกม
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // รอ Lock ไม่เกิน 10 วินาที ป้องกันข้อมูลชนกัน
    lock.waitLock(10000);
  } catch (lockError) {
    return createJsonResponse({
      status: "error",
      message: "ระบบกำลังทำงานหนัก กรุณาลองใหม่อีกครั้ง (Lock timeout)"
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: "error",
        message: "ไม่พบข้อมูลที่ส่งมา (Empty payload)"
      });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse({
        status: "error",
        message: "รูปแบบข้อมูล JSON ไม่ถูกต้อง"
      });
    }

    var ss = getSpreadsheet();
    initSheetsIfNotExist(ss);

    // ตรวจสอบ action
    var action = data.action || "saveGame";

    if (action === "saveGame") {
      var result = handleSaveGame(ss, data);
      return createJsonResponse(result);
    } else if (action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "เชื่อมต่อ Google Apps Script สำเร็จ",
        timestamp: new Date().toISOString()
      });
    } else {
      return createJsonResponse({
        status: "error",
        message: "ไม่รู้จักคำสั่ง action: " + sanitizeText(action)
      });
    }

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: " + error.toString()
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // ปล่อย lock
    }
  }
}

/**
 * ฟังก์ชันรับคำขอ GET สำหรับทดสอบการทำงาน
 */
function doGet(e) {
  try {
    var ss = getSpreadsheet();
    initSheetsIfNotExist(ss);
    return createJsonResponse({
      status: "success",
      message: "Google Apps Script สำหรับเกมเกาะมหาสมบัติทศนิยม พร้อมทำงาน!",
      spreadsheetName: ss.getName(),
      sheets: Object.keys(SCHEMA),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "ไม่สามารถเปิด Spreadsheet ได้: " + error.toString()
    });
  }
}

/**
 * ดึงออบเจกต์ Spreadsheet ตาม ID
 */
function getSpreadsheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.trim() === "") {
    // ถ้าไม่ได้ระบุ ID ให้ใช้ Active Spreadsheet (กรณีผูก script ไว้ใน sheet)
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * ตรวจสอบและสร้างแท็บตารางพร้อม Header อัตโนมัติหากยังไม่มี
 * ห้ามลบหรือเขียนทับข้อมูลเดิม
 */
function initSheetsIfNotExist(ss) {
  for (var sheetName in SCHEMA) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = SCHEMA[sheetName];
      sheet.appendRow(headers);
      
      // จัดรูปแบบหัวตารางให้สวยงามและอ่านง่าย
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#2b6cb0");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    } else {
      // ตรวจสอบว่ามีแถวหัวตารางหรือไม่ ถ้าชีตว่างเปล่าให้ใส่หัวตาราง
      if (sheet.getLastRow() === 0) {
        var headers = SCHEMA[sheetName];
        sheet.appendRow(headers);
        var headerRange = sheet.getRange(1, 1, 1, headers.length);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#2b6cb0");
        headerRange.setFontColor("#ffffff");
        sheet.setFrozenRows(1);
      }
    }
  }
}

/**
 * บันทึกข้อมูลการเล่นเกมลงในชีต Players, Results, Answers
 */
function handleSaveGame(ss, data) {
  var sessionId = sanitizeText(data.sessionId);
  if (!sessionId) {
    return {
      status: "error",
      message: "ไม่พบ sessionId ที่จำเป็น"
    };
  }

  var resultsSheet = ss.getSheetByName("Results");
  var playersSheet = ss.getSheetByName("Players");
  var answersSheet = ss.getSheetByName("Answers");

  // 1. ตรวจสอบ Idempotency ป้องกันบันทึกซ้ำซ้อนด้วย sessionId
  if (isSessionAlreadyRecorded(resultsSheet, sessionId)) {
    return {
      status: "success",
      message: "ผลคะแนนรอบนี้ (sessionId: " + sessionId + ") ได้รับการบันทึกไว้เรียบร้อยแล้ว",
      alreadyRecorded: true,
      sessionId: sessionId
    };
  }

  var player = data.player || {};
  var result = data.result || {};
  var answers = Array.isArray(data.answers) ? data.answers : [];

  var playerId = sanitizeText(player.playerId || result.playerId || ("p_" + new Date().getTime()));
  var nickname = sanitizeText(player.nickname || "นักสำรวจนิรนาม");
  var grade = sanitizeText(player.grade || "ป.4");
  var playerCreatedAt = player.createdAt || new Date().toISOString();

  // 2. บันทึก/อัปเดตข้อมูลผู้เล่นใน Players (บันทึกเฉพาะเมื่อยังไม่มี playerId นี้ หรือบันทึกประวัติ)
  if (!isPlayerExists(playersSheet, playerId)) {
    playersSheet.appendRow([
      playerId,
      nickname,
      grade,
      playerCreatedAt
    ]);
  }

  // 3. บันทึกผลลัพธ์ใน Results
  var score = Number(result.score) || 0;
  var totalQuestions = Number(result.totalQuestions) || answers.length || 15;
  var correctFirstTry = Number(result.correctFirstTry) || 0;
  var completedAt = result.completedAt || new Date().toISOString();

  resultsSheet.appendRow([
    sessionId,
    playerId,
    score,
    totalQuestions,
    correctFirstTry,
    completedAt
  ]);

  // 4. บันทึกรายละเอียดคำตอบแต่ละข้อใน Answers
  if (answers.length > 0) {
    var answerRows = [];
    for (var i = 0; i < answers.length; i++) {
      var ans = answers[i];
      answerRows.push([
        sessionId,
        Number(ans.questionNo) || (i + 1),
        Number(ans.stage) || 1,
        sanitizeText(ans.question || ""),
        sanitizeText(ans.userAnswer || ""),
        sanitizeText(ans.correctAnswer || ""),
        Number(ans.attempt) || 1,
        ans.isCorrect === true || ans.isCorrect === "true" ? true : false
      ]);
    }
    
    // บันทึกแบบ Batch เพื่อประสิทธิภาพสูงสุด
    if (answerRows.length > 0) {
      var startRow = answersSheet.getLastRow() + 1;
      var range = answersSheet.getRange(startRow, 1, answerRows.length, SCHEMA.Answers.length);
      range.setValues(answerRows);
    }
  }

  return {
    status: "success",
    message: "บันทึกผลคะแนนและรายละเอียดคำตอบสำเร็จ!",
    sessionId: sessionId,
    playerId: playerId,
    recordedAnswersCount: answers.length
  };
}

/**
 * ตรวจสอบว่า sessionId นี้ถูกบันทึกไว้ใน Results หรือยัง
 */
function isSessionAlreadyRecorded(resultsSheet, sessionId) {
  var lastRow = resultsSheet.getLastRow();
  if (lastRow <= 1) return false;

  // อ่านคอลัมน์ A (sessionId) ทั้งหมด
  var values = resultsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(sessionId)) {
      return true;
    }
  }
  return false;
}

/**
 * ตรวจสอบว่า playerId นี้มีอยู่ใน Players หรือยัง
 */
function isPlayerExists(playersSheet, playerId) {
  var lastRow = playersSheet.getLastRow();
  if (lastRow <= 1) return false;

  var values = playersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(playerId)) {
      return true;
    }
  }
  return false;
}

/**
 * ป้องกัน Formula Injection ใน Google Sheets
 * หากข้อความเริ่มต้นด้วย =, +, -, @, \t, \r จะทำการใส่ ' นำหน้า
 * เพื่อให้ Google Sheets มองเป็นข้อความธรรมดา ไม่ประมวลผลเป็นสูตร
 */
function sanitizeText(val) {
  if (val === null || val === undefined) return "";
  var str = String(val).trim();
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * สร้าง Response ในรูปแบบ JSON
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

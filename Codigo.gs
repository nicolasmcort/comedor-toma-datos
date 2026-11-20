/**
 * Apps Script → Google Sheets + Drive
 *
 * HOJA (cuenta personal):
 * https://docs.google.com/spreadsheets/d/1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4/edit
 * FOTOS: carpeta Drive "Evidencias Comedor" (se crea sola en la 1ª subida)
 *
 * BACKUP: cada escritura también va a eventos_backup / sesiones_backup.
 * Una vez: ejecuta crearBackupCompleto() desde el editor para copiar lo ya existente.
 *
 * Si cambias este archivo: vuelve a Implementar → Nueva versión (misma URL /exec).
 */

var SPREADSHEET_ID = "1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4";
var FOLDER_NAME = "Evidencias Comedor";
var APP_PASSWORD = "unalcomedor";
var PRESENCE_TTL_MS = 3 * 60 * 1000; // 3 min sin heartbeat = ausente

var EVENTOS_HEADERS = [
  "id", "session_id", "fecha", "hora", "timestamp_iso", "timestamp_ms",
  "rol", "rol_descripcion", "observador", "evento", "evento_descripcion",
  "piso", "valor_extra", "notas", "origen"
];
var SESIONES_HEADERS = [
  "session_id", "fecha", "hora_inicio", "hora_fin", "timestamp_inicio",
  "timestamp_fin_iso", "rol", "rol_descripcion", "observador",
  "total_eventos", "duracion_segundos", "notas"
];

function doGet() {
  return json_({ ok: true, service: "comedor-toma-datos", version: 8, folder: FOLDER_NAME });
}

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    if (!data.password || String(data.password) !== APP_PASSWORD) {
      return json_({ ok: false, error: "No autorizado" });
    }
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.type === "evento" && data.row) {
      var id = String(data.row[0]);
      appendEvento_(ss, data.row);
      return json_({ ok: true, type: "evento", id: id });
    }

    if (data.type === "sesion" && data.row) {
      var sid = String(data.row[0]);
      var action = upsertSesionConBackup_(ss, data.row);
      return json_({ ok: true, type: "sesion", id: sid, action: action });
    }

    if (data.type === "batch" && data.eventos) {
      var added = 0;
      data.eventos.forEach(function (row) {
        if (appendEvento_(ss, row)) added++;
      });
      return json_({ ok: true, type: "batch", added: added });
    }

    if (data.type === "evidencia" && data.meta && data.base64) {
      var result = saveEvidence_(data);
      if (data.eventRow && data.eventRow.length) {
        if (!data.eventRow[13]) data.eventRow[13] = result.url;
        appendEvento_(ss, data.eventRow);
      }
      return json_({ ok: true, type: "evidencia", id: data.meta.id, url: result.url, fileId: result.id });
    }

    if (data.type === "presencia_set" && data.presencia) {
      upsertPresencia_(ss, data.presencia);
      return json_({ ok: true, type: "presencia_set" });
    }

    if (data.type === "presencia_get") {
      return json_({ ok: true, type: "presencia_get", presencia: listPresencia_(ss) });
    }

    return json_({ ok: false, error: "payload desconocido" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Ejecutar UNA VEZ desde el editor (▶ Run) después de pegar este código.
 * Copia todo lo actual de eventos/sesiones hacia las hojas *_backup (sin borrar el backup).
 */
function crearBackupCompleto() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var ev = ensureSheet_(ss, "eventos", EVENTOS_HEADERS);
  var evB = ensureSheet_(ss, "eventos_backup", EVENTOS_HEADERS);
  var se = ensureSheet_(ss, "sesiones", SESIONES_HEADERS);
  var seB = ensureSheet_(ss, "sesiones_backup", SESIONES_HEADERS);

  var nEv = mirrorById_(ev, evB);
  var nSe = mirrorById_(se, seB);
  SpreadsheetApp.flush();
  Logger.log("Backup listo. Eventos nuevos/actualizados en backup: " + nEv + ". Sesiones: " + nSe);
  return { eventos: nEv, sesiones: nSe };
}

function appendEvento_(ss, row) {
  var sh = ensureSheet_(ss, "eventos", EVENTOS_HEADERS);
  var bak = ensureSheet_(ss, "eventos_backup", EVENTOS_HEADERS);
  var id = String(row[0] || "");
  var added = false;
  if (id && !idExists_(sh, id)) {
    sh.appendRow(row);
    added = true;
  }
  if (id && !idExists_(bak, id)) {
    bak.appendRow(row);
  }
  return added;
}

function upsertSesionConBackup_(ss, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = ensureSheet_(ss, "sesiones", SESIONES_HEADERS);
    var bak = ensureSheet_(ss, "sesiones_backup", SESIONES_HEADERS);
    var action = upsertSessionUnlocked_(sh, row);
    upsertSessionUnlocked_(bak, row);
    return action;
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getLastRow() < 1 && headers && headers.length) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Copia filas de origen → destino por id (col A). No borra filas del destino. */
function mirrorById_(src, dst) {
  var last = src.getLastRow();
  if (last < 2) return 0;
  var width = Math.max(src.getLastColumn(), dst.getLastColumn(), 1);
  var values = src.getRange(2, 1, last, width).getValues();
  var changed = 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || "").trim();
    if (!id) continue;
    var existing = findRowById_(dst, id);
    if (existing < 0) {
      dst.appendRow(row);
      changed++;
    } else {
      dst.getRange(existing, 1, existing, row.length).setValues([row]);
      changed++;
    }
  }
  return changed;
}

function findRowById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return -1;
}

function ensurePresenciaSheet_(ss) {
  var sh = ss.getSheetByName("presencia");
  if (!sh) {
    sh = ss.insertSheet("presencia");
    sh.appendRow([
      "observador", "rol", "estado", "session_id",
      "fecha", "hora", "updated_iso", "updated_ms"
    ]);
  }
  return sh;
}

function upsertPresencia_(ss, p) {
  var sh = ensurePresenciaSheet_(ss);
  var last = sh.getLastRow();
  var row = [
    p.observador || "",
    p.rol || "",
    p.estado || "en_app",
    p.session_id || "",
    p.fecha || "",
    p.hora || "",
    p.updated_iso || new Date().toISOString(),
    p.updated_ms || Date.now()
  ];
  if (last < 2) {
    sh.appendRow(row);
    return;
  }
  var names = sh.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(p.observador)) {
      sh.getRange(i + 2, 1, i + 2, row.length).setValues([row]);
      return;
    }
  }
  sh.appendRow(row);
}

function listPresencia_(ss) {
  var sh = ensurePresenciaSheet_(ss);
  var last = sh.getLastRow();
  var out = [];
  if (last < 2) return out;
  var values = sh.getRange(2, 1, last, 8).getValues();
  var now = Date.now();
  for (var i = 0; i < values.length; i++) {
    var updatedMs = Number(values[i][7]) || 0;
    var estado = String(values[i][2] || "");
    var stale = updatedMs && (now - updatedMs > PRESENCE_TTL_MS);
    if (stale && estado !== "fin") estado = "ausente";
    out.push({
      observador: String(values[i][0] || ""),
      rol: String(values[i][1] || ""),
      estado: estado,
      session_id: String(values[i][3] || ""),
      fecha: String(values[i][4] || ""),
      hora: String(values[i][5] || ""),
      updated_iso: String(values[i][6] || ""),
      updated_ms: updatedMs
    });
  }
  return out;
}

function saveEvidence_(data) {
  var folder = getOrCreateFolder_();
  var mime = data.mime || "image/jpeg";
  var name = data.meta.nombre_archivo || (data.meta.id + ".jpg");
  var b64 = String(data.base64).replace(/^data:[^;]+;base64,/, "");
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: file.getUrl() };
}

function getOrCreateFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function idExists_(sheet, id) {
  if (!id) return false;
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return true;
  }
  return false;
}

function upsertSessionUnlocked_(sheet, row) {
  var sid = String(row[0] || "").trim();
  var last = sheet.getLastRow();
  if (!sid || last < 2) {
    sheet.appendRow(row);
    return "created";
  }
  var ids = sheet.getRange(2, 1, last, 1).getValues();
  var first = -1;
  var extras = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === sid) {
      if (first < 0) first = i + 2;
      else extras.push(i + 2);
    }
  }
  if (first < 0) {
    sheet.appendRow(row);
    return "created";
  }
  sheet.getRange(first, 1, first, row.length).setValues([row]);
  SpreadsheetApp.flush();
  for (var j = extras.length - 1; j >= 0; j--) {
    sheet.deleteRow(extras[j]);
  }
  return "updated";
}

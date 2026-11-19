/**
 * Apps Script → Google Sheets + Drive
 *
 * HOJA (cuenta personal):
 * https://docs.google.com/spreadsheets/d/1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4/edit
 * FOTOS: carpeta Drive "Evidencias Comedor" (se crea sola en la 1ª subida)
 *
 * Si cambias este archivo: vuelve a Implementar → Nueva versión (misma URL /exec).
 */

var SPREADSHEET_ID = "1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4";
var FOLDER_NAME = "Evidencias Comedor";
var APP_PASSWORD = "unalcomedor";
var PRESENCE_TTL_MS = 3 * 60 * 1000; // 3 min sin heartbeat = ausente

function doGet() {
  return json_({ ok: true, service: "comedor-toma-datos", version: 6, folder: FOLDER_NAME });
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
      var sh = ss.getSheetByName("eventos");
      var id = String(data.row[0]);
      if (!idExists_(sh, id)) sh.appendRow(data.row);
      return json_({ ok: true, type: "evento", id: id });
    }

    if (data.type === "sesion" && data.row) {
      var sh2 = ss.getSheetByName("sesiones");
      var sid = String(data.row[0]);
      upsertSession_(sh2, data.row);
      return json_({ ok: true, type: "sesion", id: sid });
    }

    if (data.type === "batch" && data.eventos) {
      var sh3 = ss.getSheetByName("eventos");
      var added = 0;
      data.eventos.forEach(function (row) {
        if (!idExists_(sh3, String(row[0]))) {
          sh3.appendRow(row);
          added++;
        }
      });
      return json_({ ok: true, type: "batch", added: added });
    }

    if (data.type === "evidencia" && data.meta && data.base64) {
      var result = saveEvidence_(data);
      if (data.eventRow && data.eventRow.length) {
        var shEv = ss.getSheetByName("eventos");
        var eid = String(data.eventRow[0]);
        if (!data.eventRow[13]) data.eventRow[13] = result.url;
        if (!idExists_(shEv, eid)) shEv.appendRow(data.eventRow);
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
    if (String(values[i][0]) === id) return true;
  }
  return false;
}

/** Actualiza la 1ª fila con ese session_id; borra duplicados; si no existe, append. */
function upsertSession_(sheet, row) {
  var sid = String(row[0] || "");
  var last = sheet.getLastRow();
  if (!sid || last < 2) {
    sheet.appendRow(row);
    return;
  }
  var ids = sheet.getRange(2, 1, last, 1).getValues();
  var first = -1;
  var extras = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === sid) {
      if (first < 0) first = i + 2;
      else extras.push(i + 2);
    }
  }
  if (first < 0) {
    sheet.appendRow(row);
    return;
  }
  sheet.getRange(first, 1, first, row.length).setValues([row]);
  // borrar duplicados de abajo hacia arriba
  for (var j = extras.length - 1; j >= 0; j--) {
    sheet.deleteRow(extras[j]);
  }
}
